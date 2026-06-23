import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

import bingo
from main import app, _rate_log


def _phrases():
    return [f"p{i}" for i in range(25)]


# ---------------------------------------------------------------------------
# detect_bingo unit tests
# ---------------------------------------------------------------------------

def test_detect_bingo_row():
    phrases = _phrases()
    matched = set(phrases[0:5])
    assert bingo.detect_bingo(phrases, matched) is True


def test_detect_bingo_column():
    phrases = _phrases()
    matched = {phrases[c] for c in range(0, 25, 5)}
    assert bingo.detect_bingo(phrases, matched) is True


def test_detect_bingo_diagonal():
    phrases = _phrases()
    matched = {phrases[i * 5 + i] for i in range(5)}
    assert bingo.detect_bingo(phrases, matched) is True


def test_detect_bingo_antidiagonal():
    phrases = _phrases()
    matched = {phrases[i * 5 + (4 - i)] for i in range(5)}
    assert bingo.detect_bingo(phrases, matched) is True


def test_detect_bingo_no_win():
    phrases = _phrases()
    matched = {phrases[0], phrases[6]}
    assert bingo.detect_bingo(phrases, matched) is False


def test_detect_bingo_wrong_length():
    with pytest.raises(ValueError):
        bingo.detect_bingo(_phrases()[:24], set())


def test_empty_matches_no_win():
    assert bingo.detect_bingo(_phrases(), set()) is False


# ---------------------------------------------------------------------------
# find_winning_line unit tests
# ---------------------------------------------------------------------------

def test_find_winning_line_returns_phrases():
    card = _phrases()
    first_row = card[0:5]
    result = bingo.find_winning_line(set(first_row), card)
    assert result == first_row


def test_find_winning_line_none():
    card = _phrases()
    assert bingo.find_winning_line(set(), card) is None


def test_find_winning_line_wrong_length():
    with pytest.raises(ValueError):
        bingo.find_winning_line(set(), _phrases()[:24])


# ---------------------------------------------------------------------------
# FastAPI integration tests
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_rate_log():
    _rate_log.clear()
    yield
    _rate_log.clear()


client = TestClient(app)


def test_get_card_returns_25_phrases():
    res = client.get("/api/card")
    assert res.status_code == 200
    data = res.json()
    assert len(data["phrases"]) == 25
    assert set(data["phrases"]) == set(bingo.PHRASES)


def test_check_invalid_phrase_set():
    res = client.post("/api/check", json={"transcript": "hello", "phrases": ["wrong"]})
    assert res.status_code == 400


def test_check_returns_results_and_winning_line():
    # Mock check_transcript to return all phrases as matched
    all_matched = [
        {"phrase": p, "matched": True, "evidence": "evidence text"}
        for p in bingo.PHRASES
    ]
    with patch("bingo.check_transcript", return_value=all_matched):
        res = client.post(
            "/api/check",
            json={"transcript": "some transcript", "phrases": bingo.PHRASES},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["bingo"] is True
    assert isinstance(data["winning_line"], list)
    assert len(data["winning_line"]) == 5


def test_check_claude_failure():
    with patch("bingo.check_transcript", side_effect=bingo.BingoCheckError("API down")):
        res = client.post(
            "/api/check",
            json={"transcript": "some transcript", "phrases": bingo.PHRASES},
        )
    assert res.status_code == 502
    assert "detail" in res.json()


def test_check_rate_limit():
    all_matched = [
        {"phrase": p, "matched": False, "evidence": None}
        for p in bingo.PHRASES
    ]
    with patch("bingo.check_transcript", return_value=all_matched):
        for _ in range(10):
            res = client.post(
                "/api/check",
                json={"transcript": "x", "phrases": bingo.PHRASES},
            )
            assert res.status_code == 200
        # 11th request should be rate-limited
        res = client.post(
            "/api/check",
            json={"transcript": "x", "phrases": bingo.PHRASES},
        )
    assert res.status_code == 429


def test_check_duplicate_phrases_rejected():
    # 26 items: all 25 known phrases + one duplicate — set equality passes but length check must catch it
    phrases_with_dupe = bingo.PHRASES + [bingo.PHRASES[0]]
    res = client.post("/api/check", json={"transcript": "x", "phrases": phrases_with_dupe})
    assert res.status_code == 400
