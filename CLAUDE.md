# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All backend commands run from `backend/`:

```bash
# Run the server (serves both API and frontend on http://localhost:8000)
cd backend && uvicorn main:app --reload

# Run tests
cd backend && python -m pytest

# Run a single test
cd backend && python -m pytest test_bingo.py::test_check_returns_results_and_winning_line -v
```

Setup: `cp backend/.env.example backend/.env`, then fill in `ANTHROPIC_API_KEY`. Optionally set `ANTHROPIC_MODEL` to override the default (`claude-opus-4-8`).

## Architecture

Single `uvicorn` process: FastAPI in `backend/` serves a JSON API (`/api/card`, `/api/check`) and mounts the static `frontend/` directory at `/`. No build step for the frontend.

**Key data flow:**
1. `GET /api/card` → `bingo.get_card()` shuffles `PHRASES` into a 25-element list. Card state lives client-side between calls.
2. `POST /api/check` → validates phrases, calls `bingo.check_transcript()`, which makes one structured-output Claude API call. Returns `{results, bingo, winning_line}`.
3. Frontend renders the grid, marks matched squares, highlights the specific winning row/column/diagonal via `winning_line`, and saves state to `sessionStorage` so a refresh restores the card and transcript.

**`backend/bingo.py`** owns: the phrase list, structured-output JSON schema, the single Claude API call (`_get_client()` is a lazy module-level singleton), `find_winning_line()` (also used by `detect_bingo()`), and `BingoCheckError`.

**`backend/main.py`** owns: FastAPI app, route handlers, Pydantic request/response models, startup key check, and the in-memory per-IP rate limiter (10 req/min on `/api/check`).

**Testing:** `test_bingo.py` has pure unit tests for `detect_bingo`/`find_winning_line` plus FastAPI `TestClient` integration tests that mock `bingo.check_transcript`. The route handlers are plain `def` (not `async def`) so FastAPI runs them in a threadpool; this is intentional.

## Docs

- [docs/api-reference.md](docs/api-reference.md) — endpoint contracts, request/response shapes, error codes
- [docs/architecture.md](docs/architecture.md) — Claude call mechanics, win detection, session state, rate limiting
- [docs/workshop-guide.md](docs/workshop-guide.md) — presenter script and setup checklist

## Model and cost

One Claude API call per "Check Bingo" click. Model defaults to `claude-opus-4-8`; override with `ANTHROPIC_MODEL` in `.env`. Semantic matching (not keyword search) is the core demo point — the system prompt instructs Claude to match the *idea* of each phrase, not the literal string.
