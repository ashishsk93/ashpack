import { escape, MONO, PAD } from './cards'
import type { Sequence, Shape, Step } from './mermaid'
import { DAY } from './mermaid-more'
import type { Palette } from './skins'

// What every chart draws with, on either surface: the skin's hues, short numbers, text
// widths in cells, wrapped words, small text, and a drawing fitted into a card.

// ── colours ──

// The skin's colours for series, slices and actors, its accent first, each once.
export const hues = (p: Palette): string[] => [...new Set([p.accent, p.blue, p.green, p.yellow, p.purple, p.cyan, p.pink, p.red])]

// Actors start one along, so the first is not the accent the header already wears.
export const actorHues = (p: Palette): string[] => [...hues(p).slice(1), ...hues(p).slice(0, 1)]

export const shapeColor = (p: Palette, shape: Shape): string =>
  shape === 'diamond' ? p.yellow : shape === 'hex' ? p.purple : shape === 'rect' ? p.blue : p.green

export const ganttColor = (p: Palette, tags: readonly string[], section: number): string =>
  tags.includes('crit') ? p.red : tags.includes('done') ? p.muted : tags.includes('active') ? p.accent : (hues(p).slice(1)[section % 7] ?? p.blue)

// `10-04`, or `2026-10-04` on a chart longer than about a year.
export const dayLabel = (day: number, withYear = false): string => new Date(day * DAY).toISOString().slice(withYear ? 0 : 5, 10)

// 1234 -> "1234", 12345 -> "12.3k", 2500000 -> "2.5M", 0.125 -> "0.13"
export const shortNumber = (v: number): string => {
  const abs = Math.abs(v)
  const trim = (x: number, unit: string) => `${Number(x.toFixed(1))}${unit}`
  if (abs >= 1e9) return trim(v / 1e9, 'B')
  if (abs >= 1e6) return trim(v / 1e6, 'M')
  if (abs >= 1e4) return trim(v / 1e3, 'k')
  return String(Number(v.toFixed(2)))
}

// ── text width, in cells ──

// CJK, Hangul, fullwidth forms and emoji take two cells; combining marks, joiners and
// variation selectors none.
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]|\p{Emoji_Presentation}/u
const ZERO = /\p{M}|\p{Emoji_Modifier}|[\u200b-\u200f\u2060\ufe00-\ufe0f]/u
const ASCII = /^[\x20-\x7e]*$/

// How many cells `t` takes in a terminal (and in monospace on the card): a glyph a ZWJ
// joins on shares its neighbour's.
export const cells = (t: string): number => {
  if (ASCII.test(t)) return t.length
  let n = 0
  let isJoined = false
  for (const ch of t) {
    n += isJoined || ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1
    isJoined = ch === '\u200d'
  }
  return n
}

// The widest of some lines, in cells.
export const widest = (lines: readonly string[]): number => lines.reduce((a, l) => Math.max(a, cells(l)), 0)

// `t` in at most `n` cells, marked `…` where it lost text; never half a glyph.
export const clip = (t: string, n: number): string => {
  if (cells(t) <= n) return t
  if (n <= 0) return ''
  let out = ''
  let w = 0
  for (const ch of t) {
    const cw = cells(ch)
    if (w + cw > n - 1) break
    out += ch
    w += cw
  }
  return `${out}…`
}

// A word wider than `max` cells in pieces that fit: a long name, or a run of CJK text.
const pieces = (word: string, max: number): string[] => {
  if (cells(word) <= max) return [word]
  const out: string[] = []
  let cur = ''
  let w = 0
  for (const ch of word) {
    const cw = cells(ch)
    if (w + cw > max && cur) {
      out.push(cur)
      cur = ''
      w = 0
    }
    cur += ch
    w += cw
  }
  return [...out, cur]
}

// Words to lines of at most `max` cells; past `lines` lines, the last ends in `…`.
export const wrapWords = (t: string, max: number, lines = Infinity): string[] => {
  const all = t
    .split(' ')
    .flatMap(word => pieces(word, max))
    .reduce<string[]>((acc, word) => {
      const last = acc.at(-1)
      return last !== undefined && cells(`${last} ${word}`) <= max ? [...acc.slice(0, -1), `${last} ${word}`] : [...acc, word]
    }, [])
  return all.length <= lines ? all : [...all.slice(0, lines - 1), clip(`${all[lines - 1] ?? ''}…`, max).replace(/\s+…$/, '…')]
}

// ── the card ──

export const small = (x: number, y: number, t: string, color: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="11" style="fill:${color}" xml:space="preserve"${extra}>${escape(t)}</text>`

export const SMALL_CHAR = 11 * 0.6

// A short id from text, so two charts on one page never share a mask's id.
export const idOf = (t: string): string => `m${Math.abs([...t].reduce((h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) | 0, 7)).toString(36)}`

// Below this a drawing is too small to read: the fence stays code.
export const MIN_SCALE = 0.35

// How far a drawing `w` wide shrinks to fit a card `width` wide.
export const scaleFor = (w: number, width: number): number => Math.min(1, (width - PAD * 2) / w)

// A drawing `w` × `h` fitted into the card's body: scaled down to the width, centred. Null
// when that would shrink it past reading.
export const fitted = (inner: string, w: number, h: number, width: number) => {
  const scale = scaleFor(w, width)
  if (scale < MIN_SCALE) return null
  const x = (width - w * scale) / 2
  return { body: `<g transform="translate(${x.toFixed(1)} 8) scale(${scale.toFixed(3)})">${inner}</g>`, height: h * scale + 16, scale }
}

// A sequence's steps, each message numbered in front when it says `autonumber`.
export const numberedSteps = (s: Sequence): Step[] => {
  const auto = s.autonumber
  if (!auto) return s.steps
  const order = s.steps.filter(st => st.kind === 'msg')
  return s.steps.map(st => (st.kind === 'msg' ? { ...st, text: `${auto.start + auto.step * order.indexOf(st)}. ${st.text}` } : st))
}
