"""The README loops' building blocks, as HTML at the 1920×1080 canvas.

One place for the stage (canvas, type column, the Claude Code window) and every piece of
UI drawn inside it, so the storyboard sketches and the compositions share the same markup:
a sketch is a composition's end state, and the build animates that same DOM.
"""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "assets" / "cards"
SIZES = json.loads((CARDS / "sizes.json").read_text())
CHIPS = json.loads((CARDS / "chips.json").read_text())

# ── palette (frame.md) ──
BG = "#0e0c13"
INK = "#ece9f3"
MUTED = "#8e89a0"
ACCENT = "#8b5cf6"
APP = {"bg": "#1e1e1e", "bar": "#262626", "line": "#343338", "text": "#e6e4df", "muted": "#8a8884", "bubble": "#303030", "pane": "#232323"}
APP_LIGHT = {"bg": "#faf9f5", "bar": "#efede6", "line": "#dcd9cf", "text": "#29261b", "muted": "#7a776d", "bubble": "#ebe8df", "pane": "#f3f1ea"}
STATUS = {"ok": "#1a9450", "warn": "#a87700", "hot": "#e5484d", "blue": "#2f7bf0", "muted": "#8a8a8a"}

e = html.escape


def font_faces(prefix: str = "") -> str:
    return (
        f"@font-face{{font-family:'Archivo Black';src:url('{prefix}assets/fonts/archivo-black.woff2') format('woff2');font-weight:400}}"
        f"@font-face{{font-family:'Inter';src:url('{prefix}assets/fonts/inter.woff2') format('woff2');font-weight:100 900}}"
        f"@font-face{{font-family:'JetBrains Mono';src:url('{prefix}assets/fonts/jetbrains-mono.woff2') format('woff2');font-weight:100 800}}"
    )


CSS = f"""
.stage{{position:relative;width:1920px;height:1080px;background:{BG};overflow:hidden;font-family:Inter,sans-serif;color:{INK}}}
.dots{{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(236,233,243,.10) 1.6px,transparent 1.8px);background-size:48px 48px;
  -webkit-mask-image:linear-gradient(90deg,#000 0%,rgba(0,0,0,.35) 38%,transparent 60%);mask-image:linear-gradient(90deg,#000 0%,rgba(0,0,0,.35) 38%,transparent 60%)}}
.rule{{position:absolute;left:96px;width:600px;height:2px;background:rgba(236,233,243,.14)}}
.meta{{position:absolute;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.06em;color:{MUTED};white-space:nowrap}}
.copy{{position:absolute;left:96px;top:0;bottom:0;width:612px;display:flex;flex-direction:column;justify-content:center}}
.eyebrow{{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:26px;letter-spacing:.1em;text-transform:uppercase;color:{ACCENT}}}
.statement{{font-family:'Archivo Black',sans-serif;font-size:104px;line-height:1.0;letter-spacing:-.04em;color:{INK};margin-top:30px}}
.statement .hl{{color:{ACCENT}}}
.token{{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:44px;margin-top:26px;letter-spacing:-.01em}}
.note{{font-family:'JetBrains Mono',monospace;font-size:30px;color:{MUTED};margin-top:34px;line-height:1.35}}
.window{{position:absolute;left:760px;top:104px;width:1064px;height:872px;border-radius:20px;overflow:hidden;
  box-shadow:0 0 0 1.5px rgba(255,255,255,.07),0 48px 120px rgba(0,0,0,.6)}}
.titlebar{{position:absolute;left:0;right:0;top:0;height:50px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:20px}}
.lights{{position:absolute;left:22px;top:18px;display:flex;gap:10px}}
.lights i{{display:block;width:14px;height:14px;border-radius:50%;background:#4a494f}}
.wbody{{position:absolute;left:0;right:0;top:50px;bottom:0;display:flex}}
.transcript{{position:relative;flex:1;padding:34px 44px 0;display:flex;flex-direction:column;gap:18px;font-size:25px;line-height:1.4}}
.bubble{{align-self:flex-end;border-radius:18px;padding:12px 22px;font-size:25px}}
.row{{display:flex;align-items:center;gap:12px;font-size:24px;white-space:nowrap}}
.row b{{font-weight:700}}
.row .icon{{width:28px;height:28px;flex:none}}
.bottom{{position:absolute;left:44px;right:44px;bottom:26px;display:flex;flex-direction:column;gap:16px}}
.chips{{display:flex;flex-wrap:wrap;column-gap:34px;row-gap:10px;font-family:'JetBrains Mono',monospace;font-size:22px;align-items:center}}
.schip{{display:flex;align-items:center;white-space:pre}}
.schip img{{margin:0 3px}}
.prompt{{height:92px;border-radius:18px;padding:0 28px;display:flex;align-items:center;font-size:24px;border:1.5px solid}}
.footer{{display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:20px}}
.drawer{{position:relative;width:488px;flex:none;padding:24px 24px;display:flex;flex-direction:column;gap:16px;border-left:1.5px solid}}
.dhead{{font-size:23px;white-space:nowrap}}
.tabs{{display:flex;gap:22px;font-size:21px;white-space:nowrap}}
.tabs span{{padding-bottom:7px;border-bottom:3px solid transparent}}
.tabs span.on{{border-bottom-color:{ACCENT}}}
.popup{{border:2px solid {ACCENT};border-radius:14px;padding:12px 18px;display:flex;flex-direction:column;gap:6px;width:560px;font-size:22px}}
.card{{display:flex;flex-direction:column;gap:6px;align-self:flex-start}}
.card .copybtn{{align-self:flex-end;font-size:18px}}
.cursor{{position:absolute;width:34px;height:34px}}
"""


def stage_open(meta_left: str, meta_right: str) -> str:
    return (
        '<div class="stage">'
        '<div class="dots"></div>'
        f'<div class="meta" style="left:96px;top:54px">{e(meta_left)}</div>'
        f'<div class="meta" style="right:96px;top:54px">{e(meta_right)}</div>'
        '<div class="meta" style="left:96px;bottom:50px">github.com/ashishsk93/ashpack</div>'
    )


def copy(eyebrow: str, statement: str, note: str = "", token: str = "", token_color: str = ACCENT) -> str:
    """The type column. `statement` may carry <span class="hl"> for its accent word."""
    return (
        '<div class="copy">'
        f'<div class="eyebrow">{e(eyebrow)}</div>'
        f'<div class="statement">{statement}</div>'
        + (f'<div class="token" style="color:{token_color}">{e(token)}</div>' if token else "")
        + (f'<div class="note">{e(note)}</div>' if note else "")
        + "</div>"
    )


def window(inner: str, app: dict = APP, title: str = "claude · ~/code/app", camera: str = "") -> str:
    """`camera`: a transform on the window, for a push-in (`scale(1.5)` with its origin)."""
    return (
        f'<div class="window" style="background:{app["bg"]};{camera}">'
        f'<div class="titlebar" style="background:{app["bar"]};color:{app["muted"]};border-bottom:1.5px solid {app["line"]}">'
        f'<div class="lights"><i></i><i></i><i></i></div>{e(title)}</div>'
        f'<div class="wbody">{inner}</div></div>'
    )


def card_img(name: str, scale: float = 1.0, copy_label: str = "Copy", app: dict = APP) -> str:
    s = SIZES[name]
    w, h = s["width"] * scale, s["height"] * scale
    btn = f'<span class="copybtn" style="color:{app["muted"]}">{e(copy_label)}</span>' if copy_label else ""
    return f'<div class="card"><img src="assets/cards/{name}.svg" width="{w:.0f}" height="{h:.0f}" alt="">{btn}</div>'


def pane_img(name: str, scale: float = 1.3) -> str:
    s = SIZES[name]
    return f'<img src="assets/cards/{name}.svg" width="{s["width"] * scale:.0f}" height="{s["height"] * scale:.0f}" alt="" style="display:block">'


def chips_html(scale_bar: float = 1.7) -> str:
    out = []
    for chip in CHIPS:
        parts = []
        for sp in chip["spans"]:
            if "bar" in sp:
                parts.append(f'<img src="assets/cards/{sp["bar"]}" style="width:{sp["width"] * scale_bar:.0f}px;height:{sp["height"] * scale_bar:.0f}px" alt="">')
            else:
                color = sp.get("color") or (STATUS["muted"] if sp.get("dim") else APP["text"])
                weight = "700" if sp.get("bold") else "400"
                parts.append(f'<span style="color:{color};font-weight:{weight}">{e(sp["text"])}</span>')
        out.append(f'<div class="schip" data-chip="{chip["id"]}">{"".join(parts)}</div>')
    return f'<div class="chips">{"".join(out)}</div>'


def prompt_box(text: str = "", app: dict = APP, caret: bool = False) -> str:
    shown = (
        f'<span style="color:{app["text"]};font-family:\'JetBrains Mono\',monospace;font-size:23px">{e(text)}</span>'
        + (f'<span style="display:inline-block;width:3px;height:30px;background:{ACCENT};margin-left:3px;vertical-align:middle"></span>' if caret else "")
        if text
        else f'<span style="color:{app["muted"]}">Type / for commands</span>'
    )
    return f'<div class="prompt" style="border-color:{app["line"]};background:{app["bg"]}">{shown}</div>'


def footer(app: dict = APP, open_: bool = False) -> str:
    return (
        f'<div class="footer"><span style="color:{app["muted"]}">⏵⏵ auto mode on</span>'
        f'<span style="color:{app["text"]}"><span style="color:{ACCENT}">◆</span> AshPack {"◂" if open_ else "▸"}</span></div>'
    )


def turn(app: dict = APP, rows: bool = True) -> str:
    """The sample turn the host and status loops share, drawn as the app draws it."""
    rows_html = ""
    if rows:
        rows_html = "".join(
            f'<div class="row"><b style="color:{color}">{label}</b><span style="color:{app["muted"]}">{e(target)}</span>{extra}</div>'
            for label, color, target, extra in [
                ("Read", STATUS["blue"], "src/auth.ts", ""),
                ("Edit", STATUS["warn"], "src/auth.ts", f'<span style="color:{STATUS["ok"]}">+4</span><span style="color:{STATUS["hot"]}">−1</span>'),
                ("Bash", STATUS["ok"], "npm test", ""),
            ]
        )
    return (
        f'<div class="bubble" style="background:{app["bubble"]};color:{app["text"]}">fix the login bug</div>'
        f'<div style="color:{app["text"]}">Reading the auth module first.</div>'
        + rows_html
    )


def drawer(page_html: str, tab: str, app: dict = APP, width: int = 488) -> str:
    tabs = "".join(
        f'<span class="{"on" if t == tab else ""}" style="color:{app["text"] if t == tab else app["muted"]}">{t}</span>'
        for t in ["Home", "Status", "Activity", "Skins", "Baton"]
    )
    return (
        f'<div class="drawer" style="width:{width}px;background:{app["pane"]};border-color:{app["line"]}">'
        f'<div class="dhead"><b style="color:{ACCENT}">◆ AshPack</b><span style="color:{app["muted"]}"> · your mods, one place</span></div>'
        f'<div class="tabs">{tabs}</div>{page_html}</div>'
    )


def setting(label: str, hint: str, on: bool = True, app: dict = APP) -> str:
    return (
        '<div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-start">'
        f'<div style="display:flex;flex-direction:column;gap:2px"><b style="font-size:22px;color:{app["text"]}">{e(label)}</b>'
        f'<span style="font-size:19px;color:{app["muted"]};line-height:1.3">{e(hint)}</span></div>'
        f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:20px;color:{app["text"] if on else app["muted"]};white-space:nowrap">{"● ON " if on else "○ OFF"}</span></div>'
    )


def wave_svg(color: str = ACCENT, bars: int = 12) -> str:
    rects = "".join(
        f'<rect x="{i * 9}" y="{(18 - h) / 2:.1f}" width="5" height="{h:.1f}" rx="2.5" fill="{color}"/>'
        for i, h in enumerate([6 + 12 * (0.5 + 0.5 * __import__("math").sin(i * 0.8)) for i in range(bars)])
    )
    return f'<svg width="{bars * 9}" height="18" viewBox="0 0 {bars * 9} 18" style="display:block">{rects}</svg>'


def cursor(x: int, y: int, ripple: bool = False) -> str:
    ring = (
        f'<div style="position:absolute;left:{x - 26}px;top:{y - 26}px;width:52px;height:52px;border-radius:50%;border:2.5px solid {ACCENT};opacity:.6"></div>'
        if ripple
        else ""
    )
    arrow = (
        f'<svg class="cursor" style="left:{x}px;top:{y}px" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    )
    return ring + arrow
