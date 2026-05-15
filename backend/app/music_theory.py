from __future__ import annotations

from dataclasses import dataclass

PITCH_CLASSES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
SPANISH_NAMES = {
    "C": "Do",
    "C#": "Do#",
    "D": "Re",
    "D#": "Re#",
    "E": "Mi",
    "F": "Fa",
    "F#": "Fa#",
    "G": "Sol",
    "G#": "Sol#",
    "A": "La",
    "A#": "La#",
    "B": "Si",
}
CHORD_PATTERNS = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
}


@dataclass(frozen=True)
class ParsedNote:
    name: str
    octave: int | None = None
    measure: int | None = None
    duration: str | None = None

    @property
    def pitch_class(self) -> str:
        return self.name

    def label(self) -> str:
        octave = "" if self.octave is None else str(self.octave)
        return f"{self.name}{octave}"


def note_name(step: str, alter: int = 0) -> str:
    base_index = PITCH_CLASSES.index(step.upper())
    return PITCH_CLASSES[(base_index + alter) % 12]


def spanish_note(note: str) -> str:
    return SPANISH_NAMES.get(note, note)


def detect_chord(pitch_classes: list[str]) -> str | None:
    unique = sorted(set(pitch_classes), key=PITCH_CLASSES.index)
    if len(unique) < 3:
        return None

    unique_set = set(unique)
    best_name: str | None = None
    best_score = 0.0

    for root in PITCH_CLASSES:
        root_index = PITCH_CLASSES.index(root)
        for suffix, intervals in CHORD_PATTERNS.items():
            required = {PITCH_CLASSES[(root_index + interval) % 12] for interval in intervals}
            if not required.issubset(unique_set):
                continue

            extras = len(unique_set - required)
            score = len(required) / (len(required) + extras)
            if score > best_score:
                best_score = score
                best_name = f"{spanish_note(root)}{suffix}"

    return best_name if best_score >= 0.72 else None
