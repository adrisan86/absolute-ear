from app.music_theory import detect_chord, note_name


def test_note_name_applies_alteration() -> None:
    assert note_name("C", 1) == "C#"
    assert note_name("B", 1) == "C"


def test_detect_major_chord() -> None:
    assert detect_chord(["C", "E", "G"]) == "Do"


def test_detect_minor_chord() -> None:
    assert detect_chord(["A", "C", "E"]) == "Lam"
