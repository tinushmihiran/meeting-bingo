# Architecture Overview

## System design

```
Browser (vanilla JS, no build step)
  │
  │  GET /api/card          → shuffled phrase list (25 items)
  │  POST /api/check        → transcript + phrases → match results
  │
FastAPI app  (single uvicorn process)
  ├── main.py               routes, validation, rate limiting
  └── bingo.py              phrases, Claude call, win detection
       │
       │  one messages.create() call per check
       │
Anthropic API (claude-opus-4-8 by default)
```

FastAPI mounts `frontend/` as a static directory at `/`, so the same process serves both the API and the HTML/JS/CSS.

---

## The Claude call

`bingo.check_transcript()` makes a single `client.messages.create()` call with `output_config.format` set to a JSON schema. This forces the response into:

```json
{
  "results": [
    { "phrase": "...", "matched": true/false, "evidence": "..." }
  ]
}
```

One entry per phrase in the same order as the input. The system prompt instructs Claude to match on *idea*, not literal string, and to quote supporting evidence. The schema is defined as `CHECK_RESULT_SCHEMA` in `bingo.py`.

The Anthropic client is a lazy module-level singleton (`_get_client()`) — built once on first request, reused for all subsequent calls.

---

## Win detection

`find_winning_line(phrases, matched_phrases)` in `bingo.py` constructs all 12 lines of a 5×5 grid (5 rows + 5 columns + 2 diagonals) and returns the first fully-matched line, or `None`. `detect_bingo()` is a thin wrapper over it. The `/api/check` route returns both `bingo: bool` and `winning_line: list[str] | null` so the frontend can highlight the specific line.

---

## Card and session state

Card state lives entirely client-side. The browser stores `{phrases, transcript}` in `sessionStorage` after each successful `/api/card` load and each `/api/check` call. On page load, `loadCard()` checks `sessionStorage` first and skips the network call if a card is already there. "New Card" clears `sessionStorage` and forces a fresh `/api/card` request.

---

## Rate limiting

An in-memory dict in `main.py` (`_request_log`) maps client IP → list of monotonic timestamps. On each `/api/check` request, timestamps older than 60 s are pruned; if 10 or more remain, the request gets a 429. This resets on server restart and doesn't coordinate across multiple processes — intentional for the single-process workshop use case.

---

## Why plain `def` handlers (not `async def`)

`check()` in `main.py` is a synchronous function. FastAPI automatically runs synchronous path operation functions in a worker threadpool (via `anyio`), so the blocking Anthropic SDK call doesn't stall the event loop. This is the recommended pattern when using synchronous I/O libraries with FastAPI.
