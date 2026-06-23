# API Reference

Base URL: `http://localhost:8000`

---

## GET /api/card

Returns 25 phrases shuffled into a random order for the bingo card. Call this once on page load and store the result client-side — the server has no session state.

**Response `200 OK`**
```json
{
  "phrases": [
    "circle back",
    "synergy",
    "..."
  ]
}
```

The list always contains exactly 25 phrases drawn from the fixed pool of 25 meeting clichés. Order is randomised on every call.

---

## POST /api/check

Submits a transcript and the current card's phrase list to Claude for semantic matching.

**Request body**
```json
{
  "transcript": "string (max 50 000 chars)",
  "phrases": ["string", "..."]
}
```

`phrases` must be exactly the 25-element list that was returned by `/api/card` — the server validates this and rejects any unknown phrases.

**Response `200 OK`**
```json
{
  "results": [
    {
      "phrase": "circle back",
      "matched": true,
      "evidence": "\"Let's sync up on this after the standup.\""
    },
    {
      "phrase": "synergy",
      "matched": false,
      "evidence": null
    }
  ],
  "bingo": true,
  "winning_line": ["circle back", "deep dive", "bandwidth", "touch base", "leverage"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results` | array | One entry per phrase in the same order as the request. |
| `results[].matched` | bool | `true` if Claude found the idea expressed in the transcript (paraphrases count). |
| `results[].evidence` | string \| null | Short quote from the transcript supporting the match, or `null` if not matched. |
| `bingo` | bool | `true` if any row, column, or main/anti-diagonal is fully matched. |
| `winning_line` | string[] \| null | The 5 phrases forming the winning line, or `null` if no bingo. |

**Error responses**

| Status | Condition |
|--------|-----------|
| `400` | `phrases` is not exactly the known 25-phrase set. |
| `429` | More than 10 requests per minute from the same IP. |
| `502` | Claude API call failed (network error, auth failure, rate limit, unexpected response). Detail field has a human-readable message. |
