import type { Activity, Call, CallKind, History, StatusData, Totals, Turn } from '../types'
import type { Colors, Row, TextSpan } from './format'
import { bar, cardCounts, ellipsis, lasted, latest, LEVELS, levelColor, lineOf, MARK_OF, money, took, waveSvg } from './format'

// The Activity page, pure: the turn history and the session's totals, what the page shows,
// and its drawings. The desktop gets SVG cards; the terminal, the same facts as text spans.

export const MAX_TURNS = 30 // finished turns the page keeps, the latest
// ponytail: a longer turn counts its latest 500 calls on the Activity page; keep running tallies if that bites
export const MAX_CALLS = 500 // calls a turn keeps, the latest
export const CALL_ROWS = 12 // calls the page lists at first, the latest; Show more adds as many again
export const SVG_ROWS = 64 // calls one drawing holds: the desktop refuses an image over 131072 characters, and a row of escaped text is 1.7k
const MAX_FILES = 500 // edited paths the totals keep, to count them

export const NO_TOTALS: Totals = { turns: 0, workMs: 0, calls: 0, failed: 0, added: 0, removed: 0, files: [] }
export const NO_HISTORY: History = { turns: [], totals: NO_TOTALS }

// A call starts: its line heads the popup, and a call of the main thread joins the turn's
// list (the latest MAX_CALLS); a subagent's call is a line alone.
export const startCall = (a: Activity, id: string, label: string, call: Pick<Call, 'kind' | 'target'> | null): Activity => ({
  ...a,
  steps: [...a.steps, { id, label }],
  calls: call ? [...a.calls, { id, kind: call.kind, target: call.target, state: 'running' as const }].slice(-MAX_CALLS) : a.calls,
})

// A call ends: its line leaves the popup (the latest still running takes it, else thinking)
// and its row says how it went, how long it took, an edit's size.
export const settleCall = (a: Activity, id: string, end: { isFailed: boolean; ms: number; size?: { added: number; removed: number } }): Activity => ({
  ...a,
  steps: a.steps.filter(s => s.id !== id),
  calls: a.calls.map(x => (x.id === id ? { ...x, state: end.isFailed ? ('failed' as const) : ('ok' as const), ms: end.ms, ...end.size } : x)),
})

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

// The live turn, finished: a call still running when it ended (an interrupt) counts as failed.
export const turnOf = (a: Activity, end: { ms: number; outcome: Turn['outcome']; costUsd?: number; usage?: Usage }): Turn => ({
  n: a.n,
  prompt: a.prompt,
  startedAt: a.startedAt,
  ms: end.ms,
  calls: a.calls.map(c => (c.state === 'running' ? { ...c, state: 'failed' as const } : c)),
  outcome: end.outcome,
  ...(end.costUsd !== undefined && end.costUsd >= 0 ? { costUsd: end.costUsd } : {}),
  ...(end.usage
    ? { tokensIn: end.usage.input_tokens + end.usage.cache_read_input_tokens + end.usage.cache_creation_input_tokens, tokensOut: end.usage.output_tokens }
    : {}),
})

const edited = (calls: readonly Call[]): string[] => calls.filter(c => c.kind === 'edit' && c.state === 'ok' && c.target).map(c => c.target)

export const withTurn = (h: History, turn: Turn): History => ({ turns: [...h.turns, turn].slice(-MAX_TURNS), totals: addTurn(h.totals, turn) })

export const addTurn = (t: Totals, turn: Turn): Totals => ({
  since: t.since ?? turn.startedAt,
  turns: t.turns + 1,
  workMs: t.workMs + turn.ms,
  calls: t.calls + turn.calls.length,
  failed: t.failed + turn.calls.filter(c => c.state === 'failed').length,
  added: t.added + turn.calls.reduce((s, c) => s + (c.added ?? 0), 0),
  removed: t.removed + turn.calls.reduce((s, c) => s + (c.removed ?? 0), 0),
  files: [...new Set([...t.files, ...edited(turn.calls)])].slice(-MAX_FILES),
})

// What the page shows: the turn picked, else the running one, else the last; null before any.
export type Shown = Omit<Turn, 'ms' | 'outcome'> & { label: string; isLive: boolean; ms?: number; outcome?: Turn['outcome'] }

export const shownOf = (a: Activity | null, turns: readonly Turn[], pick: number | null): Shown | null => {
  const picked = pick === null ? undefined : turns.find(t => t.n === pick)
  if (picked) return { ...picked, label: picked.prompt, isLive: false }
  if (a) return { n: a.n, prompt: a.prompt, startedAt: a.startedAt, calls: a.calls, label: lineOf(a), isLive: true }
  const last = turns.at(-1)
  return last ? { ...last, label: last.prompt, isLive: false } : null
}

// ── numbers ──

// 820, 12.4k, 38k, 1.2M
export const tokens = (n: number): string =>
  n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${(n / 1_000_000).toFixed(1)}M`

// A finished turn's facts after its title: calls, time in tools, cost, tokens.
export const turnFacts = (s: Shown): string[] => {
  // Calls can overlap, so their time added up may pass the turn's own.
  const toolMs = s.calls.reduce((sum, c) => sum + (c.ms ?? 0), 0)
  return [
    s.calls.length === 0 ? 'no tools' : `${s.calls.length} ${s.calls.length === 1 ? 'call' : 'calls'}`,
    toolMs >= 1000 ? `tool time ${lasted(toolMs)}` : '',
    s.costUsd !== undefined ? money(s.costUsd) : '',
    s.tokensIn !== undefined ? `${tokens(s.tokensIn)} in · ${tokens(s.tokensOut ?? 0)} out` : '',
  ].filter(Boolean)
}

// A turn's button in the list: its number, what was asked, how long, how many calls.
export const turnLabel = (t: { n: number; prompt: string; ms?: number; calls: readonly Call[] }, chars: number): string => {
  const tail = ` · ${t.ms === undefined ? 'working' : lasted(t.ms)} · ${t.calls.length}`
  const prompt = (t.prompt || 'no prompt').replace(/\s+/g, ' ')
  const room = Math.max(8, chars - tail.length - `#${t.n}  `.length)
  return `#${t.n}  ${ellipsis(prompt, room)}${tail}`
}

export type Tile = { label: string; value: TextSpan[]; sub?: TextSpan }

// The session's tiles: the finished turns' totals with the running turn's so far. The session's
// time runs from its first turn here, so it counts what the turns count (a resumed session's
// own start is its first launch).
export const sessionTiles = (t: Totals, a: Activity | null, now: number, c: Colors, costUsd?: number): Tile[] => {
  const live = a ? addTurn(t, turnOf(a, { ms: Math.max(0, now - a.startedAt), outcome: 'answer' })) : t
  const failed = a ? live.failed - a.calls.filter(x => x.state === 'running').length : live.failed // running is not failed yet
  return [
    { label: 'Session', value: [{ text: live.since !== undefined ? lasted(now - live.since) : '—' }] },
    { label: 'Working', value: [{ text: lasted(live.workMs) }] },
    { label: 'Turns', value: [{ text: String(live.turns) }] },
    { label: 'Tool calls', value: [{ text: String(live.calls) }], ...(failed > 0 ? { sub: { text: `${failed} failed`, color: c.hot } } : {}) },
    {
      label: 'Lines',
      value: [{ text: `+${live.added}`, color: c.ok }, { text: ` −${live.removed}`, color: c.hot }],
      sub: { text: `${live.files.length} ${live.files.length === 1 ? 'file' : 'files'}` },
    },
    { label: 'Spend', value: [{ text: costUsd !== undefined ? money(costUsd) : '—' }] },
  ]
}

// The desktop's cards are images: what each says, for a screen reader.
export const heroAlt = (s: Shown | null): string =>
  !s ? 'No turns yet' : s.isLive ? `Turn ${s.n}, working: ${s.label}` : `Turn ${s.n}, ${s.outcome ?? 'answer'}: ${s.prompt}. ${turnFacts(s).join(', ')}`

export const tilesAlt = (tiles: readonly Tile[]): string => tiles.map(t => `${t.label} ${t.value.map(x => x.text).join('')}${t.sub ? ` (${t.sub.text})` : ''}`).join(', ')

// What the page draws, from what it reads: the turn in view, its calls under the filter (the
// latest `limit`), a bar per turn, the session's tiles. The ended turn joins the history a
// write before the live one clears, so a live turn the totals count already is not counted twice;
// a turn picked that has since left the history is no pick.
export const activityView = (r: {
  held: Activity | null
  history: History
  picked: number | null
  filter: CallKind | 'all'
  limit: number
  data: StatusData | null
  c: Colors
  now: number
}) => {
  const { turns: list, totals } = r.history
  const a = r.held && r.held.n > totals.turns ? r.held : null
  const pick = list.some(x => x.n === r.picked) ? r.picked : null
  const shown = shownOf(a, list, pick)
  const kinds = shown ? cardCounts(shown.calls) : []
  const kind = kinds.some(k => k.kind === r.filter) ? r.filter : 'all'
  const { shown: calls, earlier } = latest(shown ? shown.calls.filter(x => kind === 'all' || x.kind === kind) : [], r.limit)
  const bars = [...list, ...(a ? [{ n: a.n, prompt: a.prompt, ms: Math.max(0, r.now - a.startedAt), calls: a.calls, isLive: true as const }] : [])]
  const tiles = sessionTiles(totals, a, r.now, r.c, r.data?.costUsd)
  return { pick, shown, kind, kinds, calls, earlier, bars, c: r.c, now: r.now, tiles, context: r.data?.contextPercent }
}

export type ActivityView = ReturnType<typeof activityView>

// ── kinds ──

export const TAG: Record<CallKind, string> = { read: 'READ', edit: 'EDIT', command: 'RUN', search: 'FIND', web: 'WEB', agent: 'AGENT', skill: 'SKILL', tool: 'TOOL' }

// Each kind its hue: the skin's when it shares them, else mid-tones that read on light and dark.
export const kindColor = (k: CallKind, c: Colors): string =>
  ({ read: c.blue, edit: c.warn, command: c.ok, search: c.purple ?? '#6366f1', web: c.cyan ?? '#0e8fa0', agent: c.pink ?? '#d03f8f', skill: c.accent, tool: c.muted })[k]

const mixOf = (calls: readonly Call[], c: Colors) => cardCounts(calls).map(k => ({ ...k, color: kindColor(k.kind, c) }))

// ── the terminal's pictures ──

// The turn's calls as one bar of `width` cells, a run per kind as long as its share.
export const mixCells = (calls: readonly Call[], width: number, c: Colors): TextSpan[] => {
  const mix = mixOf(calls, c)
  if (mix.length === 0) return [{ text: '─'.repeat(width), dim: true }]
  let used = 0
  return mix.map((k, i) => {
    const cells = i === mix.length - 1 ? width - used : Math.max(1, Math.round((k.count / calls.length) * width))
    used += cells
    return { text: '━'.repeat(Math.max(0, cells)), color: k.color }
  })
}

type Bar = { n: number; ms: number; calls: readonly Call[]; isLive?: boolean }

// The turns as a row of bars, each as tall as the turn was long, in its busiest kind's hue.
export const sparkCells = (bars: readonly Bar[], c: Colors, pick: number | null): TextSpan[] => {
  const max = Math.max(1, ...bars.map(b => b.ms))
  return bars.map(b => {
    const top = mixOf(b.calls, c).sort((x, y) => y.count - x.count)[0]
    return { text: LEVELS[Math.round(Math.sqrt(b.ms / max) * 7)] ?? '▁', color: top?.color ?? c.muted, dim: pick !== null && b.n !== pick }
  })
}

// The head's rows, in its tone: how the turn stands and its time, what it does now or what was
// asked, its prompt or its facts, its calls by kind. The wave is the popup's: here the time
// ticks once a second, so the drawer is not drawn again eight times a second.
export const heroRows = (s: Shown | null, now: number, width: number, c: Colors): { tone: string; rows: Row[] } => {
  if (!s) return { tone: c.accent, rows: [{ spans: [{ text: 'Ready when you are', bold: true }] }, { spans: [{ text: 'Each turn’s tool calls, timings and cost land here.', dim: true }] }] }
  const tone = s.isLive ? c.accent : s.outcome === 'answer' ? c.ok : c.hot
  const head = `${s.isLive ? '●' : MARK_OF[s.outcome ?? 'answer']} TURN ${s.n} · ${s.isLive ? 'WORKING' : WORD[s.outcome ?? 'answer']}`
  return {
    tone,
    rows: [
      { spans: [{ text: head, color: tone, bold: true }], right: { text: lasted(s.isLive ? now - s.startedAt : (s.ms ?? 0)), dim: true } },
      { spans: [{ text: s.isLive ? `${s.label}…` : s.prompt || `Turn ${s.n}`, bold: true }] },
      { spans: [{ text: s.isLive ? (s.prompt ? `“${s.prompt}”` : ' ') : turnFacts(s).join(' · '), dim: true }] },
      { spans: mixCells(s.calls, width, c) },
    ],
  }
}

// The context's fill as a bar of `cols`' room, and the turns as a row of bars.
export const contextRow = (pct: number, cols: number, c: Colors): TextSpan[] => {
  const [lit, track] = bar(pct, Math.max(8, Math.min(24, cols - 16)))
  return [{ text: 'CONTEXT ', dim: true }, { text: lit, color: levelColor(pct, c) }, { text: track, dim: true }, { text: ` ${pct}%`, bold: true }]
}

export const timelineRow = (bars: readonly Bar[], cols: number, c: Colors, pick: number | null): TextSpan[] => [{ text: 'TIMELINE ', dim: true }, ...sparkCells(bars.slice(-(cols - 8)), c, pick)]

// ── the desktop's drawings ──
// Each an SVG card on its own background: the skin's when one is on, else light or dark as
// the app is (the media query), so the text reads whichever the app is drawn in.

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif`
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`

// XML has no place for control characters (a pasted escape code): dropped, or the card would not draw.
const esc = (t: string): string =>
  t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rules = (bg: string, text: string, sub: string): string =>
  `.bg{fill:${bg}}.t{fill:${text}}.s{fill:${sub}}.k{fill:${text};fill-opacity:.07}.ln{stroke:${text};stroke-opacity:.12}`

const themeCss = (c: Colors): string =>
  `<style>${c.bg && c.text ? rules(c.bg, c.text, c.muted) : `${rules('#ffffff', '#1f1e1b', '#6e6c66')}@media (prefers-color-scheme: dark){${rules('#262624', '#ecebe6', '#a2a098')}}`}</style>`

// The page's width in pixels, from the cells the pane has.
export const pagePx = (columns: number): number => Math.round(Math.min(760, Math.max(300, columns * 7.2)))

// Rough widths, for cutting text to fit: monospace is exact, the rest a fair average.
const widthOf = (t: string, size: number, font: 'sans' | 'mono' | 'caps' = 'sans'): number =>
  [...t].length * size * { sans: 0.56, mono: 0.6, caps: 0.74 }[font]

const clip = (t: string, px: number, size: number, font: 'sans' | 'mono' = 'sans'): string =>
  ellipsis(t, Math.max(1, Math.floor(px / (size * (font === 'mono' ? 0.6 : 0.56)))))

type TextOpts = { x: number; y: number; size: number; cls?: string; fill?: string; weight?: number; end?: boolean; middle?: boolean; mono?: boolean; caps?: boolean }

// A line of text; `body` is escaped already (or tspans).
const text = (o: TextOpts, body: string): string =>
  `<text x="${o.x}" y="${o.y}" font-family="${o.mono ? MONO : SANS}" font-size="${o.size}"` +
  `${o.weight ? ` font-weight="${o.weight}"` : ''}${o.end ? ' text-anchor="end"' : o.middle ? ' text-anchor="middle"' : ''}` +
  `${o.caps ? ' letter-spacing=".08em"' : ''}${o.cls ? ` class="${o.cls}"` : ''}${o.fill ? ` fill="${o.fill}"` : ''}` +
  ` style="font-variant-numeric:tabular-nums" xml:space="preserve">${body}</text>`

const tspan = (t: string, color?: string, cls?: string): string => `<tspan${color ? ` fill="${color}"` : ''}${cls ? ` class="${cls}"` : ''}>${esc(t)}</tspan>`

const spans = (list: readonly TextSpan[]): string => list.map(s => tspan(s.text, s.color, s.color ? undefined : s.dim ? 's' : 't')).join('')

const svg = (w: number, h: number, c: Colors, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${themeCss(c)}${body}</svg>`

const cardRect = (w: number, h: number, stroke?: string): string =>
  stroke
    ? `<rect class="bg" x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" stroke="${stroke}" stroke-opacity=".55"/>`
    : `<rect class="bg ln" x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12"/>`

type MarkState = 'live' | 'ok' | 'failed'

// A call's or a turn's state: a dot with a ripple while it runs, a tick, a cross.
const mark = (state: MarkState, x: number, y: number, c: Colors): string => {
  if (state === 'live')
    return (
      `<circle cx="${x}" cy="${y}" r="4" fill="${c.accent}" opacity=".25"><animate attributeName="r" values="4;8;4" dur="1.6s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values=".35;0;.35" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="${x}" cy="${y}" r="3.5" fill="${c.accent}"/>`
    )
  if (state === 'ok') return `<path d="M${x - 4.5} ${y}l3 3 6-6.5" fill="none" stroke="${c.ok}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<path d="M${x - 3.5} ${y - 3.5}l7 7M${x + 3.5} ${y - 3.5}l-7 7" stroke="${c.hot}" stroke-width="1.8" stroke-linecap="round"/>`
}

const callState = (call: Call): MarkState => (call.state === 'running' ? 'live' : call.state)

// How a turn ended, in the head's word.
export const WORD: Record<Turn['outcome'], string> = { answer: 'DONE', aborted: 'STOPPED', refusal: 'REFUSED', error: 'FAILED' }
const WAVE_PX = 64

// The page's head: the turn in view. Running, what it does now with the wave beside it; done,
// what was asked and how it went. Under it, its calls as a bar of hues and their counts.
export const heroSvg = (s: Shown | null, c: Colors, w: number): { source: string; height: number } => {
  const x0 = 20
  const right = w - 18
  if (!s) {
    const h = 78
    return {
      source: svg(w, h, c, cardRect(w, h) + text({ x: x0, y: 32, size: 16, weight: 650, cls: 't' }, 'Ready when you are') + text({ x: x0, y: 54, size: 12, cls: 's' }, esc(clip('Each turn’s tool calls, timings and cost land here.', w - 40, 12)))),
      height: h,
    }
  }
  const h = 128
  const state: MarkState = s.isLive ? 'live' : s.outcome === 'answer' ? 'ok' : 'failed'
  const tone = { live: c.accent, ok: c.ok, failed: c.hot }[state]
  const word = s.isLive ? 'WORKING' : WORD[s.outcome ?? 'answer']
  const head =
    `<rect x="0" y="18" width="3" height="${h - 36}" rx="1.5" fill="${tone}"/>` +
    mark(state, x0 + 4, 24, c) +
    text({ x: x0 + 16, y: 28, size: 10.5, weight: 650, caps: true }, tspan(`TURN ${s.n}`, undefined, 's') + tspan(` · ${word}`, tone))
  const side = s.isLive
    ? `<g transform="translate(${right - WAVE_PX} 17)">${waveSvg(c.accent, WAVE_PX)}</g>`
    : text({ x: right, y: 28, size: 12, weight: 600, cls: 't', end: true }, esc(lasted(s.ms ?? 0)))
  const title = s.isLive ? `${s.label}…` : s.prompt || `Turn ${s.n}`
  const sub = s.isLive ? (s.prompt ? `“${s.prompt}”` : '') : turnFacts(s).join('  ·  ')
  const body =
    text({ x: x0, y: 58, size: 17, weight: 650, cls: 't' }, esc(clip(title.replace(/\s+/g, ' '), right - x0, 17))) +
    (sub ? text({ x: x0, y: 79, size: 12, cls: 's' }, esc(clip(sub.replace(/\s+/g, ' '), right - x0, 12))) : '')
  return { source: svg(w, h, c, cardRect(w, h, s.isLive ? c.accent : undefined) + head + side + body + mixBar(s.calls, c, x0, right, 94) + legend(s.calls, c, x0, right, 116)), height: h }
}

// The calls' kinds as one rounded bar, a run per kind as long as its share.
const mixBar = (calls: readonly Call[], c: Colors, x0: number, x1: number, y: number): string => {
  const track = `<rect class="k" x="${x0}" y="${y}" width="${x1 - x0}" height="6" rx="3"/>`
  const mix = mixOf(calls, c)
  if (mix.length === 0) return track
  const gap = 2
  const room = x1 - x0 - gap * (mix.length - 1)
  let x = x0
  return (
    track +
    mix
      .map(k => {
        const bw = Math.max(3, (k.count / calls.length) * room)
        const r = `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="6" rx="3" fill="${k.color}"/>`
        x += bw + gap
        return r
      })
      .join('')
  )
}

// Each kind's swatch and count, as many as fit, the total at the right.
const legend = (calls: readonly Call[], c: Colors, x0: number, x1: number, y: number): string => {
  const total = calls.length === 0 ? 'no tool calls yet' : `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`
  const stop = x1 - widthOf(total, 11) - 16
  let x = x0
  const items = mixOf(calls, c).flatMap(k => {
    const label = `${k.label} ${k.count}`
    const iw = 12 + widthOf(label, 11)
    if (x + iw > stop) return []
    const item = `<rect x="${x}" y="${y - 8}" width="8" height="8" rx="2" fill="${k.color}"/>` + text({ x: x + 12, y, size: 11, cls: 's' }, esc(label))
    x += iw + 14
    return [item]
  })
  return items.join('') + text({ x: x1, y, size: 11, cls: 's', end: true }, esc(total))
}

const ROW = 30

// A turn's calls, one row each: how it went, its kind, what it acted on, an edit's size, how long.
// At most SVG_ROWS of them, the latest, so no list makes an image the desktop refuses.
export const callsSvg = (list: readonly Call[], before: number, c: Colors, w: number): { source: string; height: number } => {
  const { shown: calls, earlier: cut } = latest(list, SVG_ROWS)
  const earlier = before + cut
  const right = w - 16
  const top = earlier > 0 ? 26 : 6 // `+ N earlier` heads the list
  const rows = calls.map((call, i) => {
    const cy = top + i * ROW + ROW / 2
    const color = kindColor(call.kind, c)
    const time = call.state === 'running' ? '…' : call.ms !== undefined ? took(call.ms) : ''
    const size = call.added || call.removed ? [`+${call.added ?? 0}`, ` −${call.removed ?? 0}`] : null
    const timeW = widthOf(time, 11.5) + 10
    const sizeW = size ? widthOf(size.join(''), 11.5) + 12 : 0
    const tx = 84
    return (
      mark(callState(call), 22, cy, c) +
      `<rect x="34" y="${cy - 8}" width="42" height="16" rx="8" fill="${color}" fill-opacity=".14"/>` +
      text({ x: 55, y: cy + 3.5, size: 8.5, weight: 700, caps: true, middle: true, fill: color }, TAG[call.kind]) +
      text({ x: tx, y: cy + 4, size: 12, mono: true, cls: 't' }, esc(clip(call.target || '—', right - tx - timeW - sizeW, 12, 'mono'))) +
      (size ? text({ x: right - timeW, y: cy + 4, size: 11.5, end: true }, tspan(size[0] ?? '', c.ok) + tspan(size[1] ?? '', c.hot)) : '') +
      text({ x: right, y: cy + 4, size: 11.5, cls: 's', end: true }, esc(time)) +
      (i < calls.length - 1 ? `<line class="ln" x1="16" y1="${top + (i + 1) * ROW}" x2="${right}" y2="${top + (i + 1) * ROW}"/>` : '')
    )
  })
  const head = earlier > 0 ? text({ x: 18, y: 22, size: 11, cls: 's' }, esc(`+ ${earlier} earlier`)) : ''
  const h = top + calls.length * ROW + 6
  return { source: svg(w, h, c, cardRect(w, h) + head + rows.join('')), height: h }
}

// The session's tiles, three or two to a row, and the context's fill as a meter under them.
export const tilesSvg = (tiles: readonly Tile[], context: number | undefined, c: Colors, w: number): { source: string; height: number } => {
  const cols = w >= 420 ? 3 : 2
  const gap = 8
  const tw = (w - gap * (cols - 1)) / cols
  const th = 62
  const drawn = tiles.map((t, i) => {
    const x = (i % cols) * (tw + gap)
    const y = Math.floor(i / cols) * (th + gap)
    return (
      `<rect class="bg ln" x="${x + 0.5}" y="${y + 0.5}" width="${tw - 1}" height="${th - 1}" rx="10"/>` +
      text({ x: x + 12, y: y + 21, size: 9.5, weight: 650, caps: true, cls: 's' }, esc(t.label.toUpperCase())) +
      (t.sub ? text({ x: x + tw - 12, y: y + 21, size: 10.5, end: true, ...(t.sub.color ? { fill: t.sub.color } : { cls: 's' }) }, esc(t.sub.text)) : '') +
      text({ x: x + 12, y: y + 47, size: 19, weight: 650 }, spans(t.value))
    )
  })
  const rowsH = Math.ceil(tiles.length / cols) * (th + gap) - gap
  if (context === undefined) return { source: svg(w, rowsH, c, drawn.join('')), height: rowsH }
  const y = rowsH + gap
  const pct = Math.max(0, Math.min(100, Math.round(context)))
  const [bx, bw] = [96, w - 96 - 58]
  const meter =
    `<rect class="bg ln" x=".5" y="${y + 0.5}" width="${w - 1}" height="39" rx="10"/>` +
    text({ x: 12, y: y + 24, size: 9.5, weight: 650, caps: true, cls: 's' }, 'CONTEXT') +
    `<rect class="k" x="${bx}" y="${y + 17}" width="${bw}" height="6" rx="3"/>` +
    `<rect x="${bx}" y="${y + 17}" width="${Math.max(3, (bw * pct) / 100).toFixed(1)}" height="6" rx="3" fill="${levelColor(pct, c)}"/>` +
    text({ x: w - 12, y: y + 25, size: 13, weight: 650, cls: 't', end: true }, `${pct}%`)
  return { source: svg(w, y + 40, c, drawn.join('') + meter), height: y + 40 }
}

// The session's turns as bars: each as tall as it was long (a square root, so short turns
// still show), split into its kinds' hues; a turn picked lit, the rest faded.
export const chartSvg = (bars: readonly Bar[], c: Colors, w: number, pick: number | null): { source: string; height: number } => {
  const h = 110
  const [x0, x1, top, base] = [16, w - 16, 38, 84]
  const gap = 4
  const fit = Math.max(1, Math.floor((x1 - x0 + gap) / (6 + gap)))
  const shown = bars.slice(-fit)
  const bw = Math.min(28, (x1 - x0 - gap * (shown.length - 1)) / Math.max(1, shown.length))
  const max = Math.max(1, ...shown.map(b => b.ms))
  const drawn = shown.map((b, i) => {
    const x = x0 + i * (bw + gap)
    const bh = Math.max(4, Math.sqrt(b.ms / max) * (base - top))
    const mix = mixOf(b.calls, c)
    let y = base
    const parts =
      mix.length === 0
        ? `<rect x="${x}" y="${base - bh}" width="${bw}" height="${bh}" fill="${c.muted}" fill-opacity=".45"/>`
        : mix
            .map(k => {
              const kh = (k.count / b.calls.length) * bh
              y -= kh
              return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${kh.toFixed(1)}" fill="${k.color}"/>`
            })
            .join('')
    const dim = pick !== null && b.n !== pick ? ' opacity=".35"' : ''
    const pulse = b.isLive ? '<animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite"/>' : ''
    const clip = `<clipPath id="bar${i}"><rect x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(3, bw / 2)}"/></clipPath>`
    return `${clip}<g${dim}><g clip-path="url(#bar${i})">${parts}${pulse}</g></g>`
  })
  const first = shown[0]
  const last = shown.at(-1)
  const longest = Math.max(0, ...shown.map(b => b.ms))
  return {
    source: svg(
      w,
      h,
      c,
      cardRect(w, h) +
        text({ x: x0, y: 24, size: 9.5, weight: 650, caps: true, cls: 's' }, 'TIMELINE') +
        text({ x: x1, y: 24, size: 11, cls: 's', end: true }, esc(`longest ${lasted(longest)}`)) +
        drawn.join('') +
        `<line class="ln" x1="${x0}" y1="${base + 0.5}" x2="${x1}" y2="${base + 0.5}"/>` +
        (first ? text({ x: x0, y: base + 18, size: 10.5, cls: 's' }, `#${first.n}`) : '') +
        (last && last !== first ? text({ x: x1, y: base + 18, size: 10.5, cls: 's', end: true }, `#${last.n}`) : ''),
    ),
    height: h,
  }
}
