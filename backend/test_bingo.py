import bingo


def _phrases():
    return [f"p{i}" for i in range(25)]


def test_full_row_wins():
    phrases = _phrases()
    matched = set(phrases[0:5])
    assert bingo.detect_bingo(phrases, matched) is True


def test_full_column_wins():
    phrases = _phrases()
    matched = {phrases[c] for c in range(0, 25, 5)}
    assert bingo.detect_bingo(phrases, matched) is True


def test_diagonal_wins():
    phrases = _phrases()
    matched = {phrases[i * 5 + i] for i in range(5)}
    assert bingo.detect_bingo(phrases, matched) is True


def test_no_win():
    phrases = _phrases()
    matched = {phrases[0], phrases[6]}
    assert bingo.detect_bingo(phrases, matched) is False


def test_wrong_length_returns_false():
    assert bingo.detect_bingo(_phrases()[:24], set()) is False


def test_empty_matches_no_win():
    assert bingo.detect_bingo(_phrases(), set()) is False
