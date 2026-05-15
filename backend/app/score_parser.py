from __future__ import annotations

import io
import zipfile
from dataclasses import asdict
from pathlib import Path
from xml.etree import ElementTree

from .music_theory import ParsedNote, detect_chord, note_name, spanish_note

SUPPORTED_IMAGE_TYPES = {".png", ".jpg", ".jpeg"}
SUPPORTED_MIDI_TYPES = {".mid", ".midi"}
SUPPORTED_XML_TYPES = {".xml", ".musicxml"}


def _strip_namespace(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(element: ElementTree.Element, name: str) -> ElementTree.Element | None:
    for child in element:
        if _strip_namespace(child.tag) == name:
            return child
    return None


def _child_text(element: ElementTree.Element, name: str) -> str | None:
    child = _child(element, name)
    return child.text.strip() if child is not None and child.text else None


def _load_musicxml_from_mxl(content: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        candidates = [
            name
            for name in archive.namelist()
            if name.lower().endswith((".xml", ".musicxml"))
            and not name.lower().endswith("container.xml")
        ]
        if not candidates:
            raise ValueError("El MXL no contiene una partitura MusicXML")

        preferred = sorted(candidates, key=lambda value: ("/" in value, value))[0]
        return archive.read(preferred)


def _parse_musicxml(content: bytes) -> dict:
    root = ElementTree.fromstring(content)
    notes: list[ParsedNote] = []
    chord_groups: list[tuple[int | None, list[ParsedNote]]] = []
    current_group: list[ParsedNote] = []
    measure_count = 0

    for measure in root.iter():
        if _strip_namespace(measure.tag) != "measure":
            continue

        measure_count += 1
        measure_number = measure.get("number")
        current_measure = int(measure_number) if measure_number and measure_number.isdigit() else measure_count
        current_group = []

        for element in measure:
            if _strip_namespace(element.tag) != "note":
                continue
            if _child(element, "rest") is not None:
                current_group = []
                continue

            pitch = _child(element, "pitch")
            if pitch is None:
                continue

            step = _child_text(pitch, "step")
            octave_text = _child_text(pitch, "octave")
            alter_text = _child_text(pitch, "alter")
            if not step:
                continue

            parsed = ParsedNote(
                name=note_name(step, int(alter_text or 0)),
                octave=int(octave_text) if octave_text and octave_text.lstrip("-").isdigit() else None,
                measure=current_measure,
                duration=_child_text(element, "type") or _child_text(element, "duration"),
            )
            notes.append(parsed)

            if _child(element, "chord") is not None and current_group:
                current_group.append(parsed)
            else:
                if len(current_group) >= 3:
                    chord_groups.append((current_measure, current_group))
                current_group = [parsed]

        if len(current_group) >= 3:
            chord_groups.append((current_measure, current_group))

    chords = []
    for measure, group in chord_groups:
        chord_name = detect_chord([note.pitch_class for note in group])
        if chord_name:
            chords.append(
                {
                    "name": chord_name,
                    "measure": measure,
                    "notes": [note.label() for note in group],
                }
            )

    warnings: list[str] = []
    if not notes:
        warnings.append("No se encontraron notas en el MusicXML")
    if not chords:
        warnings.append("No se encontraron acordes simultaneos de tres o mas notas")

    return {
        "kind": "MusicXML",
        "status": "parsed",
        "message": "Partitura MusicXML leida con analisis inicial de notas y acordes.",
        "measures": measure_count,
        "notes": [
            {
                **asdict(note),
                "name": spanish_note(note.name),
            }
            for note in notes
        ],
        "chords": chords,
        "warnings": warnings,
    }


def analyze_score(filename: str, content: bytes) -> dict:
    suffix = Path(filename).suffix.lower()

    if suffix in SUPPORTED_XML_TYPES:
        return _parse_musicxml(content)

    if suffix == ".mxl":
        return _parse_musicxml(_load_musicxml_from_mxl(content))

    if suffix in SUPPORTED_MIDI_TYPES:
        return {
            "kind": "MIDI",
            "status": "accepted",
            "message": "Archivo MIDI recibido. El parser MIDI queda preparado para la fase 2.",
            "measures": 0,
            "notes": [],
            "chords": [],
            "warnings": ["Fase 1 solo valida la subida MIDI; falta extraccion temporal completa."],
        }

    if suffix == ".pdf" or suffix in SUPPORTED_IMAGE_TYPES:
        return {
            "kind": "PDF/Imagen",
            "status": "accepted",
            "message": "Archivo recibido. El motor OMR para PDF e imagen queda preparado para la fase 2.",
            "measures": 0,
            "notes": [],
            "chords": [],
            "warnings": ["Fase 1 no ejecuta reconocimiento optico musical todavia."],
        }

    raise ValueError(f"Formato no soportado: {suffix or 'sin extension'}")
