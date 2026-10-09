import type { Palette } from './skins'

// Cards the desktop app draws as images: code, tables, diffs and shell output. Pure:
// the data each card shows, then its SVG. A card is an outline with no fill, so the page
// shows through; its rows rise in only when it is new (`animate`), so a redraw of the
// same card (a resize, the side panel opening) does not play it again.

// ── what the cards show ──

export type Hunk = { oldStart: number; newStart: number; lines: string[] }
export type Diff = { path: string; hunks: Hunk[]; added: number; removed: number; isNew: boolean }
export type Shell = { command: string; stdout: string; stderr: string; status: 'ok' | 'failed' | 'interrupted' | 'timed out' }
export type Table = { header: string[]; rows: string[][] }

const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})

// An Edit's or Write's result as a diff; a new file is every line added.
export const diffOf = (output: unknown): Diff | null => {
  const o = record(output)
  if (typeof o.filePath !== 'string') return null
  const patch = Array.isArray(o.structuredPatch) ? o.structuredPatch.map(record) : []
  const hunks: Hunk[] =
    o.type === 'create' && typeof o.content === 'string'
      ? [{ oldStart: 0, newStart: 1, lines: o.content.replace(/\n$/, '').split('\n').map(l => `+${l}`) }]
      : patch.map(h => ({
          oldStart: Number(h.oldStart) || 0,
          newStart: Number(h.newStart) || 0,
          lines: Array.isArray(h.lines) ? h.lines.filter((l): l is string => typeof l === 'string') : [],
        }))
  if (hunks.length === 0) return null
  const all = hunks.flatMap(h => h.lines)
  return {
    path: o.filePath,
    hunks,
    added: all.filter(l => l.startsWith('+')).length,
    removed: all.filter(l => l.startsWith('-')).length,
    isNew: o.type === 'create',
  }
}

export const shellOf = (output: unknown, command: string, isErrored: boolean): Shell | null => {
  const o = record(output)
  if (typeof o.stdout !== 'string' || typeof o.stderr !== 'string') return null
  const status = o.interrupted === true ? 'interrupted' : typeof o.timedOutAfterMs === 'number' ? 'timed out' : isErrored ? 'failed' : 'ok'
  return { command, stdout: o.stdout, stderr: o.stderr, status }
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
export type Line = { text: string; isErr: boolean } | { fold: number }

const streamLines = (text: string, isErr: boolean) => {
  const lines = text.replace(ANSI, '').replace(/\r/g, '').replace(/\t/g, '  ').split('\n')
  const last = lines.map(l => l.trim() !== '').lastIndexOf(true)
  return lines.slice(0, last + 1).map(line => ({ text: line, isErr }))
}

// Output lines, stderr after stdout; a long run folded to its head and tail.
export const outputLines = (s: Shell, head = 8, tail = 8): Line[] => {
  const kept = [...streamLines(s.stdout, false), ...streamLines(s.stderr, true)]
  return kept.length <= head + tail + 1 ? kept : [...kept.slice(0, head), { fold: kept.length - head - tail }, ...kept.slice(-tail)]
}

// A markdown table's cells; null when the lines are not one.
export const tableOf = (markdown: string): Table | null => {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/(?<!\\)\|$/, '')
      .split(/(?<!\\)\|/)
      .map(c => c.replace(/\*\*|__|`/g, '').replace(/\\\|/g, '|').trim())
  const [head, , ...rest] = markdown.split('\n').filter(l => l.trim() !== '')
  if (!head) return null
  const header = cells(head)
  return { header, rows: rest.map(r => Array.from({ length: header.length }, (_, i) => cells(r)[i] ?? '')) }
}

// ── a little syntax colouring for code cards ──

export type Token = { text: string; role: 'plain' | 'comment' | 'string' | 'number' | 'keyword' }

const KEYWORDS = new Set(
  'const let var function return if else for while do switch case break continue import from export default class new async await yield def fn pub use mod impl struct enum type interface extends implements in of try catch finally throw raise with as and or not is None True False true false null undefined nil self this'.split(
    ' ',
  ),
)
const HASH_COMMENTS = new Set(['py', 'python', 'sh', 'bash', 'zsh', 'shell', 'rb', 'ruby', 'yaml', 'yml', 'toml', 'r', 'pl', 'perl'])

export const tokens = (line: string, lang: string): Token[] => {
  const comment = HASH_COMMENTS.has(lang) ? '#.*$' : '\\/\\/.*$|--\\s.*$'
  const re = new RegExp(`(${comment})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d[\\d_.]*\\b)|([A-Za-z_$][\\w$]*)`, 'g')
  const out: Token[] = []
  let at = 0
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0
    if (i > at) out.push({ text: line.slice(at, i), role: 'plain' })
    const role = m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'number' : KEYWORDS.has(m[4] ?? '') ? 'keyword' : 'plain'
    out.push({ text: m[0], role })
    at = i + m[0].length
  }
  if (at < line.length) out.push({ text: line.slice(at), role: 'plain' })
  return out
}

// ── the SVG ──

const MONO = `ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace`
const SIZE = 12.5
const CHAR = SIZE * 0.6
const LINE = 20
const HEAD = 38
const PAD = 16

export const escape = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Cut to `width` px of monospace, marked where it lost text.
const fit = (t: string, width: number): string => {
  const max = Math.max(1, Math.floor(width / CHAR))
  return [...t].length <= max ? t : `${[...t].slice(0, max - 1).join('')}…`
}

// The room a card takes, from the cells the surface reports, in a range it reads well at.
export const cardWidth = (columns: number | undefined): number => Math.round(Math.min(1100, Math.max(480, (columns ?? 100) * 6.4)))

const text = (x: number, y: number, t: string, color: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${SIZE}" style="fill:${color}" xml:space="preserve"${extra}>${escape(t)}</text>`

export type Card = { source: string; width: number; height: number; alt: string }

// A small rounded badge at the header's right edge: its text over a faint tint of its colour.
const badge = (right: number, label: string, color: string) => {
  const w = label.length * CHAR + 16
  return (
    `<rect x="${right - w}" y="${HEAD / 2 - 10}" width="${w}" height="20" rx="10" fill="${color}" fill-opacity=".14"/>` +
    text(right - w / 2, HEAD / 2 + 4, label, color, ' text-anchor="middle"')
  )
}

// The card: a header (a title, a badge), a hairline, then its rows. No entry animation:
// the desktop app keeps a message's first tree and re-mounts it on every layout change.
const frame = (p: Palette, width: number, title: string, mark: [string, string] | null, rows: string[], alt: string): Card => {
  const height = HEAD + 8 + Math.max(1, rows.length) * LINE + 10
  const wrap = (row: string, i: number) =>
    `<g>${row}</g>`
  const markW = mark ? mark[0].length * CHAR + 32 : 0
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    text(PAD, HEAD / 2 + 4, fit(title, width - PAD * 2 - markW), p.muted) +
    (mark ? badge(width - PAD, mark[0], mark[1]) : '') +
    `<line x1="0" y1="${HEAD - 0.5}" x2="${width}" y2="${HEAD - 0.5}" stroke="${p.muted}" stroke-opacity=".3"/>` +
    rows.map(wrap).join('') +
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="10" fill="none" stroke="${p.muted}" stroke-opacity=".45"/>` +
    `</svg>`
  return { source, width, height, alt }
}

const top = (i: number) => HEAD + 8 + i * LINE
const baseline = (i: number) => top(i) + 14
const band = (i: number, width: number, color: string, opacity: number) =>
  `<rect x="1" y="${top(i)}" width="${width - 2}" height="${LINE}" fill="${color}" fill-opacity="${opacity}"/>`

export const codeSvg = (lang: string, code: string, p: Palette, width: number): Card => {
  const lines = code.split('\n')
  const gutter = String(lines.length).length * CHAR + 14
  const roles: Record<Token['role'], string> = { plain: p.text, comment: p.muted, string: p.green, number: p.yellow, keyword: p.purple }
  const rows = lines.map((l, i) => {
    let x = PAD + gutter
    const room = width - PAD - x
    const spans = tokens(fit(l, room), lang).map(t => {
      const span = text(x, baseline(i), t.text, roles[t.role], t.role === 'comment' ? ' font-style="italic"' : '')
      x += [...t.text].length * CHAR
      return span
    })
    return text(PAD, baseline(i), String(i + 1).padStart(String(lines.length).length), p.muted, ' fill-opacity=".7"') + spans.join('')
  })
  return frame(p, width, lang || 'code', [`${lines.length} line${lines.length === 1 ? '' : 's'}`, p.muted], rows, code)
}

export const tableSvg = (t: Table, p: Palette, width: number): Card => {
  const gap = 18
  const natural = t.header.map((h, c) => Math.max([...h].length, ...t.rows.map(r => [...(r[c] ?? '')].length)) * CHAR)
  const room = width - PAD * 2 - gap * (t.header.length - 1)
  const scale = Math.min(1, room / Math.max(1, natural.reduce((a, b) => a + b, 0)))
  const widths = natural.map(w => Math.max(3 * CHAR, w * scale))
  const xs = widths.map((_, c) => PAD + widths.slice(0, c).reduce((a, b) => a + b + gap, 0))
  const cells = (r: string[], i: number, color: string, extra = '') =>
    r.map((cell, c) => text(xs[c] ?? PAD, baseline(i), fit(cell, widths[c] ?? 0), color, extra)).join('')
  const rows = [
    cells(t.header, 0, p.accent, ' font-weight="600"'),
    ...t.rows.map((r, i) => (i % 2 === 0 ? band(i + 1, width, p.text, 0.05) : '') + cells(r, i + 1, p.text)),
  ]
  const alt = [t.header, ...t.rows].map(r => r.join(' | ')).join('\n')
  return frame(p, width, 'table', [`${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`, p.muted], rows, alt)
}

export const diffSvg = (d: Diff, shownPath: string, p: Palette, width: number, max = 60): Card => {
  // Each line with the number it has in the new file (or the old, for a removed line).
  const numbered = d.hunks.flatMap((h, hi) => {
    let oldNo = h.oldStart
    let newNo = h.newStart
    const lines = h.lines.map(l => {
      const no = l.startsWith('-') ? oldNo++ : newNo++
      if (l.startsWith(' ')) oldNo++
      return { no, l }
    })
    return hi > 0 ? [{ no: 0, l: '⋯' }, ...lines] : lines
  })
  const shown = numbered.length > max ? [...numbered.slice(0, max), { no: 0, l: `⋯ ${numbered.length - max} more lines` }] : numbered
  const gutter = String(Math.max(...shown.map(s => s.no))).length * CHAR + 14
  const rows = shown.map(({ no, l }, i) => {
    const isAdd = l.startsWith('+')
    const isDel = l.startsWith('-')
    const color = isAdd ? p.green : isDel ? p.red : l.startsWith('⋯') ? p.muted : p.text
    const tint = isAdd || isDel ? band(i, width, color, 0.1) : ''
    const num = no > 0 ? text(PAD, baseline(i), String(no).padStart(String(Math.max(...shown.map(s => s.no))).length), p.muted, ' fill-opacity=".7"') : ''
    return tint + num + text(PAD + gutter, baseline(i), fit(l, width - PAD * 2 - gutter), color)
  })
  const mark: [string, string] = d.isNew ? [`new · ${d.added}`, p.green] : [`+${d.added} −${d.removed}`, d.removed > d.added ? p.red : p.green]
  return frame(p, width, shownPath, mark, rows, d.hunks.flatMap(h => h.lines).join('\n'))
}

const STATUS = (p: Palette, s: Shell['status']) => (s === 'ok' ? p.green : s === 'failed' ? p.red : p.yellow)

export const terminalSvg = (s: Shell, p: Palette, width: number): Card => {
  const lines = outputLines(s)
  const rows = (lines.length === 0 ? [{ text: 'no output', isErr: false }] : lines).map((l, i) =>
    'fold' in l
      ? text(PAD, baseline(i), `⋯ ${l.fold} more lines`, p.muted)
      : text(PAD, baseline(i), fit(l.text, width - PAD * 2), lines.length === 0 ? p.muted : l.isErr ? p.red : p.text),
  )
  const alt = [`$ ${s.command}`, ...lines.map(l => ('fold' in l ? `… ${l.fold} more lines` : l.text))].join('\n')
  return frame(p, width, s.command ? `$ ${s.command}` : 'shell', [s.status, STATUS(p, s.status)], rows, alt)
}
