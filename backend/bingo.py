import random

from pydantic import BaseModel

PHRASES = [
    "actually",
    "basically",
    "literally",
    "honestly",
    "obviously",
    "you know",
    "I mean",
    "totally",
    "definitely",
    "absolutely",
    "no problem",
    "sounds good",
    "for sure",
    "makes sense",
    "exactly",
    "of course",
    "anyway",
    "just saying",
    "to be honest",
    "kind of",
    "sort of",
    "fair enough",
    "moving on",
    "at least",
    "right",
]

GRID_SIZE = 5


class BingoCheckError(Exception):
    pass


class PhraseResult(BaseModel):
    phrase: str
    matched: bool
    evidence: str | None


def get_card() -> list[str]:
    card = PHRASES.copy()
    random.shuffle(card)
    return card[: GRID_SIZE * GRID_SIZE]


def check_transcript(transcript: str, phrases: list[str]) -> list[dict]:
    """Match phrases against transcript using simple substring search."""
    lower = transcript.lower()
    results = []
    for phrase in phrases:
        phrase_lower = phrase.lower()
        if phrase_lower in lower:
            idx = lower.index(phrase_lower)
            # Grab a short excerpt around the match as evidence
            start = max(0, idx - 20)
            end = min(len(transcript), idx + len(phrase) + 20)
            excerpt = transcript[start:end].strip()
            results.append(PhraseResult(phrase=phrase, matched=True, evidence=f"…{excerpt}…").model_dump())
        else:
            results.append(PhraseResult(phrase=phrase, matched=False, evidence=None).model_dump())
    return results


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
    return find_winning_line(matched_phrases, phrases) is not None
