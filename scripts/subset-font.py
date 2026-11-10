"""Subsets Amiri Quran to the codepoints the vendored text actually uses.

Run once per font or source change:  .venv/Scripts/python.exe scripts/subset-font.py

The output (public/fonts/amiri-quran-subset.woff2) is committed, so the JS build
needs no Python. The script fails if any needed codepoint is missing from the
subset, or if HarfBuzz positions a sample of ayahs differently after subsetting.

Amiri Quran is OFL 1.1, which permits modification and subsetting; assets/fonts/
OFL.txt ships with it (REQ §8.2).
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
import uharfbuzz as hb

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/fonts/AmiriQuran-Regular.ttf"
OUTPUT = ROOT / "public/fonts/amiri-quran-subset.woff2"
QURAN_TEXT = ROOT / "assets/quran/quran-uthmani.txt"
QURAN_XML = ROOT / "assets/quran/quran-data.xml"

# Characters the UI draws with the same font: ayah digits in both Arabic-Indic
# forms, the ornamental ayah bracket, and the end-of-ayah sign.
EXTRA_CODEPOINTS = {
    *range(0x30, 0x3A),      # 0-9
    *range(0x0660, 0x066A),  # ٠-٩
    *range(0x06F0, 0x06FA),  # ۰-۹
    0x20,                    # space
    0x06DD,                  # ۝ end of ayah
    0xFD3E, 0xFD3F,          # ﴿ ﴾ ornamental brackets
}


def used_codepoints() -> set[int]:
    text = QURAN_TEXT.read_text(encoding="utf-8")
    xml = QURAN_XML.read_text(encoding="utf-8")
    names = re.findall(r'<sura\s[^>]*name="([^"]*)"', xml)
    source = text + "".join(names)

    # Control characters (newlines in the source file) are never rendered.
    codepoints = {ord(char) for char in source if ord(char) >= 0x20}

    # HarfBuzz composes base + mark sequences into precomposed glyphs whose
    # codepoints never appear in the text (alef + maddah -> U+0622). Without
    # those codepoints the subsetting prunes the ligature target and the text
    # renders with an unattached mark, so add the NFC/NFD forms too.
    for form in ("NFC", "NFD"):
        codepoints |= {ord(char) for char in unicodedata.normalize(form, source) if ord(char) >= 0x20}

    return codepoints | EXTRA_CODEPOINTS


def subset_font(codepoints: set[int]) -> None:
    options = subset.Options()
    # Keep every OpenType feature: Quranic shaping depends on the full set.
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.flavor = "woff2"

    font = subset.load_font(str(SOURCE), options)
    try:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        subset.save_font(font, str(OUTPUT), options)
    finally:
        font.close()


def verify_coverage(codepoints: set[int]) -> None:
    font = TTFont(str(OUTPUT))
    try:
        cmap = font.getBestCmap()
    finally:
        pass
    missing = sorted(cp for cp in codepoints if cp not in cmap)
    font.close()
    if missing:
        formatted = ", ".join(f"U+{cp:04X}" for cp in missing)
        raise SystemExit(f"subset is missing {len(missing)} codepoints: {formatted}")


def shaping_positions(path: Path, text: str) -> list[tuple[int, int, int, int]]:
    """HarfBuzz advance/offset/cluster per glyph, which must not change."""
    blob = hb.Blob.from_file_path(str(path))
    face = hb.Face(blob)
    font = hb.Font(face)
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(font, buffer)
    return [
        (info.cluster, pos.x_advance, pos.x_offset, pos.y_offset)
        for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions)
    ]


def verify_shaping(sample_ayahs: list[str]) -> None:
    """Every ayah is compared, not a sample: one pruned ligature is a typo."""
    # uharfbuzz cannot read woff2 (it silently shapes glyph 0), so decompress the
    # subset to a temporary TTF first.
    decompressed = OUTPUT.with_suffix(".verify.ttf")
    font = TTFont(str(OUTPUT))
    font.flavor = None
    font.save(str(decompressed))
    font.close()

    try:
        for text in sample_ayahs:
            before = shaping_positions(SOURCE, text)
            after = shaping_positions(decompressed, text)
            if before != after:
                raise SystemExit(f"shaping changed after subsetting: {text[:40]}")
    finally:
        decompressed.unlink(missing_ok=True)


def main() -> None:
    codepoints = used_codepoints()
    subset_font(codepoints)
    verify_coverage(codepoints)

    data = json.loads((ROOT / "public/quran.json").read_text(encoding="utf-8"))
    every_ayah = [text for surah in data["surahs"] for text in surah["ayahs"]]
    verify_shaping(every_ayah)

    size = OUTPUT.stat().st_size
    print(f"subset {OUTPUT.relative_to(ROOT)}: {len(codepoints)} codepoints, {size} B")
    print(f"source {SOURCE.relative_to(ROOT)}: {SOURCE.stat().st_size} B")


if __name__ == "__main__":
    sys.exit(main())
