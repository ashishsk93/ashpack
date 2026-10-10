import type { Card } from './cards'
import { CHAR, PAD, panel, text } from './cards'
import { actorHues, cells, clip, fitted, hues, numberedSteps, shortNumber, small, SMALL_CHAR, widest, wrapWords } from './chart-kit'
import { ganttSvg, quadrantSvg, timelineSvg } from './charts-more'
import { ARROW, flowCard, head } from './flow-svg'
import type { Chart, Pie, Sequence, Step, XY } from './mermaid'
import type { Palette } from './skins'

// Chart cards the desktop app draws as images: a flowchart (flow-svg.ts), a sequence diagram,
// a pie and an xy chart (bars and lines), in the skin's colours. Each is a card like the code
// and table cards: an outline, a header, the drawing under it. Pure: chart in, SVG out.

// ── sequence diagram ──

const ACTOR_H = 30
const TEXT_CHARS = 32 // a message's or note's line; an actor's name at most
const TEXT_LINE = 13
const NOTE_LINES = 3

type Msg = Extract<Step, { kind: 'msg' }>
type Note = Extract<Step, { kind: 'note' }>

const textLines = (t: string, lines: number): string[] => wrapWords(t, TEXT_CHARS, lines)
const textWidth = (lines: readonly string[]): number => widest(lines) * SMALL_CHAR

// A note's box: over its actor (or between two), or beside the lifeline on the side it names.
const noteBox = (st: Note, xs: readonly number[], lines: readonly string[]): { x: number; w: number } => {
  const [a, b] = [xs[st.from] ?? 0, xs[st.to] ?? 0].sort((m, n) => m - n) as [number, number]
  const tw = textWidth(lines) + 20
  if (st.place === 'left') return { x: (xs[st.from] ?? 0) - 8 - tw, w: tw }
  if (st.place === 'right') return { x: (xs[st.from] ?? 0) + 8, w: tw }
  const w = Math.max(b - a + 60, tw)
  return { x: (a + b) / 2 - w / 2, w }
}

// How far right of its lifeline a message to itself reaches: its loop, or its text.
const selfReach = (st: Msg): number => Math.max(28, 10 + textWidth(textLines(st.text, 2)))

// Each actor's centre, far enough apart for the names and the messages between them, then
// shifted right so every note and self-message lands inside the card; and the card's width.
const columns = (s: Sequence, steps: readonly Step[]) => {
  const names = s.actors.map(a => clip(a.name, TEXT_CHARS))
  const aw = names.map(nm => Math.max(64, cells(nm) * CHAR + 24))
  const spans = steps.flatMap(st => (st.kind === 'msg' && st.from !== st.to ? [(textWidth(textLines(st.text, 2)) + 28) / Math.abs(st.to - st.from)] : []))
  const gap = Math.max(120, ...aw.slice(1).map((w, i) => ((aw[i] ?? 0) + w) / 2 + 24), ...spans)
  const rel = s.actors.map((_, i) => i * gap)
  const reaches = [
    ...rel.flatMap((x, i) => [x - (aw[i] ?? 0) / 2, x + (aw[i] ?? 0) / 2]),
    ...steps.flatMap(st => {
      if (st.kind === 'note') {
        const box = noteBox(st, rel, textLines(st.text, NOTE_LINES))
        return [box.x, box.x + box.w]
      }
      return st.kind === 'msg' && st.from === st.to ? [(rel[st.from] ?? 0) + selfReach(st)] : []
    }),
  ]
  const shift = PAD - Math.min(...reaches)
  return { names, aw, xs: rel.map(x => x + shift), w: Math.max(...reaches) + shift + PAD }
}

type Seq = { p: Palette; xs: readonly number[]; w: number; groups: { y: number; depth: number }[] }

// A message: its text over its arrow (a loop, to itself); and the room it takes.
const msgSvg = (c: Seq, st: Msg, y: number): [string, number] => {
  const [a, b] = [c.xs[st.from] ?? 0, c.xs[st.to] ?? 0]
  const lines = textLines(st.text, 2)
  const extra = (lines.length - 1) * TEXT_LINE
  const stroke = `stroke="${c.p.muted}" stroke-width="1.4"${st.isDashed ? ' stroke-dasharray="5 4"' : ''}`
  if (a === b) {
    const label = lines.map((l, j) => small(a + 10, y + 10 + j * TEXT_LINE, l, c.p.text)).join('')
    const at = y + extra
    return [label + `<path d="M${a},${at + 16} h28 v14 h-${28 - ARROW}" fill="none" ${stroke}/>` + head({ x: a, y: at + 30 }, -1, 0, c.p.muted), 42 + extra]
  }
  const dir = Math.sign(b - a)
  const label = lines.map((l, j) => small((a + b) / 2, y + 10 + j * TEXT_LINE, l, c.p.text, ' text-anchor="middle"')).join('')
  const at = y + 18 + extra
  const tip = st.isCross ? `<path d="M${b - 5},${at - 5} l10,10 M${b + 5},${at - 5} l-10,10" stroke="${c.p.red}" stroke-width="1.6"/>` : head({ x: b, y: at }, dir, 0, c.p.text)
  return [label + `<line x1="${a}" y1="${at}" x2="${b - dir * ARROW}" y2="${at}" ${stroke}/>` + tip, 32 + extra]
}

const noteSvg = (c: Seq, st: Note, y: number): [string, number] => {
  const lines = textLines(st.text, NOTE_LINES)
  const box = noteBox(st, c.xs, lines)
  const h = 24 + (lines.length - 1) * TEXT_LINE
  const rect = `<rect x="${box.x}" y="${y}" width="${box.w}" height="${h}" rx="4" fill="${c.p.yellow}" fill-opacity=".1" stroke="${c.p.yellow}" stroke-opacity=".7"/>`
  return [rect + lines.map((l, j) => small(box.x + box.w / 2, y + 16 + j * TEXT_LINE, l, c.p.text, ' text-anchor="middle"')).join(''), h + 10]
}

// A group's keyword and label (`alt ok`), cut to the card.
const groupHead = (c: Seq, x: number, y: number, keyword: string, label: string, isOpen: boolean): string => {
  const kw = isOpen ? text(x, y, keyword, c.p.accent, ' font-weight="600"') : small(x, y, keyword, c.p.muted)
  const lx = x + cells(keyword) * (isOpen ? CHAR : SMALL_CHAR) + 8
  return kw + (label ? small(lx, y, clip(label, Math.floor((c.w - PAD / 2 - lx) / SMALL_CHAR)), c.p.muted) : '')
}

const stepSvg = (c: Seq, st: Step, y: number): [string, number] => {
  const depth = c.groups.length
  if (st.kind === 'msg') return msgSvg(c, st, y)
  if (st.kind === 'note') return noteSvg(c, st, y)
  if (st.kind === 'open') {
    c.groups.push({ y, depth })
    return [groupHead(c, PAD / 2 + depth * 6 + 8, y + 15, st.keyword, st.label, true), 26]
  }
  if (st.kind === 'else') {
    const l = PAD / 2 + (depth - 1) * 6
    const line = `<line x1="${l}" y1="${y + 4}" x2="${c.w - l}" y2="${y + 4}" stroke="${c.p.muted}" stroke-opacity=".6" stroke-dasharray="4 4"/>`
    return [line + groupHead(c, l + 8, y + 18, st.keyword, st.label, false), 26]
  }
  const g = c.groups.pop()
  const l = PAD / 2 + (g?.depth ?? 0) * 6
  return [g ? `<rect x="${l}" y="${g.y}" width="${c.w - l * 2}" height="${y - g.y + 4}" rx="5" fill="none" stroke="${c.p.muted}" stroke-opacity=".6"/>` : '', 12]
}

const actorsSvg = (p: Palette, names: readonly string[], aw: readonly number[], xs: readonly number[], h: number): string => {
  const colors = actorHues(p)
  return names
    .map((name, i) => {
      const [x, c, bw] = [xs[i] ?? 0, colors[i % colors.length] ?? p.blue, aw[i] ?? 64]
      return (
        `<line x1="${x}" y1="${10 + ACTOR_H}" x2="${x}" y2="${h - 6}" stroke="${p.muted}" stroke-opacity=".5" stroke-dasharray="3 4"/>` +
        `<rect x="${x - bw / 2}" y="10" width="${bw}" height="${ACTOR_H}" rx="6" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width="1.5"/>` +
        text(x, 10 + ACTOR_H / 2 + 4, name, p.text, ' text-anchor="middle" font-weight="600"')
      )
    })
    .join('')
}

const sequenceSvg = (s: Sequence, p: Palette, width: number, alt: string): Card | null => {
  const steps = numberedSteps(s)
  const { names, aw, xs, w } = columns(s, steps)
  const c: Seq = { p, xs, w, groups: [] }
  const out: string[] = []
  let y = 10 + ACTOR_H + 18
  for (const st of steps) {
    const [svg, dy] = stepSvg(c, st, y)
    out.push(svg)
    y += dy
  }
  const h = y + 8
  const fit = fitted(actorsSvg(p, names, aw, xs, h) + out.join(''), w, h, width)
  return fit && panel(p, width, s.title || 'sequence', [`${s.actors.length} actors`, p.muted], fit.body, fit.height, alt)
}

// ── pie ──

const pieSvg = (pie: Pie, p: Palette, width: number, alt: string): Card => {
  const colors = hues(p)
  const total = pie.slices.reduce((a, s) => a + s.value, 0)
  const R = 64
  const r = R * 0.58
  const [cx, cy] = [PAD + R + 8, R + 16]
  const gap = pie.slices.length > 1 ? 0.02 : 0
  const pt = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
  let start = -Math.PI / 2
  const slices = pie.slices.map((s, i) => {
    const color = colors[i % colors.length] ?? p.accent
    const sweep = (s.value / total) * Math.PI * 2
    const [a0, a1] = [start + gap / 2, start + sweep - gap / 2]
    start += sweep
    if (pie.slices.length === 1) return `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${color}" stroke-width="${R - r}"/>`
    const large = a1 - a0 > Math.PI ? 1 : 0
    return `<path d="M${pt(R, a0)} A${R},${R} 0 ${large} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z" fill="${color}"/>`
  })
  const lx = cx + R + 28
  const right = width - PAD
  const valueW = Math.max(...pie.slices.map(s => shortNumber(s.value).length)) * CHAR
  const legend = pie.slices.map((s, i) => {
    const y = 26 + i * 22
    const color = colors[i % colors.length] ?? p.accent
    const pct = `${Math.round((s.value / total) * 100)}%`
    return (
      `<rect x="${lx}" y="${y - 9}" width="10" height="10" rx="2" fill="${color}"/>` +
      text(lx + 18, y, clip(s.label, Math.floor((right - valueW - 70 - (lx + 18)) / CHAR)), p.text) +
      text(right - valueW - 14, y, pct, color, ' text-anchor="end" font-weight="600"') +
      text(right, y, shortNumber(s.value), p.muted, ' text-anchor="end"')
    )
  })
  const center = text(cx, cy + 2, shortNumber(total), p.text, ' text-anchor="middle" font-weight="600"') + small(cx, cy + 16, 'total', p.muted, ' text-anchor="middle"')
  const height = Math.max(2 * R + 32, pie.slices.length * 22 + 20)
  return panel(p, width, pie.title || 'pie', [`${pie.slices.length} parts`, p.muted], slices.join('') + center + legend.join(''), height, alt)
}

// ── xy chart: bars and lines ──

// A tick step of 1, 2 or 5 times a power of ten, about `span / 4`.
const MAX_TICKS = 12

export const niceStep = (span: number): number => {
  const raw = (span > 0 && Number.isFinite(span) ? span : 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 5, 10].find(m => m * pow >= raw) ?? 10) * pow
}

const xySvg = (c: XY, p: Palette, width: number, alt: string): Card => {
  const colors = hues(p)
  const values = c.series.flatMap(s => s.values)
  // The axis: the y-axis line's range when it is a real one, else the data's from 0; never empty.
  const hasRange = c.yMin !== undefined && c.yMax !== undefined && c.yMax > c.yMin
  const [dataLo, dataHi] = [Math.min(0, ...values), Math.max(...values)]
  const step = niceStep(hasRange ? (c.yMax ?? 1) - (c.yMin ?? 0) : dataHi - dataLo)
  const lo = hasRange ? (c.yMin ?? 0) : Math.floor(dataLo / step) * step
  const hi = hasRange ? (c.yMax ?? 1) : Math.max(lo + step, Math.ceil(dataHi / step) * step)
  const span = hi - lo
  const ticks = Array.from({ length: Math.min(MAX_TICKS, Math.floor(span / step) + 1) }, (_, i) => lo + i * step).filter(t => t <= hi + 1e-9)
  const tickW = Math.max(...ticks.map(t => shortNumber(t).length)) * SMALL_CHAR
  const [left, right, top, bottom] = [PAD + tickW + 8, width - PAD, 26, 226]
  const y = (v: number) => bottom - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * (bottom - top)
  const n = c.xLabels.length
  const band = (right - left) / n
  const bars = c.series.filter(s => s.kind === 'bar')
  const inner = band * 0.72
  const bw = inner / Math.max(1, bars.length)
  const colorOf = (i: number) => colors[i % colors.length] ?? p.accent
  const grid = ticks
    .map(t => `<line x1="${left}" y1="${y(t)}" x2="${right}" y2="${y(t)}" stroke="${p.muted}" stroke-opacity="${t === 0 ? 0.6 : 0.2}"/>` + small(left - 6, y(t) + 4, shortNumber(t), p.muted, ' text-anchor="end"'))
    .join('')
  const showValues = n * bars.length <= 12
  const drawn = c.series.map((s, si) => {
    const color = colorOf(si)
    if (s.kind === 'line') {
      const pts = s.values.map((v, i) => `${(left + (i + 0.5) * band).toFixed(1)},${y(v).toFixed(1)}`)
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` + pts.map(pt => `<circle cx="${pt.split(',')[0]}" cy="${pt.split(',')[1]}" r="2.8" fill="${color}"/>`).join('')
    }
    const bi = bars.indexOf(s)
    return s.values
      .map((v, i) => {
        const x = left + i * band + (band - inner) / 2 + bi * bw
        const [y0, y1] = [y(Math.max(lo, Math.min(0, hi))), y(v)]
        const label = showValues ? small(x + bw / 2, Math.min(y0, y1) - 4, shortNumber(v), p.muted, ' text-anchor="middle"') : ''
        return `<rect x="${(x + 1).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" rx="2" fill="${color}" fill-opacity=".85"/>` + label
      })
      .join('')
  })
  // Category names under the bands; every k-th when they are too close to read.
  const every = Math.max(1, Math.ceil((4 * SMALL_CHAR) / band))
  const xLabels = c.xLabels.map((l, i) => (i % every === 0 ? small(left + (i + 0.5) * band, bottom + 16, clip(l, Math.max(1, Math.floor((band * every - 4) / SMALL_CHAR))), p.muted, ' text-anchor="middle"') : '')).join('')
  const hasLegend = c.series.length > 1
  const legend = hasLegend
    ? c.series
        .map((s, i) => {
          const x = left + i * 120
          return `<rect x="${x}" y="${bottom + 30}" width="10" height="10" rx="2" fill="${colorOf(i)}"/>` + small(x + 16, bottom + 39, clip(s.name || `${s.kind} ${i + 1}`, 15), p.text)
        })
        .join('')
    : ''
  const yTitle = c.yTitle ? small(left, 14, clip(c.yTitle, Math.floor((right - left) / SMALL_CHAR)), p.muted) : ''
  const kinds = [...new Set(c.series.map(s => s.kind))].join(' + ')
  const body = yTitle + grid + drawn.join('') + xLabels + legend
  return panel(p, width, c.title || 'chart', [kinds, p.muted], body, bottom + (hasLegend ? 50 : 28), alt)
}

// ── every chart ──

// What a chart says, as text: the image's alt, and what Copy takes.
export const alt = (c: Chart): string => {
  switch (c.kind) {
    case 'flow': {
      const name = new Map(c.nodes.map(n => [n.id, n.label]))
      const lines = c.edges.map(e => `${name.get(e.from) ?? e.from} -> ${name.get(e.to) ?? e.to}${e.label ? ` (${e.label})` : ''}`)
      return [c.title ?? '', ...(lines.length > 0 ? lines : c.nodes.map(n => n.label))].filter(Boolean).join('\n')
    }
    case 'sequence':
      return [c.title ?? '', ...numberedSteps(c).flatMap(st => (st.kind === 'msg' ? [`${c.actors[st.from]?.name} -> ${c.actors[st.to]?.name}: ${st.text}`] : []))].filter(Boolean).join('\n')
    case 'pie':
      return [c.title, ...c.slices.map(s => `${s.label}: ${s.value}`)].filter(Boolean).join('\n')
    case 'xy':
      return [c.title, ...c.series.map(s => `${s.kind}${s.name ? ` ${s.name}` : ''}: ${c.xLabels.map((l, i) => `${l} ${s.values[i] ?? ''}`).join(', ')}`)].filter(Boolean).join('\n')
    case 'timeline':
      return [c.title, ...c.periods.map(x => `${x.label}: ${x.events.join('; ')}`)].filter(Boolean).join('\n')
    case 'gantt':
      return [c.title, ...c.tasks.map(t => `${t.name}: ${t.end - t.start} days`)].filter(Boolean).join('\n')
    case 'quadrant':
      return [c.title, ...c.points.map(x => `${x.label}: ${x.x}, ${x.y}`)].filter(Boolean).join('\n')
  }
}

// The card, or null when it would draw too small to read at this width.
export const chartCard = (c: Chart, p: Palette, width: number): Card | null => {
  switch (c.kind) {
    case 'flow':
      return flowCard(c, p, width, alt(c))
    case 'sequence':
      return sequenceSvg(c, p, width, alt(c))
    case 'pie':
      return pieSvg(c, p, width, alt(c))
    case 'xy':
      return xySvg(c, p, width, alt(c))
    case 'timeline':
      return timelineSvg(c, p, width, alt(c))
    case 'gantt':
      return ganttSvg(c, p, width, alt(c))
    case 'quadrant':
      return quadrantSvg(c, p, width, alt(c))
  }
}

// The same for a caller sure of a card (the tests): too small to read throws.
export const chartSvg = (c: Chart, p: Palette, width: number): Card => {
  const card = chartCard(c, p, width)
  if (!card) throw new RangeError('chart too small to read at this width')
  return card
}
