import { escape, MONO, PAD } from './cards'
import type { Palette } from './skins'

// What every chart card draws with: the skin's hues, short numbers, wrapped words, small
// text, and a drawing fitted into a card.

// The skin's colours for series, slices and actors, its accent first, each once.
export const hues = (p: Palette): string[] => [...new Set([p.accent, p.blue, p.green, p.yellow, p.purple, p.cyan, p.pink, p.red])]

// 1234 -> "1234", 12345 -> "12.3k", 2500000 -> "2.5M", 0.125 -> "0.13"
export const shortNumber = (v: number): string => {
  const abs = Math.abs(v)
  const trim = (x: number, unit: string) => `${Number(x.toFixed(1))}${unit}`
  if (abs >= 1e9) return trim(v / 1e9, 'B')
  if (abs >= 1e6) return trim(v / 1e6, 'M')
  if (abs >= 1e4) return trim(v / 1e3, 'k')
  return String(Number(v.toFixed(2)))
}

// Words to lines of at most `max` characters; a longer word is cut.
export const wrapWords = (t: string, max: number): string[] =>
  t.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1)
    const cut = [...word].length > max ? `${[...word].slice(0, max - 1).join('')}…` : word
    return last !== undefined && [...`${last} ${cut}`].length <= max ? [...lines.slice(0, -1), `${last} ${cut}`] : [...lines, cut]
  }, [])

export const small = (x: number, y: number, t: string, color: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="11" style="fill:${color}" xml:space="preserve"${extra}>${escape(t)}</text>`

export const SMALL_CHAR = 11 * 0.6

// A short id from text, so two charts on one page never share a mask's id.
export const idOf = (t: string): string => `m${Math.abs([...t].reduce((h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) | 0, 7)).toString(36)}`

// A drawing `w` × `h` fitted into the card's body: scaled down to the width, centred.
export const fitted = (inner: string, w: number, h: number, width: number) => {
  const scale = Math.min(1, (width - PAD * 2) / w)
  const x = (width - w * scale) / 2
  return { body: `<g transform="translate(${x.toFixed(1)} 8) scale(${scale.toFixed(3)})">${inner}</g>`, height: h * scale + 16, scale }
}
