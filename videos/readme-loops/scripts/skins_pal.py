"""The skins' palettes, exported from the skins mod by gen-assets.ts."""

import json
from pathlib import Path

_PALETTES = json.loads((Path(__file__).resolve().parent.parent / "assets" / "cards" / "palettes.json").read_text())


def pal(skin_id: str, light: bool = False) -> dict:
    return _PALETTES[skin_id]["light" if light else "dark"]
