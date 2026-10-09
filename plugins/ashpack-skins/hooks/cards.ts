import type { Palette } from './skins'

// Cards for code, tables, edits and shell output. Pure: the data each card shows, and
// the desktop's SVG of it. A card has an outline and no background, so the page shows
// through, and no icons: words say what it is. Modelled on hellosverre/claude-skins
// (MIT), whose desktop cards draw the same way.

// ── the data ──

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

// The diff as unified text, for the terminal's own diff drawing (`Code` with `format: 'diff'`).
export const unified = (d: Diff): string =>
  d.hunks
    .map(h => {
      const old = h.lines.filter(l => !l.startsWith('+')).length
      const now = h.lines.filter(l => !l.startsWith('-')).length
      return [`@@ -${h.oldStart},${old} +${h.newStart},${now} @@`, ...h.lines].join('\n')
    })
    .join('\n')

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

// ── the desktop's SVG cards ──

const MONO = `ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace`
const SIZE = 12.5
const CHAR = SIZE * 0.6
const LINE = 20
const HEADER = 36
const PAD = 16

export const escape = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Cut to `width` px of monospace, marked where it lost text.
const fit = (t: string, width: number): string => {
  const max = Math.max(1, Math.floor(width / CHAR))
  return [...t].length <= max ? t : `${[...t].slice(0, max - 1).join('')}…`
}

// The room a card takes, from the cells the surface reports, in a range it reads well at.
export const cardWidth = (columns: number | undefined): number => Math.round(Math.min(1100, Math.max(480, (columns ?? 100) * 6.4)))

// Rows rise in one after another; reduced motion shows them at once.
const MOTION =
  '.rise{opacity:0;animation:rise .4s cubic-bezier(.2,.8,.2,1) forwards}' +
  '@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
  '@media (prefers-reduced-motion:reduce){.rise{animation:none;opacity:1}}'
const delay = (i: number) => `style="animation-delay:${60 + Math.min(i, 30) * 22}ms"`

const text = (x: number, y: number, t: string, color: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${SIZE}" style="fill:${color}" xml:space="preserve"${extra}>${escape(t)}</text>`

export type SvgCard = { source: string; width: number; height: number; alt: string }

// The card: a header (a label at the left, a note at the right), a hairline under it, and rows.
const card = (p: Palette, width: number, label: string, note: [string, string] | null, rows: string[], alt: string): SvgCard => {
  const height = HEADER + 8 + Math.max(1, rows.length) * LINE + 10
  const right = note ? text(width - PAD, HEADER / 2 + 4, note[0], note[1], ' text-anchor="end"') : ''
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>${MOTION}</style>` +
    text(PAD, HEADER / 2 + 4, fit(label, width - PAD * 2 - (note ? note[0].length * CHAR + 24 : 0)), p.muted) +
    right +
    `<line x1="0" y1="${HEADER - 0.5}" x2="${width}" y2="${HEADER - 0.5}" stroke="${p.muted}" stroke-opacity=".3"/>` +
    rows.join('') +
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="10" fill="none" stroke="${p.muted}" stroke-opacity=".45"/>` +
    `</svg>`
  return { source, width, height, alt }
}

const rowY = (i: number) => HEADER + 8 + i * LINE

const plainRow = (i: number, t: string, color: string, width: number) =>
  `<g class="rise" ${delay(i)}>${text(PAD, rowY(i) + 14, fit(t, width - PAD * 2), color)}</g>`

export const codeSvg = (lang: string, code: string, p: Palette, width: number): SvgCard => {
  const lines = code.split('\n')
  return card(
    p,
    width,
    lang || 'code',
    [`${lines.length} line${lines.length === 1 ? '' : 's'}`, p.muted],
    lines.map((l, i) => plainRow(i, l, p.text, width)),
    code,
  )
}

export const tableSvg = (t: Table, p: Palette, width: number): SvgCard => {
  const cols = t.header.length
  const natural = t.header.map((h, c) => Math.max([...h].length, ...t.rows.map(r => [...(r[c] ?? '')].length)) * CHAR)
  const room = width - PAD * 2 - 16 * (cols - 1)
  const scale = Math.min(1, room / Math.max(1, natural.reduce((a, b) => a + b, 0)))
  const widths = natural.map(w => Math.max(3 * CHAR, w * scale))
  const xs = widths.map((_, c) => PAD + widths.slice(0, c).reduce((a, b) => a + b + 16, 0))
  const rowOf = (cells: string[], i: number, color: string, weight = '') =>
    `<g class="rise" ${delay(i)}>${cells.map((cell, c) => text(xs[c] ?? PAD, rowY(i) + 14, fit(cell, widths[c] ?? 0), color, weight)).join('')}</g>`
  const rows = t.rows.map((r, i) =>
    (i % 2 === 1 ? `<rect class="rise" ${delay(i)} x="1" y="${rowY(i)}" width="${width - 2}" height="${LINE}" fill="${p.muted}" fill-opacity=".08"/>` : '') +
    rowOf(r, i, p.text),
  )
  const head = card(p, width, '', [`${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`, p.muted], rows, [t.header, ...t.rows].map(r => r.join(' | ')).join('\n'))
  // The header row of a table is its column names, in the card's header band.
  const names = t.header.map((h, c) => text(xs[c] ?? PAD, HEADER / 2 + 4, fit(h, widths[c] ?? 0), p.accent, ' font-weight="600"')).join('')
  return { ...head, source: head.source.replace('</style>', `</style>${names}`) }
}

export const diffSvg = (d: Diff, shownPath: string, p: Palette, width: number, max = 60): SvgCard => {
  const lines = d.hunks.flatMap((h, i) => [...(i > 0 ? ['…'] : []), ...h.lines])
  const shown = lines.length > max ? [...lines.slice(0, max), `… ${lines.length - max} more lines`] : lines
  const rows = shown.map((l, i) => {
    const color = l.startsWith('+') ? p.green : l.startsWith('-') ? p.red : l.startsWith('…') ? p.muted : p.text
    const band = l.startsWith('+') || l.startsWith('-') ? `<rect class="rise" ${delay(i)} x="1" y="${rowY(i)}" width="${width - 2}" height="${LINE}" fill="${color}" fill-opacity=".1"/>` : ''
    return band + plainRow(i, l, color, width)
  })
  const stats = d.isNew ? `new file · ${d.added} lines` : `+${d.added} −${d.removed}`
  return card(p, width, shownPath, [stats, d.removed > d.added ? p.red : p.green], rows, unified(d))
}

const STATUS_COLOR = (p: Palette, s: Shell['status']) => (s === 'ok' ? p.green : s === 'failed' ? p.red : p.yellow)

export const terminalSvg = (s: Shell, p: Palette, width: number): SvgCard => {
  const lines = outputLines(s)
  const rows = (lines.length === 0 ? [{ text: 'no output', isErr: false }] : lines).map((l, i) =>
    'fold' in l ? plainRow(i, `… ${l.fold} more lines`, p.muted, width) : plainRow(i, l.text, lines.length === 0 ? p.muted : l.isErr ? p.red : p.text, width),
  )
  const alt = [`$ ${s.command}`, ...lines.map(l => ('fold' in l ? `… ${l.fold} more lines` : l.text))].join('\n')
  return card(p, width, `$ ${s.command}`, [s.status, STATUS_COLOR(p, s.status)], rows, alt)
}

export const statusColor = STATUS_COLOR
