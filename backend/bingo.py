import json
import os
import random
import threading

import anthropic
from pydantic import BaseModel

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")

PHRASES = [
    "circle back",
    "low-hanging fruit",
    "let's take this offline",
    "move the needle",
    "synergy",
    "boil the ocean",
    "per my last email",
    "deep dive",
    "bandwidth",
    "touch base",
    "think outside the box",
    "action item",
    "quick win",
    "game changer",
    "leverage",
    "paradigm shift",
    "drill down",
    "loop in",
    "on the same page",
    "best practice",
    "value add",
    "going forward",
    "at the end of the day",
    "ping me",
    "table this",
]

GRID_SIZE = 5

CHECK_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "phrase": {"type": "string"},
                    "matched": {"type": "boolean"},
                    "evidence": {
                        "anyOf": [{"type": "string"}, {"type": "null"}],
                        "description": (
                            "A short quote from the transcript supporting the "
                            "match, or null if matched is false."
                        ),
                    },
                },
                "required": ["phrase", "matched", "evidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are judging a meeting transcript against a list of \
meeting-cliche bingo phrases. For each phrase, decide whether its underlying \
idea was expressed anywhere in the transcript -- paraphrases, synonyms, and \
different wording all count as a match. A literal substring match is not \
required, but the connection must be clear and not a stretch. Mark a phrase \
as matched only if you can point to a specific supporting line."""


_client: anthropic.Anthropic | None = None
_client_lock = threading.Lock()


def _get_client() -> anthropic.Anthropic:
    global _client
    with _client_lock:
        if _client is None:
            _client = anthropic.Anthropic()
    return _client


class BingoCheckError(Exception):
    """Raised when the Claude API call or response parsing fails."""


class PhraseResult(BaseModel):
    phrase: str
    matched: bool
    evidence: str | None


def get_card() -> list[str]:
    """Return the fixed phrase pool shuffled into a GRID_SIZE x GRID_SIZE card."""
    card = PHRASES.copy()
    random.shuffle(card)
    return card[: GRID_SIZE * GRID_SIZE]


def check_transcript(transcript: str, phrases: list[str]) -> list[dict]:
    """Ask Claude which phrases' ideas were expressed in the transcript."""
    client = _get_client()

    user_message = (
        "Transcript:\n"
        f"{transcript}\n\n"
        "Bingo phrases to check:\n"
        + "\n".join(f"- {phrase}" for phrase in phrases)
    )

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": CHECK_RESULT_SCHEMA}},
            messages=[{"role": "user", "content": user_message}],
        )
    except anthropic.APIConnectionError as e:
        raise BingoCheckError("Could not reach the Claude API. Check your network connection.") from e
    except anthropic.AuthenticationError as e:
        raise BingoCheckError("Claude API authentication failed. Check ANTHROPIC_API_KEY.") from e
    except anthropic.RateLimitError as e:
        raise BingoCheckError("Claude API rate limit hit. Wait a moment and try again.") from e
    except anthropic.APIStatusError as e:
        raise BingoCheckError(f"Claude API error ({e.status_code}). Try again.") from e

    try:
        text = next(block.text for block in response.content if block.type == "text")
        raw_results = json.loads(text)["results"]
        return [PhraseResult.model_validate(r).model_dump() for r in raw_results]
    except (StopIteration, json.JSONDecodeError, KeyError, ValueError) as e:
        raise BingoCheckError("Claude returned an unexpected response format.") from e


def find_winning_line(matched: set[str], card: list[str]) -> list[str] | None:
    """Return the 5 phrases forming the first complete line, or None."""
    if len(card) != GRID_SIZE * GRID_SIZE:
        raise ValueError(f"card must have {GRID_SIZE * GRID_SIZE} entries, got {len(card)}")

    grid = [card[row * GRID_SIZE : (row + 1) * GRID_SIZE] for row in range(GRID_SIZE)]

    lines = list(grid)  # rows
    lines += [[grid[row][col] for row in range(GRID_SIZE)] for col in range(GRID_SIZE)]  # columns
    lines.append([grid[i][i] for i in range(GRID_SIZE)])  # main diagonal
    lines.append([grid[i][GRID_SIZE - 1 - i] for i in range(GRID_SIZE)])  # anti-diagonal

    for line in lines:
        if all(phrase in matched for phrase in line):
            return line
    return None


def detect_bingo(phrases: list[str], matched_phrases: set[str]) -> bool:
    """Check whether any row, column, or diagonal of the card is fully matched."""
    return find_winning_line(matched_phrases, phrases) is not None
