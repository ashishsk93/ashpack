"""Writes the three loop compositions (ashpack.html, status.html, skins.html) on the layouts
locked in storyboard.html, from the same pieces (ui.py). Each is one scene: the window stays,
the mods move inside it, the type column narrates; the last 0.45 s fades in a copy of the
first frame (the plate) so the loop repeats without a jump.
Run from this folder: python3 scripts/build_videos.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from skins_pal import pal  # noqa: E402
from ui import (ACCENT, APP, CARDS, CSS, INK, MUTED, SIZES, STATUS, chips_html, e, footer, prompt_box, setting,  # noqa: E402
                stage_open, turn)

ROOT = Path(__file__).resolve().parent.parent
ROWS = json.loads((CARDS / "rows.json").read_text())
GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"
PANE_SCALE = 1.3

COMP_CSS = f"""
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1920px;height:1080px;overflow:hidden;background:#0e0c13}}
#root{{position:relative;width:100%;height:100%;overflow:hidden}}
.scene{{position:absolute;inset:0}}
.layer{{position:absolute;inset:0}}
.ccol{{position:absolute;left:96px;top:0;width:640px;height:1080px}}
.ccol .eyebrow{{position:absolute;left:0;top:318px}}
.stmt{{position:absolute;left:0;top:372px;width:640px}}
.stmt .ln{{display:block;font-family:'Archivo Black',sans-serif;font-size:104px;line-height:1.0;letter-spacing:-.04em;color:{INK};white-space:nowrap}}
.stmt .hl{{color:{ACCENT}}}
.cnote{{position:absolute;left:0;width:640px;font-family:'JetBrains Mono',monospace;font-size:30px;color:{MUTED};line-height:1.35}}
.ctoken{{position:absolute;left:0;top:502px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:44px;letter-spacing:-.01em;white-space:nowrap}}
.wbody{{display:block}}
.tpane{{position:absolute;top:0;bottom:0;left:0;overflow:hidden}}
.tpane .transcript{{position:absolute;inset:0}}
.dpane{{position:absolute;top:0;bottom:0;right:0;overflow:hidden}}
.dpane .drawer{{position:absolute;inset:0;width:auto}}
.slot{{position:relative;height:132px}}
.slot > *{{position:absolute;left:0;right:0;bottom:0}}
.page{{position:absolute;left:24px;right:24px;top:118px;bottom:0;overflow:hidden}}
.page .col{{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;gap:16px}}
.stack{{position:relative}}
.stack > *{{position:absolute;left:0;top:0}}
.cur{{position:absolute;left:0;top:0;width:34px;height:34px;z-index:20}}
.ripple{{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:3px solid {ACCENT};z-index:19;opacity:0}}
.plate{{position:absolute;inset:0;opacity:0;z-index:30}}
.tabbar{{position:absolute;height:3px;background:{ACCENT};left:0;top:0;width:10px;transform-origin:0 0}}
.caret{{display:inline-block;width:3px;height:30px;background:{ACCENT};margin-left:3px;vertical-align:middle}}
"""

CURSOR_SVG = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2l7.5 19 2.6-7.9L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'


# ── pieces ──

def stmt(sid: str, lines: list[str], visible: bool) -> str:
    """A statement as block lines (display titles, each line deliberate); the last word of `hl` lines is the accent."""
    html_lines = "".join(f'<span class="ln">{ln}</span>' for ln in lines)
    return f'<div class="stmt" id="{sid}" style="opacity:{1 if visible else 0}">{html_lines}</div>'


def note(nid: str, text: str, lines: int, visible: bool) -> str:
    top = 372 + lines * 104 + 34
    return f'<div class="cnote" id="{nid}" style="top:{top}px;opacity:{1 if visible else 0}">{e(text)}</div>'


def window_shell(body: str, wid: str, app: dict = APP, camera: str = "") -> str:
    return (
        f'<div class="window" id="{wid}" style="background:{app["bg"]};{camera}">'
        f'<div class="titlebar" style="background:{app["bar"]};color:{app["muted"]};border-bottom:1.5px solid {app["line"]}">'
        f'<div class="lights"><i></i><i></i><i></i></div>claude · ~/code/app</div>'
        f'<div class="wbody" style="position:absolute;left:0;right:0;top:50px;bottom:0">{body}</div></div>'
    )


def footer_btn(open_: bool, bid: str) -> str:
    return (
        f'<div class="footer"><span style="color:{APP["muted"]}">⏵⏵ auto mode on</span>'
        f'<span id="{bid}" style="color:{APP["text"]}"><span style="color:#9a72f8">◆</span> AshPack {"◂" if open_ else "▸"}</span></div>'
    )


def plain_rows(prefix: str) -> str:
    return "".join(
        f'<div class="row" id="{prefix}-row{i}"><b style="color:{color}">{label}</b><span style="color:{APP["muted"]}">{e(target)}</span>{extra}</div>'
        for i, (label, color, target, extra) in enumerate([
            ("Read", STATUS["blue"], "src/auth.ts", ""),
            ("Edit", STATUS["warn"], "src/auth.ts", f'<span style="color:{STATUS["ok"]}">+4</span><span style="color:{STATUS["hot"]}">−1</span>'),
            ("Bash", STATUS["ok"], "npm test", ""),
        ])
    )


def chips_ids(prefix: str) -> str:
    html = chips_html()
    count = [0]

    def tag(m: re.Match) -> str:
        count[0] += 1
        return f'<div class="schip" id="{prefix}-chip{count[0] - 1}" data-chip'

    return re.sub(r'<div class="schip" data-chip', tag, html)


def img(name: str, iid: str, scale: float = 1.0, style: str = "") -> str:
    s = SIZES[name]
    return f'<img id="{iid}" src="assets/cards/{name}.svg" width="{s["width"] * scale:.0f}" height="{s["height"] * scale:.0f}" alt="" style="display:block;{style}">'


def drawer_shell(prefix: str, page_html: str, tab: str, width: int, tabs_extra: str = "") -> str:
    tabs = "".join(
        f'<span id="{prefix}-tab-{t.lower()}" style="color:{APP["text"] if t == tab else APP["muted"]}">{t}</span>'
        for t in ["Home", "Status", "Activity", "Skins", "Baton"]
    )
    return (
        f'<div class="drawer" style="background:{APP["pane"]};border-color:{APP["line"]}">'
        f'<div class="dhead"><b style="color:{ACCENT}">◆ AshPack</b><span style="color:{APP["muted"]}"> · your mods, one place</span></div>'
        f'<div class="tabs" id="{prefix}-tabs" style="position:relative">{tabs}<i class="tabbar" id="{prefix}-tabbar"></i></div>'
        f'{tabs_extra}{page_html}</div>'
    )


def cursor_dom(prefix: str) -> str:
    return f'<div class="ripple" id="{prefix}-ripple"></div><div class="cur" id="{prefix}-cur" style="opacity:0">{CURSOR_SVG}</div>'


JS_HELPERS = """
const S = (sel) => document.querySelector(sel);
// An element's box in the stage's coordinates, from offsets: transforms (a drawer still off
// to the side, a camera) are ignored, so this is where it rests once they settle.
function boxOf(el, stage) {
  let x = 0, y = 0, n = el;
  while (n && n !== stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
}
// A statement or note swap: the old one lifts away, the new one's lines rise in, staggered.
function swap(tl, from, to, at) {
  tl.to(from, { opacity: 0, y: -36, duration: 0.24, ease: 'power2.in' }, at);
  const lines = to.querySelectorAll('.ln');
  if (lines.length) {
    tl.set(to, { opacity: 1 }, at + 0.18);
    tl.fromTo(lines, { opacity: 0, y: 46 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.07 }, at + 0.18);
  } else {
    tl.fromTo(to, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, at + 0.22);
  }
}
// A cursor glides to (x, y) and clicks: a press with the target, and one ring from the point.
function click(tl, cur, ring, x, y, at, move = 0.5) {
  tl.to(cur, { x: x - 4, y: y - 3, duration: move, ease: 'power3.out' }, at - move - 0.08);
  tl.to(cur, { scale: 0.86, duration: 0.08, ease: 'power2.in', yoyo: true, repeat: 1, transformOrigin: '4px 3px' }, at);
  tl.set(ring, { left: x, top: y }, at);
  tl.fromTo(ring, { scale: 0.2, opacity: 0.8 }, { scale: 2.6, opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, at + 0.02);
}
function rise(tl, el, at, d = 0.45, y = 24) {
  tl.fromTo(el, { opacity: 0, y }, { opacity: 1, y: 0, duration: d, ease: 'power3.out' }, at);
}
function fade(tl, el, to, at, d = 0.25) { tl.to(el, { opacity: to, duration: d, ease: 'power2.inOut' }, at); }
// Discrete states: every element of `els` shows alone from its time on (instant swaps).
function steps(tl, els, times) {
  els.forEach((el, i) => {
    if (i > 0) tl.set(el, { opacity: 1 }, times[i]);
    if (i < els.length - 1) tl.set(el, { opacity: 0 }, times[i + 1]);
  });
}
"""


def page(key: str, title: str, duration: float, body: str, plate: str, script: str) -> str:
    return (
        '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">'
        f'<title>{e(title)}</title><script src="{GSAP}"></script>'
        f"<style>{CSS}{COMP_CSS}</style></head><body>"
        f'<div id="root" data-composition-id="{key}" data-start="0" data-duration="{duration}" data-width="1920" data-height="1080">'
        f'<div class="scene clip" id="{key}-scene" data-start="0" data-duration="{duration}" data-track-index="0">{body}'
        f'<div class="plate" id="{key}-plate">{plate}</div></div></div>'
        f"<script>(async () => {{ {JS_HELPERS}\nawait document.fonts.ready;\nconst tl = gsap.timeline({{ paused: true }});\n{script}\n"
        f'tl.to("#{key}-plate", {{ opacity: 1, duration: 0.45, ease: "power2.inOut" }}, {duration - 0.45});\n'
        f'window.__timelines["{key}"] = tl; }})();</script></body></html>'
    )


# ── video 1: ashpack (the host) ──

def host() -> tuple[str, str]:
    k = "host"
    D = 11.2

    def home_page() -> str:
        items = "".join(f'<div style="font-size:22px;color:{APP["text"]}"><span style="color:{ACCENT}">●</span> {t}</div>' for t in ["Status", "Activity", "Skins", "Baton"])
        return (f'<div class="page" id="{k}-pg-home"><div class="col"><b style="font-size:22px;color:{APP["text"]}">Pages</b>{items}'
                f'<div style="font-size:19px;color:{APP["muted"]};line-height:1.35">A mod joins with one Box keyed "ashpack-page:Label". See ADOPTING.md.</div></div></div>')

    def status_page() -> str:
        def chip_row(name: str, sample: str, color: str) -> str:
            return ('<div style="display:flex;gap:14px;align-items:flex-start;padding-left:18px">'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:19px;color:{APP["muted"]}">↑ ↓</span>'
                    f'<div style="flex:1;display:flex;flex-direction:column"><span style="font-size:20px;color:{APP["text"]}">{name}</span>'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:18px;color:{color}">{e(sample)}</span></div>'
                    f'<span style="font-family:\'JetBrains Mono\',monospace;font-size:19px;color:{APP["text"]}">● ON </span></div>')
        return (f'<div class="page" id="{k}-pg-status" style="opacity:0"><div class="col">'
                + setting("Compact mode", "Tool rows fold away; a popup shows the work.")
                + setting("Status chips", "Branch, context and usage by the prompt.")
                + chip_row("Branch", "⎇ main ●1 ↑1", STATUS["ok"]) + chip_row("Context", "ctx ▰▰▱▱▱▱ 24%", STATUS["ok"])
                + chip_row("Session limit", "session ▰▰▰▰▱▱ 70% ↻16m", STATUS["warn"]) + "</div></div>")

    def skins_page() -> str:
        def mini(sid: str, label: str, on: bool) -> str:
            p = pal(sid)
            lines = (f'<div style="color:{p["accent"]}">fix the login bug</div>'
                     f'<div><b style="color:{p["blue"]}">Read</b> <span style="color:{p["muted"]}">auth.ts</span></div>'
                     f'<div><b style="color:{p["yellow"]}">Edit</b> <span style="color:{p["green"]}">+4</span> <span style="color:{p["red"]}">−1</span></div>')
            return (f'<div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;font-size:19px;color:{APP["text"]}">'
                    f'<b>{label}</b><span style="color:{p["green"] if on else APP["muted"]}">{"in use" if on else ""}</span></div>'
                    f'<div style="border:2px solid {p["accent"] if on else p["muted"]};border-radius:10px;background:{p["bg"]};padding:8px 12px;'
                    f'font-family:\'JetBrains Mono\',monospace;font-size:16px;line-height:1.5">{lines}</div></div>')
        grid = "".join(mini(s, label, s == "catppuccin") for s, label in [("catppuccin", "Catppuccin"), ("dracula", "Dracula"), ("nord", "Nord"), ("gruvbox", "Gruvbox")])
        return (f'<div class="page" id="{k}-pg-skins" style="opacity:0"><div class="col">'
                f'<div style="display:flex;gap:22px;font-size:20px;color:{APP["text"]}"><span>Skins on</span><span>Dark</span><span>Charts on</span>'
                f'<span style="color:{APP["muted"]}">Catppuccin</span></div>'
                f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">{grid}</div></div></div>')

    def activity_page() -> str:
        return (f'<div class="page" id="{k}-pg-activity" style="opacity:0"><div class="col">'
                + img("hero-live", f"{k}-a-hero") + img("calls-live", f"{k}-a-calls") + "</div></div>")

    def transcript(width: int, open_: bool, tid: str, typed: bool = False) -> str:
        prompt = (f'<div class="prompt" style="border-color:{APP["line"]};background:{APP["bg"]}">'
                  f'<span id="{tid}-ph" style="color:{APP["muted"]}">Type / for commands</span>'
                  f'<span id="{tid}-typed" style="color:{APP["text"]};font-family:\'JetBrains Mono\',monospace;font-size:23px;white-space:pre"></span>'
                  f'<span class="caret" id="{tid}-caret" style="opacity:0"></span></div>') if typed else prompt_box()
        return (f'<div class="tpane" id="{tid}" style="width:{width}px"><div class="transcript">{turn()}'
                f'<div class="bottom">{chips_ids(tid)}{prompt}{footer_btn(open_, tid + "-btn")}</div></div></div>')

    lines = {
        "s1": ["Every", "mod."], "s2": ["One", 'drawer<span class="hl">.</span>'.replace('drawer<span class="hl">.</span>', '<span class="hl">drawer</span>.')],
        "s3": ["A tab per", '<span class="hl">mod</span>.'], "s4": ["Each mod", "keeps its", '<span class="hl">page</span>.'],
        "s5": ["One", '<span class="hl">drawer</span>.'],
    }
    copy_col = (f'<div class="ccol"><div class="eyebrow">◆ ashpack · the host</div>'
                + "".join(stmt(f"{k}-{sid}", ln, sid == "s1") for sid, ln in lines.items())
                + note(f"{k}-n1", "one strip above the prompt", 2, True) + note(f"{k}-n2", "/ashpack · or click ◆ AshPack ▸", 2, False)
                + note(f"{k}-n3", "Status · Skins · Activity", 3, False) + note(f"{k}-n4", "install it from the prompt", 2, False) + "</div>")
    drawer_w = 488
    body = (transcript(1064, False, f"{k}-tw", typed=True) + transcript(1064 - drawer_w, True, f"{k}-tn").replace(f'id="{k}-tn"', f'id="{k}-tn" style="opacity:0;width:{1064 - drawer_w}px"', 1)
            + f'<div class="dpane" id="{k}-dp" style="width:{drawer_w}px"><div id="{k}-dslide" style="position:absolute;inset:0">'
            + drawer_shell(k, home_page() + status_page() + skins_page() + activity_page(), "Home", drawer_w) + "</div></div>")
    stage = stage_open("ASHPACK / 01 — THE HOST", "v0.12") + copy_col + window_shell(body, f"{k}-win") + cursor_dom(k) + "</div>"

    # The plate: the first frame again, chips not yet in.
    plate_body = transcript(1064, False, "plate-tw").replace('class="schip"', 'class="schip" style="opacity:0"')
    plate = (stage_open("ASHPACK / 01 — THE HOST", "v0.12")
             + f'<div class="ccol"><div class="eyebrow">◆ ashpack · the host</div>{stmt("p-s1", lines["s1"], True)}{note("p-n1", "one strip above the prompt", 2, True)}</div>'
             + window_shell(plate_body, "p-win") + "</div>")

    js = f"""
const stage = S('#{k}-scene .stage');
const cur = S('#{k}-cur'), ring = S('#{k}-ripple');
const chips = [...document.querySelectorAll('#{k}-tw .schip')];
tl.fromTo(chips, {{ opacity: 0, x: 40 }}, {{ opacity: 1, x: 0, duration: 0.5, ease: 'power3.out', stagger: 0.12 }}, 0.25);
swap(tl, S('#{k}-s1'), S('#{k}-s2'), 1.5);
// A2: the cursor opens the drawer from the footer.
swap(tl, S('#{k}-s2'), S('#{k}-s3'), 2.6);
swap(tl, S('#{k}-n1'), S('#{k}-n2'), 2.6);
const btnW = boxOf(S('#{k}-tw-btn'), stage), btnN = boxOf(S('#{k}-tn-btn'), stage);
tl.set(cur, {{ x: 1720, y: 1130 }}, 0);
tl.to(cur, {{ opacity: 1, duration: 0.2 }}, 2.75);
click(tl, cur, ring, btnW.x + btnW.w - 22, btnW.cy, 3.45, 0.62);
tl.fromTo('#{k}-dslide', {{ x: {drawer_w} }}, {{ x: 0, duration: 0.55, ease: 'power3.out' }}, 3.55);
fade(tl, '#{k}-tw', 0, 3.6, 0.3); fade(tl, '#{k}-tn', 1, 3.6, 0.3);
// The tab underline rides under the tab in view.
const tabsBox = boxOf(S('#{k}-tabs'), stage);
const tab = (n) => {{ const b = boxOf(S('#{k}-tab-' + n), stage); return {{ x: b.x - tabsBox.x, w: b.w, cx: b.cx, cy: b.cy }}; }};
const home = tab('home');
tl.set('#{k}-tabbar', {{ x: home.x, scaleX: home.w / 10, y: 32 }}, 0);
const pages = {{ home: '#{k}-pg-home', status: '#{k}-pg-status', skins: '#{k}-pg-skins', activity: '#{k}-pg-activity' }};
let shown = 'home';
function goTab(name, at) {{
  const t = tab(name);
  click(tl, cur, ring, t.cx, t.cy, at, 0.42);
  tl.to('#{k}-tabbar', {{ x: t.x, scaleX: t.w / 10, duration: 0.35, ease: 'power3.inOut' }}, at + 0.04);
  tl.to('#{k}-tab-' + shown, {{ color: '{APP["muted"]}', duration: 0.2 }}, at + 0.04);
  tl.to('#{k}-tab-' + name, {{ color: '{APP["text"]}', duration: 0.2 }}, at + 0.04);
  fade(tl, pages[shown], 0, at + 0.05, 0.16); fade(tl, pages[name], 1, at + 0.1, 0.2);
  shown = name;
}}
// A3: each mod's page, one click each.
swap(tl, S('#{k}-s3'), S('#{k}-s4'), 5.6);
swap(tl, S('#{k}-n2'), S('#{k}-n3'), 5.6);
goTab('status', 6.25); goTab('skins', 7.2); goTab('activity', 8.1);
// A4: the drawer folds; the install command types into the prompt.
swap(tl, S('#{k}-s4'), S('#{k}-s5'), 8.6);
swap(tl, S('#{k}-n3'), S('#{k}-n4'), 8.6);
click(tl, cur, ring, btnN.x + btnN.w - 22, btnN.cy, 9.1, 0.5);
tl.to('#{k}-dslide', {{ x: {drawer_w}, duration: 0.5, ease: 'power3.inOut' }}, 9.2);
fade(tl, '#{k}-tn', 0, 9.25, 0.3); fade(tl, '#{k}-tw', 1, 9.25, 0.3);
tl.to(cur, {{ opacity: 0, x: '+=60', y: '+=80', duration: 0.35, ease: 'power2.in' }}, 9.35);
const CMD = '/plugin install ashpack --marketplace ashishsk93/ashpack';
const typed = S('#{k}-tw-typed'), caret = S('#{k}-tw-caret');
tl.set('#{k}-tw-ph', {{ opacity: 0 }}, 9.55);
const typing = {{ n: 0 }};
tl.to(typing, {{ n: CMD.length, duration: 0.95, ease: 'none', onUpdate: () => {{ typed.textContent = CMD.slice(0, Math.round(typing.n)); }} }}, 9.55);
const blink = {{ p: 0 }};
tl.set(caret, {{ opacity: 1 }}, 9.55);
tl.to(blink, {{ p: Math.PI * 2 * 2.6, duration: 1.2, ease: 'none', onUpdate: () => {{ caret.style.opacity = Math.sin(blink.p) > -0.2 ? '1' : '0'; }} }}, 9.55);
"""
    return page(k, "AshPack — the host", D, stage, plate, js), k


# ── video 2: ashpack-status ──

def status() -> tuple[str, str]:
    k = "status"
    D = 12.0
    drawer_w = 640

    def popup() -> str:
        bars = "".join(f'<rect class="wbar" x="{i * 9}" y="0" width="5" height="18" rx="2.5" fill="{ACCENT}"/>' for i in range(12))
        line = lambda lid, text, vis: f'<b id="{lid}" style="position:absolute;left:0;top:0;color:{ACCENT};white-space:nowrap;opacity:{1 if vis else 0}">{e(text)}</b>'  # noqa: E731
        facts = lambda fid, text, vis: f'<span id="{fid}" style="position:absolute;right:0;top:0;color:{APP["muted"]};opacity:{1 if vis else 0}">{e(text)}</span>'  # noqa: E731
        tasks = lambda tid, text, vis: f'<span id="{tid}" style="position:absolute;left:0;top:0;color:{APP["text"]};opacity:{1 if vis else 0}">{e(text)}</span>'  # noqa: E731
        return (f'<div class="popup" id="{k}-popup" style="opacity:0;position:absolute;left:0;bottom:0;right:auto">'
                f'<div style="position:relative;height:30px"><b style="color:{ACCENT}">◆ AshPack</b><span style="color:{APP["muted"]}"> Fix the login bug</span>'
                + facts(f"{k}-f1", "1/3 · 4s", True) + facts(f"{k}-f2", "2/3 · 9s", False) + facts(f"{k}-f3", "2/3 · 14s", False) + "</div>"
                f'<div style="position:relative;height:30px;display:flex;align-items:center"><div style="position:relative;width:310px;height:30px">'
                + line(f"{k}-l1", "▸ Reading auth.ts…", True) + line(f"{k}-l2", "▸ Editing auth.ts…", False) + line(f"{k}-l3", "▸ Running npm test…", False)
                + f'</div><svg id="{k}-wave" width="108" height="18" viewBox="0 0 108 18" style="display:block">{bars}</svg></div>'
                f'<div style="position:relative;height:30px">' + tasks(f"{k}-k1", "Tasks 1/3", True) + tasks(f"{k}-k2", "Tasks 2/3", False) + "</div></div>")

    def tw(tid: str, plate: bool = False) -> str:
        chips = chips_ids(tid)
        if plate:
            chips = chips.replace('class="schip"', 'class="schip" style="opacity:0"')
        return (f'<div class="tpane" id="{tid}" style="width:1064px"><div class="transcript">{turn(rows=False)}{plain_rows(tid)}'
                f'<div class="bottom"><div class="slot">{chips}{"" if plate else popup()}</div>{prompt_box()}{footer_btn(False, tid + "-btn")}</div></div></div>')

    tn = (f'<div class="tpane" id="{k}-tn" style="width:{1064 - drawer_w}px;opacity:0"><div class="transcript">{turn(rows=False)}'
          f'<div class="bottom">{prompt_box()}{footer_btn(True, k + "-tn-btn")}</div></div></div>')

    sc = PANE_SCALE
    rows_html = lambda rid, rows, vis: (f'<div id="{rid}" style="display:flex;flex-direction:column;gap:10px;opacity:{1 if vis else 0}">'  # noqa: E731
                                         + "".join(f'<div style="font-size:23px;white-space:pre;color:{APP["text"] if r.startswith("▸") else APP["muted"]}" data-turn="{r.split("#")[1].split(" ")[0]}">{e(r)}</div>' for r in rows) + "</div>")
    hero_h, calls_h = SIZES["hero-live"]["height"] * sc, max(SIZES["calls-live"]["height"], SIZES["calls-turn5"]["height"]) * sc
    col = (f'<div class="col" id="{k}-col">'
           f'<div id="{k}-back" style="font-size:22px;color:{APP["text"]};height:30px;opacity:0">← Back to now</div>'
           f'<div class="stack" id="{k}-hero" style="height:{hero_h:.0f}px;opacity:0">{img("hero-live", k + "-h1", sc)}{img("hero-done", k + "-h2", sc, "opacity:0")}{img("hero-turn5", k + "-h3", sc, "opacity:0")}</div>'
           f'<div class="stack" id="{k}-calls" style="height:{calls_h:.0f}px;opacity:0">{img("calls-live", k + "-c1", sc)}{img("calls-done", k + "-c2", sc, "opacity:0")}{img("calls-turn5", k + "-c3", sc, "opacity:0")}</div>'
           f'<b id="{k}-label" style="font-size:24px;color:{APP["text"]};opacity:0">This session</b>'
           f'<div class="stack" id="{k}-tiles" style="height:{SIZES["tiles"]["height"] * sc:.0f}px;opacity:0">'
           + "".join(img(f"tiles-{i}", f"{k}-t{i}", sc, "" if i == 0 else "opacity:0") for i in range(8)) + "</div>"
           f'<div class="stack" id="{k}-timeline" style="height:{SIZES["timeline"]["height"] * sc:.0f}px;opacity:0">{img("timeline", k + "-g1", sc)}{img("timeline-turn5", k + "-g2", sc, "opacity:0")}</div>'
           f'<div class="stack" id="{k}-rows" style="height:180px;opacity:0">{rows_html(k + "-r1", ROWS["now"], True)}{rows_html(k + "-r2", ROWS["turn5"], False)}</div>'
           "</div>")
    drawer_html = drawer_shell(k, f'<div class="page" id="{k}-page">{col}</div>', "Activity", drawer_w)

    lines = {"s1": ["Know", "where you", '<span class="hl">stand</span>.'], "s2": ["Watch it", '<span class="hl">work</span>.'],
             "s3": ["Every turn,", '<span class="hl">kept</span>.'], "s4": ["Look back", '<span class="hl">anytime</span>.']}
    copy_col = (f'<div class="ccol"><div class="eyebrow">◆ ashpack-status</div>'
                + "".join(stmt(f"{k}-{sid}", ln, sid == "s1") for sid, ln in lines.items())
                + note(f"{k}-n1", "branch · context · usage · spend", 3, True) + note(f"{k}-n2", "compact mode", 2, False)
                + note(f"{k}-n3", "the Activity page", 2, False) + note(f"{k}-n4", "click any turn", 2, False) + "</div>")
    camera = ""
    body = (tw(f"{k}-tw") + tn + f'<div class="dpane" id="{k}-dp" style="width:{drawer_w}px"><div id="{k}-dslide" style="position:absolute;inset:0">{drawer_html}</div></div>')
    stage = stage_open("ASHPACK / 02 — STATUS", "v0.14") + copy_col + window_shell(body, f"{k}-win", camera=camera) + cursor_dom(k) + "</div>"
    plate = (stage_open("ASHPACK / 02 — STATUS", "v0.14")
             + f'<div class="ccol"><div class="eyebrow">◆ ashpack-status</div>{stmt("p-s1", lines["s1"], True)}{note("p-n1", "branch · context · usage · spend", 3, True)}</div>'
             + window_shell(tw("p-tw", plate=True), "p-win") + "</div>")

    js = f"""
const stage = S('#{k}-scene .stage');
const cur = S('#{k}-cur'), ring = S('#{k}-ripple');
// B1: the chips rise into the strip by the prompt, and their bars fill.
const chips = [...document.querySelectorAll('#{k}-tw .schip')];
tl.fromTo(chips, {{ opacity: 0, y: 22 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.13 }}, 0.2);
document.querySelectorAll('#{k}-tw .schip img').forEach((b, i) => {{
  tl.fromTo(b, {{ clipPath: 'inset(0 100% 0 0)' }}, {{ clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power2.out' }}, 0.45 + i * 0.13);
}});
// B2: rows fold away; the popup takes the chips' place and narrates.
swap(tl, S('#{k}-s1'), S('#{k}-s2'), 2.6);
swap(tl, S('#{k}-n1'), S('#{k}-n2'), 2.6);
tl.to([0, 1, 2].map(i => '#{k}-tw-row' + i), {{ opacity: 0, y: -14, duration: 0.3, ease: 'power2.in', stagger: 0.06 }}, 2.7);
tl.to(chips, {{ opacity: 0, duration: 0.25, ease: 'power2.in' }}, 2.8);
rise(tl, '#{k}-popup', 2.95, 0.45, 30);
steps(tl, ['#{k}-l1', '#{k}-l2', '#{k}-l3'].map(S), [0, 3.85, 4.7]);
steps(tl, ['#{k}-f1', '#{k}-f2', '#{k}-f3'].map(S), [0, 3.85, 4.7]);
steps(tl, ['#{k}-k1', '#{k}-k2'].map(S), [0, 4.6]);
// The wave: each bar rises and falls a beat after the one before (finite repeats).
tl.fromTo('#{k}-wave .wbar', {{ scaleY: 0.28 }}, {{ scaleY: 1, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: 7, transformOrigin: '50% 50%', stagger: 0.06 }}, 2.6);
// B3: the popup gives way to the Activity page, which keeps the turn; then the turn ends.
swap(tl, S('#{k}-s2'), S('#{k}-s3'), 5.6);
swap(tl, S('#{k}-n2'), S('#{k}-n3'), 5.6);
fade(tl, '#{k}-popup', 0, 5.6, 0.25);
tl.fromTo('#{k}-dslide', {{ x: {drawer_w} }}, {{ x: 0, duration: 0.55, ease: 'power3.out' }}, 5.7);
fade(tl, '#{k}-tw', 0, 5.75, 0.3); fade(tl, '#{k}-tn', 1, 5.75, 0.3);
const activity = S('#{k}-tab-activity'), tabsBox = boxOf(S('#{k}-tabs'), stage), at = boxOf(activity, stage);
tl.set('#{k}-tabbar', {{ x: at.x - tabsBox.x, scaleX: at.w / 10, y: 32 }}, 0);
rise(tl, '#{k}-hero', 6.15); rise(tl, '#{k}-calls', 6.4); rise(tl, '#{k}-label', 6.7, 0.4, 16); rise(tl, '#{k}-tiles', 6.75);
steps(tl, [0, 1, 2, 3, 4, 5, 6, 7].map(i => S('#{k}-t' + i)), [0, 6.95, 7.05, 7.15, 7.25, 7.35, 7.45, 7.55]);
tl.set(['#{k}-timeline', '#{k}-rows'], {{ opacity: 1 }}, 6.8);
fade(tl, '#{k}-h1', 0, 8.0, 0.25); fade(tl, '#{k}-h2', 1, 8.0, 0.25);
fade(tl, '#{k}-c1', 0, 8.0, 0.25); fade(tl, '#{k}-c2', 1, 8.0, 0.25);
// B4: the page scrolls to the turn list; a click on #5 brings that turn back into view.
swap(tl, S('#{k}-s3'), S('#{k}-s4'), 9.4);
swap(tl, S('#{k}-n3'), S('#{k}-n4'), 9.4);
const pageBox = boxOf(S('#{k}-page'), stage), colH = S('#{k}-col').offsetHeight;
const scroll = Math.max(0, colH - S('#{k}-page').offsetHeight + 8);
tl.to('#{k}-col', {{ y: -scroll, duration: 0.6, ease: 'power3.inOut' }}, 9.5);
const row5 = [...document.querySelectorAll('#{k}-r1 [data-turn]')].find(r => r.dataset.turn === '5');
const r5 = boxOf(row5, stage);
tl.set(cur, {{ x: 1760, y: 1120 }}, 0);
tl.to(cur, {{ opacity: 1, duration: 0.2 }}, 10.0);
click(tl, cur, ring, r5.x + 120, r5.cy - scroll, 10.6, 0.5);
[['r1', 'r2'], ['g1', 'g2'], ['h2', 'h3'], ['c2', 'c3']].forEach(([a, b]) => {{ fade(tl, '#{k}-' + a, 0, 10.65, 0.2); fade(tl, '#{k}-' + b, 1, 10.65, 0.2); }});
fade(tl, '#{k}-back', 1, 10.7, 0.2);
tl.to('#{k}-col', {{ y: 0, duration: 0.55, ease: 'power3.inOut' }}, 10.85);
tl.to(cur, {{ opacity: 0, duration: 0.3 }}, 11.0);
"""
    return page(k, "AshPack — status", D, stage, plate, js), k


# ── video 3: ashpack-skins ──

def icon_svg(name: str, iid: str) -> str:
    raw = (CARDS / f"{name}.svg").read_text()
    raw = re.sub(r"<style>.*?</style>", "", raw)
    raw = raw.replace('class="t"', f'id="{iid}-ring"').replace("<svg ", f'<svg id="{iid}" class="icon" ', 1)
    return raw


def inline_card(name: str, prefix: str, scale: float) -> str:
    s = SIZES[name]
    raw = (CARDS / f"{name}.svg").read_text()
    raw = raw.replace("<svg ", f'<svg id="{prefix}" style="display:block;width:{s["width"] * scale:.0f}px;height:{s["height"] * scale:.0f}px" ', 1)
    raw = re.sub(r'<path ([^>]*fill="none"[^>]*)/>', r'<path class="edge" \1/>', raw)
    # Arrowheads are the triangles; a decision node's diamond is a polygon too, and stays.
    raw = re.sub(r'<polygon points="([^"]*)"', lambda m: f'<polygon class="head" points="{m[1]}"' if len(m[1].split()) == 3 else m[0], raw)
    raw = re.sub(r'<rect ([^>]*rx="2" fill="[^"]+" fill-opacity="\.85"[^>]*)/>', r'<rect class="bar" \1/>', raw)
    return raw


def skins() -> tuple[str, str]:
    k = "skins"
    D = 14.2
    order = [("catppuccin", "/skin catppuccin", "tool rows with icons"), ("dracula", "/skin dracula", "diff cards · terminal cards"),
             ("tokyo-night", "/skin tokyo-night", "code cards · table cards"), ("gruvbox", "/skin gruvbox", "alerts · task lists"),
             ("github", "/skin github", "mermaid → 11 chart kinds")]

    def outline(p: dict, text: str) -> str:
        return f'<div style="align-self:flex-start;border:2px solid {p["muted"]};border-radius:14px;padding:10px 20px;color:{p["text"]};font-size:25px">{e(text)}</div>'

    def card(name: str, cid: str, scale: float, p: dict, inline: bool = False) -> str:
        inner = inline_card(name, cid + "-svg", scale) if inline else img(name, cid + "-img", scale)
        return f'<div class="card" id="{cid}" style="opacity:0">{inner}<span class="copybtn" style="color:{APP["muted"]}">Copy</span></div>'

    def layer1(prefix: str, plate: bool = False) -> str:
        p = pal("catppuccin")
        hide = "" if plate else "opacity:0"
        rows = (f'<div class="row" id="{prefix}-r0" style="{hide}">{icon_svg("catppuccin-icon-read", prefix + "-i0")}<b style="color:{p["blue"]}">Read</b><span style="color:{p["muted"]}">src/auth.ts</span><span style="color:{p["muted"]}">0.1s</span></div>'
                f'<div class="row" id="{prefix}-r1" style="{hide}">{icon_svg("catppuccin-icon-write", prefix + "-i1")}<b style="color:{p["yellow"]}">Edit</b><span style="color:{p["muted"]}">src/auth.ts</span><span style="color:{p["green"]}">+4</span><span style="color:{p["red"]}">−1</span><span style="color:{p["muted"]}">1.2s</span></div>'
                f'<div class="row" id="{prefix}-r2" style="{hide}"><span style="position:relative;width:28px;height:28px;flex:none">'
                f'<span id="{prefix}-busy" style="position:absolute;inset:0">{icon_svg("catppuccin-icon-run-busy", prefix + "-i2")}</span>'
                f'<span id="{prefix}-done" style="position:absolute;inset:0;opacity:0">{icon_svg("catppuccin-icon-run", prefix + "-i3")}</span></span>'
                f'<b style="color:{p["green"]}">Run</b><span style="color:{p["muted"]}">npm test</span><span id="{prefix}-time" style="color:{p["muted"]};opacity:0">8.2s</span></div>'
                f'<div id="{prefix}-reply" style="color:{p["text"]};{hide}">All green. The refresh path now checks expiry first.</div>'
                f'<div class="row" id="{prefix}-group" style="{hide}">{icon_svg("catppuccin-icon-read", prefix + "-i4")}<b style="color:{p["blue"]}">Read</b><span style="color:{p["muted"]}">3</span><span style="color:{p["muted"]}">·</span><b style="color:{p["green"]}">Run</b><span style="color:{p["muted"]}">2</span></div>')
        if plate:  # the plate shows the opening frame: prompt and first reply only
            rows = ""
        return f'<div class="transcript">{outline(p, "fix the login bug")}<div style="color:{p["text"]}">Reading the auth module first.</div>{rows}</div>'

    def layer2() -> str:
        p = pal("dracula")
        return f'<div class="transcript">{outline(p, "make the expired-token path refresh")}{card("dracula-diff", k + "-diff", 1.38, p)}{card("dracula-terminal", k + "-term", 1.38, p)}</div>'

    def layer3() -> str:
        p = pal("tokyo-night")
        return (f'<div class="transcript"><div style="color:{p["text"]}">Here is the retry helper, and where each piece lives:</div>'
                f'{card("tokyo-code", k + "-code", 1.38, p)}{card("tokyo-table", k + "-table", 1.38, p)}</div>')

    def layer4() -> str:
        p = pal("gruvbox")
        tasks = "".join(
            f'<div class="{k}-task" style="opacity:0;color:{p["muted"] if done else p["text"]}"><span style="color:{p["green"] if done else p["muted"]}">{"✓" if done else "○"}</span> {e(t)}</div>'
            for t, done in [("Read the code", True), ("Fix the token check", True), ("Add a test", False), ("Update the docs", False)]
        )
        return (f'<div class="transcript"><b id="{k}-head" style="opacity:0;color:{p["accent"]};font-size:30px">Before you ship</b>'
                f'<div id="{k}-alert" style="opacity:0;border:2px solid {p["yellow"]};border-radius:14px;padding:12px 20px;display:flex;flex-direction:column;gap:4px">'
                f'<b style="color:{p["yellow"]}">Warning</b><span style="color:{p["text"]}">Run the migration before you deploy.</span></div>'
                f'<div style="display:flex;flex-direction:column;gap:6px"><span id="{k}-count" style="opacity:0;color:{p["muted"]}">2 of 4 done</span>{tasks}</div>'
                f'<div id="{k}-g-reply" style="opacity:0;color:{p["text"]}">The token check is in. <b>Two steps</b> left, and one note from the last review:</div>'
                f'<div style="padding-left:28px;display:flex;flex-direction:column;font-style:italic;color:{p["muted"]}">'
                f'<span class="{k}-q" style="opacity:0">Keep the refresh path small.</span><span class="{k}-q" style="opacity:0">One retry, then sign the user out.</span></div></div>')

    def layer5() -> str:
        p = pal("github")
        return f'<div class="transcript">{card("github-flow", k + "-flow", 1.25, p, inline=True)}{card("github-bars", k + "-bars", 1.2, p, inline=True)}</div>'

    layers = [layer1(k), layer2(), layer3(), layer4(), layer5()]
    body = "".join(f'<div class="layer" id="{k}-L{i}" style="opacity:{1 if i == 0 else 0}">{html}</div>' for i, html in enumerate(layers))
    tokens = "".join(f'<div class="ctoken" id="{k}-tok{i}" style="color:{pal(sid)["accent"]};opacity:{1 if i == 0 else 0}">{e(tok)}</div>' for i, (sid, tok, _) in enumerate(order))
    notes = "".join(f'<div class="cnote" id="{k}-note{i}" style="top:590px;opacity:{1 if i == 0 else 0}">{e(n)}</div>' for i, (_, _, n) in enumerate(order))
    anchor = stmt(f"{k}-anchor", ['One <span class="hl">pick</span>.'], True)
    copy_col = f'<div class="ccol"><div class="eyebrow">◆ ashpack-skins</div>{anchor}{tokens}{notes}</div>'
    stage = stage_open("ASHPACK / 03 — SKINS", "v0.9") + copy_col + window_shell(body, f"{k}-win") + "</div>"
    plate = (stage_open("ASHPACK / 03 — SKINS", "v0.9")
             + f'<div class="ccol"><div class="eyebrow">◆ ashpack-skins</div>{stmt("p-anchor", ["One <span class=\"hl\">pick</span>."], True)}'
             + f'<div class="ctoken" style="color:{pal("catppuccin")["accent"]}">/skin catppuccin</div><div class="cnote" style="top:590px">tool rows with icons</div></div>'
             + window_shell(f'<div class="layer">{layer1("p", plate=True)}</div>', "p-win") + "</div>")

    js = f"""
// The pinned anchor ("One pick." and the window) never moves; each skin is a complete layer.
const MORPH = 0.35;
function morph(i, at) {{
  tl.to('#{k}-L' + (i - 1), {{ opacity: 0, duration: MORPH, ease: 'power2.inOut' }}, at);
  tl.fromTo('#{k}-L' + i, {{ opacity: 0 }}, {{ opacity: 1, duration: MORPH, ease: 'power2.inOut' }}, at);
  tl.set('#{k}-tok' + (i - 1), {{ opacity: 0 }}, at + MORPH / 2); tl.set('#{k}-tok' + i, {{ opacity: 1 }}, at + MORPH / 2);
  tl.set('#{k}-note' + (i - 1), {{ opacity: 0 }}, at + MORPH / 2); tl.set('#{k}-note' + i, {{ opacity: 1 }}, at + MORPH / 2);
}}
// C1 — Catppuccin: the rows arrive; Run's ring turns, then lands with its time.
['#{k}-r0', '#{k}-r1', '#{k}-r2'].forEach((r, i) => rise(tl, r, 0.35 + i * 0.25, 0.4, 16));
tl.fromTo('#{k}-i2-ring', {{ rotation: 0 }}, {{ rotation: 430, duration: 1.05, ease: 'none', svgOrigin: '12 12' }}, 0.85);
fade(tl, '#{k}-busy', 0, 1.9, 0.15); fade(tl, '#{k}-done', 1, 1.9, 0.15); fade(tl, '#{k}-time', 1, 1.95, 0.2);
rise(tl, '#{k}-reply', 2.1, 0.4, 14); rise(tl, '#{k}-group', 2.35, 0.4, 14);
// C2 — Dracula: diff and terminal cards.
morph(1, 2.8); rise(tl, '#{k}-diff', 3.25, 0.5); rise(tl, '#{k}-term', 3.85, 0.5);
// C3 — Tokyo Night: the code card types out top to bottom, then the table.
morph(2, 5.6); rise(tl, '#{k}-code', 6.0, 0.35, 12);
tl.fromTo('#{k}-code-img', {{ clipPath: 'inset(0 0 100% 0)' }}, {{ clipPath: 'inset(0 0 0% 0)', duration: 0.7, ease: 'power2.out' }}, 6.05);
rise(tl, '#{k}-table', 6.85, 0.45);
// C4 — Gruvbox: heading, alert, the task list, a reply, a quote.
morph(3, 8.4); rise(tl, '#{k}-head', 8.7, 0.4, 14); rise(tl, '#{k}-alert', 8.95, 0.45);
rise(tl, '#{k}-count', 9.25, 0.35, 10);
tl.fromTo('.{k}-task', {{ opacity: 0, y: 12 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', stagger: 0.1 }}, 9.35);
rise(tl, '#{k}-g-reply', 9.95, 0.4, 12);
tl.fromTo('.{k}-q', {{ opacity: 0, y: 10 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', stagger: 0.12 }}, 10.2);
// C5 — GitHub: the flowchart draws its edges; the bars grow.
morph(4, 11.0); rise(tl, '#{k}-flow', 11.3, 0.4, 14);
const edges = [...document.querySelectorAll('#{k}-flow-svg .edge')], heads = [...document.querySelectorAll('#{k}-flow-svg .head')];
edges.forEach((p, i) => {{
  const len = p.getTotalLength() * 1.05;
  p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
  tl.to(p, {{ strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }}, 11.55 + i * 0.14);
}});
heads.forEach((h, i) => tl.fromTo(h, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.15 }}, 11.95 + i * 0.14));
rise(tl, '#{k}-bars', 12.2, 0.4, 14);
// Each bar grows up from its foot: its own y and height, read from the drawing at build time.
[...document.querySelectorAll('#{k}-bars-svg .bar')].forEach((b, i) => {{
  const y = +b.getAttribute('y'), h = +b.getAttribute('height');
  tl.fromTo(b, {{ attr: {{ y: y + h, height: 0 }} }}, {{ attr: {{ y, height: h }}, duration: 0.55, ease: 'power3.out' }}, 12.4 + i * 0.08);
}});
"""
    return page(k, "AshPack — skins", D, stage, plate, js), k


# Text inside the window, lifted a few percent so it holds 4.5:1 on the app's dark background
# (the mods' own mid-tones aim at 3.9:1 on both themes; the video is dark only).
LEGIBLE = {
    "#8a8884": "#908e8a",  # the app's muted grey: titlebar, tabs, hints
    "#1a9450": "#229856",  # chip green
    "#a87700": "#ac7d0b",  # chip amber
    "#2f7bf0": "#3b83f1",  # chip blue
    'style="fill:#8b949e"': 'style="fill:#959ea8"',  # GitHub chart labels
}

VIDEOS = [("host", "ashpack.html", 11.2), ("status", "status.html", 12.0), ("skins", "skins.html", 14.2)]


def hub() -> str:
    """index.html: the three loops back to back, for the Studio preview. Each renders on its own."""
    mounts, at = [], 0.0
    for i, (key, name, dur) in enumerate(VIDEOS):
        mounts.append(f'<div id="{key}" data-composition-id="{key}" data-composition-src="compositions/{name}" data-start="{at:g}" data-duration="{dur:g}" data-track-index="{i}" style="position:absolute;inset:0"></div>')
        at += dur
    return (
        '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">'
        f'<script src="{GSAP}"></script><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:1920px;height:1080px;overflow:hidden;background:#0e0c13}}'
        '#hub{position:relative;width:100%;height:100%;overflow:hidden}</style></head><body>'
        f'<div id="hub" data-composition-id="hub" data-start="0" data-duration="{at:g}" data-width="1920" data-height="1080">{"".join(mounts)}</div>'
        '<script>window.__timelines["hub"] = gsap.timeline({ paused: true });</script></body></html>'
    )


if __name__ == "__main__":
    (ROOT / "compositions").mkdir(exist_ok=True)
    for build in (host, status, skins):
        html, key = build()
        name = next(n for k, n, _ in VIDEOS if k == key)
        for was, now in LEGIBLE.items():
            html = html.replace(was, now)
        (ROOT / "compositions" / name).write_text(html.replace('src="assets/', 'src="../assets/'))
        print(f"wrote compositions/{name}")
    (ROOT / "index.html").write_text(hub())
    print("wrote index.html")
