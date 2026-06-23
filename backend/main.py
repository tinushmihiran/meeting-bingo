import os
import time
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import bingo

load_dotenv()

app = FastAPI(title="Meeting Bingo")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

_rate_log: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10
_RATE_WINDOW = 60


def _enforce_rate_limit(ip: str) -> None:
    now = time.time()
    recent = [t for t in _rate_log[ip] if now - t < _RATE_WINDOW]
    if recent:
        _rate_log[ip] = recent
    else:
        del _rate_log[ip]  # evict stale entries to prevent unbounded growth
    if len(_rate_log[ip]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Wait a moment and try again.")
    _rate_log[ip].append(now)


class CheckRequest(BaseModel):
    transcript: str = Field(..., max_length=50_000)
    phrases: list[str]


class CardResponse(BaseModel):
    phrases: list[str]


class CheckResponse(BaseModel):
    results: list[bingo.PhraseResult]
    bingo: bool
    winning_line: list[str] | None


@app.get("/api/card", response_model=CardResponse)
def get_card() -> dict:
    return {"phrases": bingo.get_card()}


@app.post("/api/check", response_model=CheckResponse)
def check(request: CheckRequest, http_request: Request) -> dict:
    ip = http_request.client.host if http_request.client else "unknown"
    _enforce_rate_limit(ip)
    if len(request.phrases) != bingo.GRID_SIZE * bingo.GRID_SIZE or set(request.phrases) != set(bingo.PHRASES):
        raise HTTPException(status_code=400, detail="Invalid phrase set.")
    try:
        results = bingo.check_transcript(request.transcript, request.phrases)
    except bingo.BingoCheckError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    matched_phrases = {r["phrase"] for r in results if r["matched"]}
    winning_line = bingo.find_winning_line(matched_phrases, request.phrases)
    return {"results": results, "bingo": winning_line is not None, "winning_line": winning_line}


if not os.environ.get("VERCEL"):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
