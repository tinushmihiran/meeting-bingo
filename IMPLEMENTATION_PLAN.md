# Meeting Bingo — Implementation Plan

## Review Summary

Reviewed: 2026-06-23 | Reviewers: VP Product, VP Engineering, VP Design

### Changes Applied

| # | Change |
|---|---------------------|
| 1 | Added try/except around the Claude API call in `bingo.py` (`BingoCheckError`) and surfaced it as HTTP 502 with a clear message in `main.py` and the frontend error path. |
| 2 | App now fails fast at startup in `main.py` if `ANTHROPIC_API_KEY` is unset, instead of erroring opaquely on first request. |
| 3 | Added a CSS spinner to the status line in `style.css`/`app.js` so the in-flight Claude call reads as "working," not hung. |
| 4 | Evidence quotes are now shown via a click/keyboard-accessible panel (`#evidence`) instead of a hover-only `title` attribute; matched squares are focusable with `aria-label`. |
| 5 | Matched squares now show a checkmark prefix in addition to the green background, fixing the color-only accessibility signal. |
| 6 | Added a README clarification that this demo is a single structured-output call, not a multi-step agent loop, to set accurate workshop expectations. |
| 7 | Server now validates that client-supplied `phrases` is exactly the known 25-phrase set, returning 400 otherwise. |
| 8 | Added `max_length=50000` to the `transcript` field on `CheckRequest` to bound cost/context exposure. |
| 9 | LLM JSON results are now parsed through a `PhraseResult` Pydantic model instead of raw dict indexing, for defense-in-depth. |
| 10 | Added a `# Python` section to `.gitignore` (`__pycache__/`, `*.py[cod]`, `.venv/`, etc.) before the first commit of `backend/`. |
| 11 | Added `backend/test_bingo.py` with unit tests covering `detect_bingo`'s row/column/diagonal/no-win/wrong-length cases; added `pytest` to `requirements.txt`. |
| 12 | BINGO banner now reserves layout space (`min-height`) and fades/scales in via CSS transition instead of an abrupt `display` toggle. |
| 13 | Added a "New Card" button so presenters can reshuffle without a full page reload. |
| 14 | `loadCard()` now has try/catch parity with `checkBingo()`, showing a retry-prompting error instead of hanging on "Loading card..." forever. |
| 15 | Added `response_model` typing (`CardResponse`, `CheckResponse`) to both FastAPI routes for OpenAPI accuracy. |
| 16 | Added a README cost note so presenters can budget rehearsal spend. |

### Round 2 — Changes Applied

| # | Change |
|---|---------------------|
| 17 | Card and transcript now persist to `sessionStorage` (`frontend/app.js`) so an accidental page refresh mid-demo restores state instead of silently discarding it. |
| 18 | Added `aria-live="polite"` to `#status` (`frontend/index.html`) for parity with `#evidence`, so the in-flight check and result count are announced. |
| 19 | Increased grid square font size (`frontend/style.css`, `0.75rem` → `clamp(0.85rem, 1.4vw, 1.1rem)`) for projector legibility. |

### Round 3 — Changes Applied (all remaining items resolved)

| # | Change |
|---|---------------------|
| 20 | Added FastAPI `TestClient` tests for `/api/card` and `/api/check` (invalid phrase set, success + `winning_line`, Claude failure → 502, rate-limit → 429) with `bingo.check_transcript` mocked; added `find_winning_line` unit tests. `httpx` added to `requirements.txt` for `TestClient`. |
| 21 | `bingo.find_winning_line()` now returns the matching phrases; `/api/check` returns `winning_line` in the response; frontend (`app.js`/`style.css`) highlights that specific row/column/diagonal with a pulsing outline instead of relying on the banner alone. |
| 22 | Added a "Pre-demo rehearsal checklist" to `README.md` requiring a live end-to-end run of the actual demo transcript before presenting. |
| 23 | Confirmed `/api/check`'s `def` (not `async def`) handler already runs in FastAPI's threadpool, not the event loop — documented with an inline comment in `main.py` rather than changed, since it was already correct. |
| 24 | `bingo.py` now builds the Anthropic client once via a lazy module-level singleton (`_get_client()`) instead of per-request. |
| 25 | Added a basic in-memory per-IP rate limiter (10 requests/minute) on `/api/check`, returning 429 once exceeded. |
| 26 | `MODEL` now reads from `ANTHROPIC_MODEL` env var with the existing value as default; documented (commented) in `.env.example`. |
| 27 | Added a proper `<label for="transcript">` on the textarea instead of relying on the placeholder as the only label. |
| 28 | Added a Ctrl/Cmd+Enter keyboard shortcut to submit the transcript from the textarea. |
| 29 | Pinned exact versions for all backend dependencies in `requirements.txt`. |

### Unresolved Items

None — all items from Round 1 and Round 2 reviews have been addressed.

---

## Context

This repo (`meeting-bingo`) is currently empty aside from a README ("workshop for agentic ai") and `.gitignore`. The user wants to build an agentic AI demo project for a workshop: a "Meeting Bingo" web app where a user pastes a meeting transcript, and an LLM agent reads it and marks off a bingo card of meeting clichés based on whether each phrase's *idea* was expressed — not just literal string matching. This is the part that makes it an "agentic AI" demo rather than a trivial keyword search, and is a natural, self-contained example for a workshop audience.

Decisions made with the user:
- **Match logic:** LLM-based semantic matching via the Claude API (not keyword search).
- **Input:** pasted/uploaded text transcript (no live audio).
- **Stack:** Python backend (FastAPI) + a simple web UI.

## Architecture

```
meeting-bingo/
├── backend/
│   ├── main.py            # FastAPI app, routes
│   ├── bingo.py           # card data, Claude API call, win-detection logic
│   ├── requirements.txt
│   └── .env.example       # ANTHROPIC_API_KEY=
├── frontend/
│   ├── index.html         # paste-transcript form + 5x5 grid
│   ├── app.js             # fetch calls, grid rendering, win highlighting
│   └── style.css
└── README.md              # update with setup/run instructions
```

FastAPI serves both the JSON API and the static frontend (`StaticFiles` mount) so the whole thing runs with a single `uvicorn` process — simplest possible setup for a workshop.

## Backend (`backend/bingo.py`, `backend/main.py`)

**Card data:** a fixed list of ~25 common meeting clichés (e.g. "circle back", "low-hanging fruit", "let's take this offline", "move the needle", "synergy", "boil the ocean", "per my last email", "deep dive", "bandwidth", "touch base", "think outside the box", "action item", "quick win", "game changer", "leverage", "paradigm shift", "drill down", "loop in", "on the same page", "best practice", "value add", "going forward", "at the end of the day", "ping me", "table this"). `GET /api/card` returns these shuffled into a 5x5 grid (25 squares, no free space needed since this isn't literal bingo terminology overlap).

**Matching endpoint:** `POST /api/check`
- Request: `{ "transcript": "<pasted text>", "phrases": ["circle back", ...] }` (the card currently shown to the user, so card state lives client-side between calls).
- Calls `client.messages.create` (Anthropic Python SDK, model `claude-opus-4-8`) with `output_config.format` set to a JSON schema requiring an array of `{ "phrase": str, "matched": bool, "evidence": str | null }` — one entry per input phrase. System prompt instructs Claude to mark `matched: true` only when the *idea* of the phrase was expressed in the transcript (paraphrases count, literal string match isn't required), and to quote the supporting line in `evidence`.
- Response: the matched-phrase list, plus `bingo: bool` computed server-side by checking all rows/columns/diagonals of the 5x5 grid for full matches.

Use `anthropic.Anthropic()` (reads `ANTHROPIC_API_KEY` from env) — no hardcoded keys. Reference: `python/claude-api/tool-use.md` → Structured Outputs section in the claude-api skill docs for the exact `output_config` shape.

## Frontend (`frontend/index.html`, `app.js`)

- Textarea for pasting the transcript + "Check Bingo" button.
- 5x5 grid of phrase squares, fetched from `/api/card` on load.
- On submit: POST to `/api/check` with the transcript and current card phrases; mark matched squares (e.g. green background), show the evidence quote on hover/click, and show a "BINGO!" banner if `bingo: true`.
- Plain vanilla JS, no build step — keeps the workshop demo copy-pasteable.

## Verification

1. `cd backend && pip install -r requirements.txt && uvicorn main:app --reload`
2. Open `http://localhost:8000` in a browser.
3. Confirm the 5x5 card renders with 25 distinct phrases.
4. Paste a sample transcript containing paraphrased versions of ~5+ card phrases (not exact matches — e.g. write "let's sync up later instead of going through everything now" to test it catches "circle back" semantically).
5. Click "Check Bingo", confirm the right squares light up and evidence quotes look sensible.
6. Craft a transcript that completes a full row/column to confirm the "BINGO!" banner fires.
7. Spot-check the raw `/api/check` response (e.g. via browser devtools) to confirm `output_config.format` is producing well-formed JSON every time.
