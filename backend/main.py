import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import bingo

load_dotenv()

if not os.environ.get("ANTHROPIC_API_KEY"):
    raise RuntimeError(
        "ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env "
        "and add your key."
    )

app = FastAPI(title="Meeting Bingo")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class CheckRequest(BaseModel):
    transcript: str = Field(..., max_length=50_000)
    phrases: list[str]


class CardResponse(BaseModel):
    phrases: list[str]


class CheckResponse(BaseModel):
    results: list[dict]
    bingo: bool


@app.get("/api/card", response_model=CardResponse)
def get_card() -> dict:
    return {"phrases": bingo.get_card()}


@app.post("/api/check", response_model=CheckResponse)
def check(request: CheckRequest) -> dict:
    if len(request.phrases) != bingo.GRID_SIZE * bingo.GRID_SIZE or not set(
        request.phrases
    ) <= set(bingo.PHRASES):
        raise HTTPException(status_code=400, detail="Invalid phrase set.")
    try:
        results = bingo.check_transcript(request.transcript, request.phrases)
    except bingo.BingoCheckError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    matched_phrases = {r["phrase"] for r in results if r["matched"]}
    won = bingo.detect_bingo(request.phrases, matched_phrases)
    return {"results": results, "bingo": won}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
