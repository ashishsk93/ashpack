"""Writes storyboard.html: every frame's key moment as a static sketch, at the real canvas
size scaled into the sheet's cells, from the same building blocks the compositions use.
Run from this folder: python3 scripts/build_sheet.py
"""

from ui import (ACCENT, APP, APP_LIGHT, BG, CSS, INK, MUTED, STATUS, card_img, chips_html, copy, cursor, drawer, e, font_faces,
                footer, pane_img, prompt_box, setting, stage_open, turn, wave_svg, window)

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from skins_pal import pal  # noqa: E402

VERSION = "v3"
OUT = Path(__file__).resolve().parent.parent / "storyboard.html"


def bottom(inner: str) -> str:
    return f'<div class="bottom">{inner}</div>'


def transcript(inner: str, extra: str = "") -> str:
    return f'<div class="transcript">{inner}{extra}</div>'


# ── video 1: ashpack ──

def a1() -> str:
    return (
        stage_open("ASHPACK / 01 — THE HOST", "v0.12")
        + copy("◆ ashpack · the host", 'One <span class="hl">drawer</span>.', "one strip above the prompt")
        + window(transcript(turn(), bottom(chips_html() + prompt_box() + footer())))
        + "</div>"
    )


def home_page() -> str:
    items = "".join(f'<div style="font-size:22px;color:{APP["text"]}"><span style="color:{ACCENT}">●</span> {t}</div>' for t in ["Status", "Activity", "Skins", "Baton"])
    return (
        f'<b style="font-size:22px;color:{APP["text"]}">Pages</b>{items}'
        f'<div style="font-size:19px;color:{APP["muted"]};line-height:1.35">A mod joins with one Box keyed "ashpack-page:Label". See ADOPTING.md.</div>'
    )


def a2() -> str:
    return (
        stage_open("ASHPACK / 01 — THE HOST", "v0.12")
        + copy("◆ ashpack · the host", 'A tab per <span class="hl">mod</span>.', "/ashpack · or click ◆ AshPack ▸")
        + window(transcript(turn(), bottom(chips_html() + prompt_box() + footer(open_=True))) + drawer(home_page(), "Home"))
        + cursor(1238, 922, ripple=True)
        + "</div>"
    )


def status_page() -> str:
    def chip_row(name: str, sample: str, color: str) -> str:
        return (
            '<div style="display:flex;gap:14px;align-items:flex-start;padding-left:18px">'
            f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:19px;color:{APP["muted"]}">↑ ↓</span>'
            f'<div style="flex:1;display:flex;flex-direction:column"><span style="font-size:20px;color:{APP["text"]}">{name}</span>'
            f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:18px;color:{color}">{e(sample)}</span></div>'
            f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:19px;color:{APP["text"]}">● ON </span></div>'
        )

    return (
        setting("Compact mode", "Tool rows fold away; a popup shows the work.")
        + setting("Status chips", "Branch, context and usage by the prompt.")
        + chip_row("Branch", "⎇ main ●1 ↑1", STATUS["ok"])
        + chip_row("Context", "ctx ▰▰▱▱▱▱ 24%", STATUS["ok"])
        + chip_row("Session limit", "session ▰▰▰▰▱▱ 70% ↻16m", STATUS["warn"])
    )


def a3() -> str:
    return (
        stage_open("ASHPACK / 01 — THE HOST", "v0.12")
        + copy("◆ ashpack · the host", 'Each mod keeps its <span class="hl">page</span>.', "Status · Skins · Activity")
        + window(transcript(turn(), bottom(chips_html() + prompt_box() + footer(open_=True))) + drawer(status_page(), "Status"))
        + cursor(1652, 232)
        + "</div>"
    )


def a4() -> str:
    return (
        stage_open("ASHPACK / 01 — THE HOST", "v0.12")
        + copy("◆ ashpack · the host", 'One <span class="hl">drawer</span>.', "install it from the prompt")
        + window(transcript(turn(), bottom(chips_html() + prompt_box("/plugin install ashpack --marketplace ashishsk93/ashpack", caret=True) + footer())))
        + "</div>"
    )


# ── video 2: ashpack-status ──

def b1() -> str:
    return (
        stage_open("ASHPACK / 02 — STATUS", "v0.14")
        + copy("◆ ashpack-status", 'Know where you <span class="hl">stand</span>.', "branch · context · usage · spend")
        + window(transcript(turn(), bottom(chips_html() + prompt_box() + footer())))
        + "</div>"
    )


def popup() -> str:
    return (
        '<div class="popup">'
        f'<div style="display:flex;justify-content:space-between;gap:16px"><span><b style="color:{ACCENT}">◆ AshPack</b><span style="color:{APP["muted"]}"> Fix the login bug</span></span>'
        f'<span style="color:{APP["muted"]}">2/3 · 14s</span></div>'
        f'<div style="display:flex;align-items:center;gap:18px"><b style="color:{ACCENT};width:300px">▸ Running npm test…</b>{wave_svg()}</div>'
        f'<div style="color:{APP["text"]}">Tasks 2/3</div></div>'
    )


def b2() -> str:
    return (
        stage_open("ASHPACK / 02 — STATUS", "v0.14")
        + copy("◆ ashpack-status", 'Watch it <span class="hl">work</span>.', "compact mode")
        + window(transcript(turn(rows=False), bottom(popup() + prompt_box() + footer())))
        + "</div>"
    )


def activity_page(hero: str, calls: str) -> str:
    return pane_img(hero) + pane_img(calls) + f'<b style="font-size:24px;color:{APP["text"]}">This session</b>' + pane_img("tiles")


def b3() -> str:
    return (
        stage_open("ASHPACK / 02 — STATUS", "v0.14")
        + copy("◆ ashpack-status", 'Every turn, <span class="hl">kept</span>.', "the Activity page")
        + window(transcript(turn(rows=False), bottom(prompt_box() + footer(open_=True))) + drawer(activity_page("hero-done", "calls-done"), "Activity", width=640))
        + "</div>"
    )


def turn_rows() -> str:
    rows = [("▸ #5", "add the repo chips · 6m 20s · 22", True), ("  #6", "fix the login bug · 2m 10s · 4", False), ("  #4", "tidy the README · 1m 36s · 3", False), ("  #3", "why is the popup gone · 22s · 0", False)]
    return "".join(
        f'<div style="font-size:23px;white-space:pre;color:{APP["text"] if on else APP["muted"]}">{e(n)}  {e(t)}</div>' for n, t, on in rows
    )


def b4() -> str:
    page = f'<div style="font-size:22px;color:{APP["text"]}">← Back to now</div>' + pane_img("hero-turn5") + pane_img("timeline-turn5") + turn_rows()
    return (
        stage_open("ASHPACK / 02 — STATUS", "v0.14")
        + copy("◆ ashpack-status", 'Look back <span class="hl">anytime</span>.', "click any turn")
        + window(transcript(turn(rows=False), bottom(prompt_box() + footer(open_=True))) + drawer(page, "Activity", width=640))
        + cursor(1290, 664, ripple=True)
        + "</div>"
    )


# ── video 3: ashpack-skins ──

def skin_copy(token: str, note: str, color: str) -> str:
    return copy("◆ ashpack-skins", 'One <span class="hl">pick</span>.', note, token=token, token_color=color)


def prompt_outline(p: dict, text: str = "fix the login bug") -> str:
    return f'<div style="align-self:flex-start;border:2px solid {p["muted"]};border-radius:14px;padding:10px 20px;color:{p["text"]};font-size:25px">{e(text)}</div>'


def icon(name: str) -> str:
    return f'<img class="icon" src="assets/cards/{name}.svg" alt="">'


def c1() -> str:
    p = pal("catppuccin")
    rows = (
        f'<div class="row">{icon("catppuccin-icon-read")}<b style="color:{p["blue"]}">Read</b><span style="color:{p["muted"]}">src/auth.ts</span><span style="color:{p["muted"]}">0.1s</span></div>'
        f'<div class="row">{icon("catppuccin-icon-write")}<b style="color:{p["yellow"]}">Edit</b><span style="color:{p["muted"]}">src/auth.ts</span><span style="color:{p["green"]}">+4</span><span style="color:{p["red"]}">−1</span><span style="color:{p["muted"]}">1.2s</span></div>'
        f'<div class="row">{icon("catppuccin-icon-run-busy")}<b style="color:{p["green"]}">Run</b><span style="color:{p["muted"]}">npm test</span></div>'
        f'<div style="color:{p["text"]}">All green. The refresh path now checks expiry first.</div>'
        f'<div class="row">{icon("catppuccin-icon-read")}<b style="color:{p["blue"]}">Read</b><span style="color:{p["muted"]}">3</span><span style="color:{p["muted"]}">·</span><b style="color:{p["green"]}">Run</b><span style="color:{p["muted"]}">2</span></div>'
    )
    inner = prompt_outline(p) + f'<div style="color:{p["text"]}">Reading the auth module first.</div>' + rows
    return stage_open("ASHPACK / 03 — SKINS", "v0.9") + skin_copy("/skin catppuccin", "tool rows with icons", p["accent"]) + window(transcript(inner)) + "</div>"


def c2() -> str:
    p = pal("dracula")
    inner = prompt_outline(p, "make the expired-token path refresh") + card_img("dracula-diff", 1.38) + card_img("dracula-terminal", 1.38)
    return stage_open("ASHPACK / 03 — SKINS", "v0.9") + skin_copy("/skin dracula", "diff cards · terminal cards", p["accent"]) + window(transcript(inner)) + "</div>"


def c3() -> str:
    p = pal("tokyo-night")
    inner = f'<div style="color:{p["text"]}">Here is the retry helper, and where each piece lives:</div>' + card_img("tokyo-code", 1.38) + card_img("tokyo-table", 1.38)
    return stage_open("ASHPACK / 03 — SKINS", "v0.9") + skin_copy("/skin tokyo-night", "code cards · table cards", p["accent"]) + window(transcript(inner)) + "</div>"


def c4() -> str:
    p = pal("gruvbox")
    tasks = "".join(
        f'<div style="color:{p["muted"] if done else p["text"]}"><span style="color:{p["green"] if done else p["muted"]}">{"✓" if done else "○"}</span> {e(t)}</div>'
        for t, done in [("Read the code", True), ("Fix the token check", True), ("Add a test", False), ("Update the docs", False)]
    )
    inner = (
        f'<b style="color:{p["accent"]};font-size:30px">Before you ship</b>'
        f'<div style="border:2px solid {p["yellow"]};border-radius:14px;padding:12px 20px;display:flex;flex-direction:column;gap:4px">'
        f'<b style="color:{p["yellow"]}">Warning</b><span style="color:{p["text"]}">Run the migration before you deploy.</span></div>'
        f'<div style="display:flex;flex-direction:column;gap:6px"><span style="color:{p["muted"]}">2 of 4 done</span>{tasks}</div>'
        f'<div style="color:{p["text"]}">The token check is in. <b style="color:{p["text"]}">Two steps</b> left, and one note from the last review:</div>'
        f'<div style="padding-left:28px;display:flex;flex-direction:column;font-style:italic;color:{p["muted"]}"><span>Keep the refresh path small.</span><span>One retry, then sign the user out.</span></div>'
    )
    return stage_open("ASHPACK / 03 — SKINS", "v0.9") + skin_copy("/skin gruvbox", "alerts · task lists", p["accent"]) + window(transcript(inner)) + "</div>"


def c5() -> str:
    p = pal("github")
    inner = card_img("github-flow", 1.25) + card_img("github-bars", 1.2)
    return stage_open("ASHPACK / 03 — SKINS", "v0.9") + skin_copy("/skin github", "mermaid → 11 chart kinds", p["accent"]) + window(transcript(inner)) + "</div>"


FRAMES = [
    ("1", "ashpack — One drawer for all your mods · ~11.2 s", [
        ("01", "A1 · Every mod, one strip", "0.0–2.6", a1, "Chips fly in first, left to right, into one strip; then “Every mod.” swaps to “One drawer.” by a cut at speed.", "cut"),
        ("02", "A2 · A tab per mod", "2.6–5.6", a2, "The cursor arrives at ◆ AshPack ▸ and clicks; the drawer docks in from the window's right edge and its tabs follow.", "cut"),
        ("03", "A3 · Each mod keeps its page", "5.6–8.6", a3, "The cursor steps Status → Skins → Activity; each page swaps in place under a sliding underline.", "cut"),
        ("04", "A4 · One drawer, one command", "8.6–11.2", a4, "The drawer folds back right; the install command types into the prompt and holds; it clears into frame 01.", "loop"),
    ]),
    ("2", "ashpack-status — See what Claude is doing, and keep it · ~12.0 s", [
        ("05", "B1 · Know where you stand", "0.0–2.6", b1, "The chips rise in one by one; the context and usage bars fill to their levels.", "cut"),
        ("06", "B2 · Watch it work", "2.6–5.6", b2, "The tool rows fold away and the popup takes their place; its line swaps Reading → Editing → Running beside the wave.", "cut"),
        ("07", "B3 · Every turn, kept", "5.6–9.4", b3, "The Activity page docks in; turn card, calls, tiles (counting up) and timeline build top to bottom; the card turns ✓ DONE.", "cut"),
        ("08", "B4 · Look back anytime", "9.4–12.0", b4, "The cursor clicks turn #5; its card and calls swap in; hold; the drawer folds into frame 05.", "loop"),
    ]),
    ("3", "ashpack-skins — One pick recolours the whole conversation · ~14.2 s", [
        ("09", "C1 · Catppuccin: rows with icons", "0.0–2.8", c1, "“One pick.” lands and stays; the prompt outline, reply and icon rows arrive; the Run ring turns; the rows fold to one group row.", "morph"),
        ("10", "C2 · Dracula: diffs and terminals", "2.8–5.6", c2, "The whole window morphs to Dracula; the token ticks; the diff card rises, then the terminal card.", "morph"),
        ("11", "C3 · Tokyo Night: code and tables", "5.6–8.4", c3, "Morph to Tokyo Night; the code card rises, then the table card.", "morph"),
        ("12", "C4 · Gruvbox: alerts and task lists", "8.4–11.0", c4, "Morph to Gruvbox; heading, alert and the task list reveal in order; the count reads “2 of 4 done”.", "morph"),
        ("13", "C5 · GitHub: charts", "11.0–14.2", c5, "Morph to GitHub; the flowchart draws edge by edge and the bars grow; the window morphs back into frame 09.", "loop"),
    ]),
]

SHEET_CSS = f"""
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#0a090d;color:{INK};font-family:Inter,sans-serif;padding:48px 40px 80px}}
header{{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;max-width:1880px;margin:0 auto 34px}}
h1{{font-family:'Archivo Black',sans-serif;font-size:44px;letter-spacing:-.03em}}
h1 small{{font-family:'JetBrains Mono',monospace;font-size:16px;color:{ACCENT};letter-spacing:.08em;margin-left:14px;vertical-align:middle}}
.dek{{color:{MUTED};font-size:17px;margin-top:8px;max-width:900px;line-height:1.45}}
.tag{{font-family:'JetBrains Mono',monospace;font-size:14px;color:{MUTED};border:1px solid #2a2733;border-radius:999px;padding:8px 14px;white-space:nowrap}}
.grid{{display:grid;grid-template-columns:repeat(3,600px);gap:34px 28px;justify-content:center}}
.act{{grid-column:1/-1;font-family:'JetBrains Mono',monospace;font-size:15px;letter-spacing:.06em;color:{INK};border-top:1px solid #2a2733;padding-top:14px;margin-top:10px}}
.act b{{color:{ACCENT}}}
.cell .shot{{width:600px;height:337.5px;overflow:hidden;border-radius:10px;box-shadow:0 0 0 1px #24212c}}
.cell .shot .stage{{transform:scale(.3125);transform-origin:0 0}}
.label{{display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:13px;margin-top:10px;color:{INK}}}
.label span:last-child{{color:{MUTED}}}
.cnote{{font-size:14px;line-height:1.45;color:#bdb8cc;margin-top:6px}}
.cnote b{{color:{INK}}}
.seam{{display:inline-block;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:12px;border:1px solid #3a3546;color:{ACCENT};border-radius:999px;padding:3px 10px}}
.panel{{background:#121017;border-radius:10px;box-shadow:0 0 0 1px #24212c;padding:20px 22px;height:337.5px;font-size:14px;line-height:1.5;overflow:hidden}}
.panel h3{{font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.08em;color:{ACCENT};margin-bottom:12px}}
.strip{{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-family:'JetBrains Mono',monospace;font-size:12px;margin-bottom:12px}}
.strip i{{font-style:normal;color:{MUTED}}}
.sw{{display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:middle;margin-right:6px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}}
"""


def cell(no: str, name: str, times: str, video: str, draw, note: str, seam: str) -> str:
    lead, _, rest = note.partition(";")
    return (
        f'<div class="cell" id="frame-{no}"><div class="shot">{draw()}</div>'
        f'<div class="label"><span>{no} · {e(name.upper())}</span><span>v{video} · {times} s</span></div>'
        f'<div class="cnote"><b>{e(lead)}.</b>{e(rest)}</div><span class="seam">seam → {seam}</span></div>'
    )


def seam_map() -> str:
    strips = []
    for video, _, frames in FRAMES:
        parts = []
        for no, name, _, _, _, seam in frames:
            parts.append(f'{no}<i> →{seam}→ </i>')
        strips.append(f'<div class="strip"><b style="color:{INK}">v{video}</b>&nbsp; {"".join(parts)}<i>(back to start)</i></div>')
    return (
        '<div class="panel"><h3>SEAM MAP</h3>' + "".join(strips)
        + f'<p style="color:#bdb8cc">Inside a video the window never cuts away: every seam is a state change in the same window (a cut at speed for the type, a theme morph of ~0.35 s for the skins). Each loop’s last frame is its first, so the WebP repeats without a jump.</p></div>'
    )


def tokens_panel() -> str:
    sw = lambda c, label: f'<div><span class="sw" style="background:{c}"></span>{label} <span style="color:{MUTED}">{c}</span></div>'  # noqa: E731
    return (
        '<div class="panel"><h3>TOKENS</h3>'
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin-bottom:12px">'
        + sw(BG, "canvas") + sw(INK, "ink") + sw(MUTED, "muted") + sw(ACCENT, "accent ◆") + sw(APP["bg"], "app (dark)") + sw(APP["pane"], "drawer")
        + "</div>"
        f'<div style="font-family:\'Archivo Black\';font-size:22px;letter-spacing:-.03em">Archivo Black — statements</div>'
        f'<div style="font-family:\'JetBrains Mono\';font-size:14px;margin:4px 0">JetBrains Mono — eyebrows, notes, chips, code</div>'
        f'<div style="font-size:14px;margin-bottom:10px">Inter — the app\'s own chrome and transcript</div>'
        f'<div style="color:#bdb8cc"><b style="color:{INK}">Bans:</b> no glow halos, no purple-blue gradients, no breathing cards, no back-half pans, no overshoot, no invented features. Motion: power3 settles; reveals in order; holds are still.</div></div>'
    )


def build() -> str:
    body = []
    for video, title, frames in FRAMES:
        body.append(f'<div class="act"><b>VIDEO {video}</b> · {e(title)}</div>')
        body.extend(cell(no, name, times, video, draw, note, seam) for no, name, times, draw, note, seam in frames)
    body.append(seam_map())
    body.append(tokens_panel())
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AshPack README loops — storyboard</title>'
        f"<style>{font_faces()}{SHEET_CSS}{CSS}</style></head><body>"
        f'<header><div><h1>AshPack README loops<small>{VERSION}</small></h1>'
        '<p class="dek">Three silent loops for the README, one per mod. Each cell is the frame’s key moment at the real 1920×1080 layout: '
        'the real fonts, the real colours, and the mods’ own cards (Activity, code, table, diff, terminal, charts) drawn by their renderers. No motion yet.</p></div>'
        '<span class="tag">1920×1080 · WebP 880 px · 3 loops · 13 frames · ~37 s</span></header>'
        f'<div class="grid">{"".join(body)}</div></body></html>'
    )


if __name__ == "__main__":
    OUT.write_text(build())
    print(f"wrote {OUT}")
