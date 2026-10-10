import { parseInline } from './markdown'
import type { Palette } from './skins'

// Cards the desktop app draws as images: code, tables, diffs and shell output. Pure:
// the data each card shows, then its SVG. A card is an outline with no fill, so the page
// shows through, with faint tints on some rows. It is still: the desktop app re-mounts a
// message's first tree on every layout change, so an entry animation would replay.

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

// A ```diff fence as a diff: its hunks by their `@@` lines (lines before any, a hunk from 0
// on both sides: no line numbers), the file from its `+++`/`---` lines. Null when it changes nothing.
export const diffFence = (text: string): Diff | null => {
  // The file: the new side's name, or the old side's for a deleted one; several files say so.
  const names = [...text.matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)].map(m => m[1]?.trim() ?? '')
  const old = /^--- (?:a\/)?(.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const path = names.length > 1 ? `${names.length} files` : names[0] && names[0] !== '/dev/null' ? names[0] : old === '/dev/null' ? '' : old
  // A file's header (diff, index, ---, +++) runs until its first @@; a removed `-- x` line after one stays a line.
  const HEADER = /^(diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/
  const hunks: Hunk[] = []
  let inHeader = true
  for (const line of text.replace(/\n+$/, '').split('\n')) {
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (at) {
      hunks.push({ oldStart: Number(at[1]), newStart: Number(at[2]), lines: [] })
      inHeader = false
    } else if (line.startsWith('diff ')) inHeader = true
    else if (!(inHeader && HEADER.test(line))) {
      if (hunks.length === 0) hunks.push({ oldStart: 0, newStart: 0, lines: [] })
      // Tabs as four spaces: the card's text and the terminal both draw them as one otherwise.
      const kept = line.replace(/\t/g, '    ')
      hunks.at(-1)?.lines.push(/^[+\- ]/.test(kept) ? kept : ` ${kept}`)
    }
  }
  const all = hunks.flatMap(h => h.lines)
  const added = all.filter(l => l.startsWith('+')).length
  const removed = all.filter(l => l.startsWith('-')).length
  return added + removed > 0 ? { path, hunks, added, removed, isNew: false } : null
}

// The code after the change: the diff's kept and added lines, their marks off.
export const newSide = (d: Diff): string =>
  d.hunks.flatMap(h => h.lines.filter(l => !l.startsWith('-')).map(l => l.slice(1))).join('\n')

// A shell call's result. A failed call's output is the text the model read: an `Exit code N`
// line, then what the command printed.
export const shellOf = (output: unknown, command: string, isErrored: boolean): Shell | null => {
  if (typeof output === 'string') return isErrored ? { command, stdout: '', stderr: output.replace(/^Exit code -?\d+[^\n]*\n?/, ''), status: 'failed' } : null
  const o = record(output)
  if (typeof o.stdout !== 'string' || typeof o.stderr !== 'string') return null
  const status = o.interrupted === true ? 'interrupted' : typeof o.timedOutAfterMs === 'number' ? 'timed out' : isErrored ? 'failed' : 'ok'
  return { command, stdout: o.stdout, stderr: o.stderr, status }
}

// What a card cannot draw and the desktop refuses in an alt: OSC strings (titles, links) to
// their BEL or ST, CSI (colours, cursor moves), other escapes (`ESC ( B`), then any other control.
const CONTROL = /\u001b\][^\u0007\u001b\u009c\n]*(?:\u0007|\u001b\\|\u009c)?|\u001b\[[0-?]*[ -/]*[@-~]|\u001b[ -/]*[0-~]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffe\uffff]/g
export const clean = (t: string): string => t.replace(CONTROL, '')

export type Line = { text: string; isErr: boolean } | { fold: number }

// A stream as a terminal leaves it: each line what its last `\r` wrote (progress output),
// the blank lines at its end dropped.
const streamLines = (text: string, isErr: boolean) => {
  const lines = clean(text)
    .split('\n')
    .map(l => l.split('\r').filter(s => s !== '').at(-1) ?? '')
  const last = lines.map(l => l.trim() !== '').lastIndexOf(true)
  return lines.slice(0, last + 1).map(line => ({ text: line, isErr }))
}

// Output lines, stderr after stdout; a long run folded to its head and tail.
export const outputLines = (s: Shell, head = 8, tail = 8): Line[] => {
  const kept = [...streamLines(s.stdout, false), ...streamLines(s.stderr, true)]
  return kept.length <= head + tail + 1 ? kept : [...kept.slice(0, head), { fold: kept.length - head - tail }, ...kept.slice(-tail)]
}

// All the output as the card reads it, nothing folded: what its Copy takes.
export const shellText = (s: Shell): string =>
  [s.stdout, s.stderr]
    .map(t => streamLines(t, false).map(l => l.text).join('\n'))
    .filter(t => t.trim() !== '')
    .join('\n')

// A markdown table's cells as plain text: marks off, a link as its text, `<br>` a space.
export const tableOf = (markdown: string): Table => {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/(?<!\\)\|$/, '')
      .split(/(?<!\\)\|/)
      .map(c =>
        parseInline(c.replace(/<br\s*\/?>/gi, ' '))
          .map(s => s.text)
          .join('')
          .replace(/\\\|/g, '|')
          .trim(),
      )
  const [head = '', , ...rest] = markdown.split('\n').filter(l => l.trim() !== '')
  const header = cells(head)
  return { header, rows: rest.map(cells).map(r => Array.from({ length: header.length }, (_, i) => r[i] ?? '')) }
}

// Each column's width in characters: its longest cell, all scaled down together to fit
// `room` with `gap` between them, and at least 3.
export const columnWidths = (t: Table, room: number, gap: number): number[] => {
  const natural = t.header.map((h, c) => Math.max([...h].length, ...t.rows.map(r => [...(r[c] ?? '')].length)))
  const scale = Math.min(1, (room - gap * (natural.length - 1)) / Math.max(1, natural.reduce((a, b) => a + b, 0)))
  return natural.map(w => Math.max(3, w * scale))
}

// ── a little syntax colouring for code cards ──

export type Token = { text: string; role: 'plain' | 'comment' | 'string' | 'number' | 'keyword' }

const KEYWORDS = new Set(
  'const let var function return if else for while do switch case break continue import from export default class new async await yield def fn pub use mod impl struct enum type interface extends implements in of try catch finally throw raise with as and or not is None True False true false null undefined nil self this'.split(
    ' ',
  ),
)
const HASH_COMMENTS = new Set(['py', 'python', 'sh', 'bash', 'zsh', 'fish', 'shell', 'console', 'rb', 'ruby', 'yaml', 'yml', 'toml', 'r', 'pl', 'perl', 'dockerfile', 'makefile', 'make', 'nix', 'ini', 'conf', 'powershell', 'ps1', 'pwsh'])
const DASH_COMMENTS = new Set(['sql', 'psql', 'plsql', 'pgsql', 'plpgsql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'tsql', 'mssql', 'lua', 'hs', 'haskell', 'elm', 'ada'])

export const tokens = (line: string, lang: string): Token[] => {
  const comment = HASH_COMMENTS.has(lang) ? '#.*$' : DASH_COMMENTS.has(lang) ? '--.*$' : lang === 'mermaid' ? '%%.*$' : '\\/\\/.*$|\\/\\*.*?\\*\\/'
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

// A token's colour in the skin, on the cards and the terminal alike.
export const roleColor = (p: Palette, role: Token['role']): string =>
  ({ plain: p.text, comment: p.muted, string: p.green, number: p.yellow, keyword: p.purple })[role]

// ── the SVG ──

export const MONO = `ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace`
const SIZE = 12.5
export const CHAR = SIZE * 0.6
const LINE = 20
const HEAD = 38
export const PAD = 16

// Text for SVG: controls out, markup characters escaped.
export const escape = (t: string): string => clean(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Cut to `width` px of monospace, marked where it lost text.
export const fit = (t: string, width: number): string => {
  const max = Math.max(1, Math.floor(width / CHAR))
  return [...t].length <= max ? t : `${[...t].slice(0, max - 1).join('')}…`
}

// The room a card takes, from the cells the surface reports, in a range it reads well at.
export const cardWidth = (columns: number | undefined): number => Math.round(Math.min(1100, Math.max(480, (columns ?? 100) * 6.4)))

// A run of text, in the font the card sets once on its root.
export const text = (x: number, y: number, t: string, color: string, extra = '') =>
  `<text x="${x}" y="${y}" style="fill:${color}" xml:space="preserve"${extra}>${escape(t)}</text>`

export type Card = { source: string; width: number; height: number; alt: string }

// A small rounded badge at the header's right edge: its text over a faint tint of its colour.
const badge = (right: number, label: string, color: string) => {
  const w = label.length * CHAR + 16
  return (
    `<rect x="${right - w}" y="${HEAD / 2 - 10}" width="${w}" height="20" rx="10" fill="${color}" fill-opacity=".14"/>` +
    text(right - w / 2, HEAD / 2 + 4, label, color, ' text-anchor="middle"')
  )
}

// The card: a header (a title, a badge), a hairline, then its body, `bodyHeight` tall,
// drawn from y = 0 under the header. No entry animation: the desktop app keeps a
// message's first tree and re-mounts it on every layout change.
export const panel = (p: Palette, width: number, title: string, mark: [string, string] | null, body: string, bodyHeight: number, alt: string): Card => {
  const height = HEAD + bodyHeight
  const markW = mark ? mark[0].length * CHAR + 32 : 0
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${MONO}" font-size="${SIZE}">` +
    text(PAD, HEAD / 2 + 4, fit(title, width - PAD * 2 - markW), p.muted) +
    (mark ? badge(width - PAD, mark[0], mark[1]) : '') +
    `<line x1="0" y1="${HEAD - 0.5}" x2="${width}" y2="${HEAD - 0.5}" stroke="${p.muted}" stroke-opacity=".3"/>` +
    `<g transform="translate(0 ${HEAD})">${body}</g>` +
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="10" fill="none" stroke="${p.muted}" stroke-opacity=".45"/>` +
    `</svg>`
  return { source, width, height, alt: clean(alt).replace(/\r/g, '') } // a CRLF file's lines too
}

// A card of text rows, LINE apart.
const frame = (p: Palette, width: number, title: string, mark: [string, string] | null, rows: string[], alt: string): Card =>
  panel(p, width, title, mark, `<g transform="translate(0 ${-HEAD})">${rows.join('')}</g>`, 8 + Math.max(1, rows.length) * LINE + 10, alt)

const top = (i: number) => HEAD + 8 + i * LINE
const baseline = (i: number) => top(i) + 14
const band = (i: number, width: number, color: string, opacity: number) =>
  `<rect x="1" y="${top(i)}" width="${width - 2}" height="${LINE}" fill="${color}" fill-opacity="${opacity}"/>`
const lineNo = (i: number, no: number, digits: number, p: Palette) => text(PAD, baseline(i), String(no).padStart(digits), p.muted, ' fill-opacity=".7"')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// The rows a code or table card draws before it folds the rest (its Copy keeps them): with
// the fold's row, as tall as the app draws an image (4096 px).
const MAX_ROWS = 200

// One text per line, a span per coloured token; plain tokens take the line's colour.
export const codeSvg = (lang: string, code: string, p: Palette, width: number): Card => {
  const lines = code.replace(/\t/g, '    ').split('\n')
  const shown = lines.slice(0, MAX_ROWS)
  const digits = String(shown.length).length
  const gutter = digits * CHAR + 14
  const span = (t: Token) =>
    t.role === 'plain' ? escape(t.text) : `<tspan style="fill:${roleColor(p, t.role)}${t.role === 'comment' ? ';font-style:italic' : ''}">${escape(t.text)}</tspan>`
  const rows = shown.map(
    (l, i) =>
      lineNo(i, i + 1, digits, p) +
      `<text x="${PAD + gutter}" y="${baseline(i)}" style="fill:${p.text}" xml:space="preserve">${tokens(fit(l, width - PAD * 2 - gutter), lang).map(span).join('')}</text>`,
  )
  const fold = lines.length > shown.length ? [`⋯ ${plural(lines.length - shown.length, 'more line')}`] : []
  const folded = [...rows, ...fold.map(f => text(PAD, baseline(rows.length), f, p.muted))]
  return frame(p, width, lang || 'code', [plural(lines.length, 'line'), p.muted], folded, [...shown, ...fold].join('\n'))
}

export const tableSvg = (t: Table, p: Palette, width: number): Card => {
  const gap = 18
  const shown = t.rows.slice(0, MAX_ROWS - 1) // the header takes a row
  const widths = columnWidths({ header: t.header, rows: shown }, (width - PAD * 2) / CHAR, gap / CHAR).map(w => w * CHAR)
  const xs = widths.map((_, c) => PAD + widths.slice(0, c).reduce((a, b) => a + b + gap, 0))
  const cells = (r: string[], i: number, color: string, extra = '') =>
    r.map((cell, c) => text(xs[c] ?? PAD, baseline(i), fit(cell, widths[c] ?? 0), color, extra)).join('')
  const fold = t.rows.length > shown.length ? [`⋯ ${plural(t.rows.length - shown.length, 'more row')}`] : []
  const rows = [
    cells(t.header, 0, p.accent, ' font-weight="600"'),
    ...shown.map((r, i) => (i % 2 === 0 ? band(i + 1, width, p.text, 0.05) : '') + cells(r, i + 1, p.text)),
    ...fold.map(f => text(PAD, baseline(shown.length + 1), f, p.muted)),
  ]
  const alt = [...[t.header, ...shown].map(r => r.join(' | ')), ...fold].join('\n')
  return frame(p, width, 'table', [plural(t.rows.length, 'row'), p.muted], rows, alt)
}

export const diffSvg = (d: Diff, shownPath: string, p: Palette, width: number, max = 60): Card => {
  // Each line with the number it has in the new file (or the old, for a removed line); none
  // in a hunk from 0 on both sides, which had no `@@` to count from.
  const numbered = d.hunks.flatMap((h, hi) => {
    const hasNumbers = h.oldStart > 0 || h.newStart > 0
    let oldNo = h.oldStart
    let newNo = h.newStart
    const lines = h.lines.map(l => {
      const no = l.startsWith('-') ? oldNo++ : newNo++
      if (l.startsWith(' ')) oldNo++
      return { no: hasNumbers ? no : 0, l }
    })
    return hi > 0 ? [{ no: 0, l: '⋯' }, ...lines] : lines
  })
  const shown = numbered.length > max ? [...numbered.slice(0, max), { no: 0, l: `⋯ ${numbered.length - max} more lines` }] : numbered
  const highest = Math.max(0, ...shown.map(s => s.no))
  const digits = String(highest).length
  const gutter = highest > 0 ? digits * CHAR + 14 : 0
  const rows = shown.map(({ no, l }, i) => {
    const isAdd = l.startsWith('+')
    const isDel = l.startsWith('-')
    const color = isAdd ? p.green : isDel ? p.red : l.startsWith('⋯') ? p.muted : p.text
    const tint = isAdd || isDel ? band(i, width, color, 0.1) : ''
    const num = no > 0 ? lineNo(i, no, digits, p) : ''
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
      : text(PAD, baseline(i), fit(l.text.replace(/\t/g, '  '), width - PAD * 2), lines.length === 0 ? p.muted : l.isErr ? p.red : p.text),
  )
  const alt = [`$ ${s.command}`, ...lines.map(l => ('fold' in l ? `… ${l.fold} more lines` : l.text))].join('\n')
  return frame(p, width, s.command ? `$ ${s.command}` : 'shell', [s.status, STATUS(p, s.status)], rows, alt)
}
