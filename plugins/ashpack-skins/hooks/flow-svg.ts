import type { Card } from './cards'
import { CHAR, panel, text } from './cards'
import { clip, fitted, idOf, scaleFor, shapeColor, small, SMALL_CHAR, widest, wrapWords } from './chart-kit'
import type { Dir, Layout, Point, Size } from './flow-layout'
import { layoutFlow } from './flow-layout'
import type { Flow, FlowEdge, FlowName, FlowNode } from './mermaid'
import type { Palette } from './skins'

// A flowchart card, and the state, class, ER and mind-map cards that share its shape: the
// nodes laid out in ranks, curved edges between them, each label on its line where it is
// clear of the rest. Pure: flow in, SVG out.

const NODE_CHARS = 22
const NODE_LINES = 6 // a longer label ends in `…`
const NODE_LINE = 16
const BODY_CHARS = 34
const LABEL_CHARS = 32
const LABEL_LINES = 2
const LABEL_LINE = 13
const LABEL_PAD = 6 // the room kept free beside a placed label
export const ARROW = 7

const ORIGIN: Point = { x: 0, y: 0 }

// ── nodes ──

const nodeLines = (n: FlowNode) => wrapWords(n.label, NODE_CHARS, NODE_LINES)

// A node with a body (a class, an entity): its name over a hairline, then a line per member.
const bodyLines = (n: FlowNode): string[] => (n.body ?? []).map(l => clip(l, BODY_CHARS))

const nodeSize = (n: FlowNode): Size => {
  if (n.body) return { w: widest([clip(n.label, BODY_CHARS), ...bodyLines(n)]) * CHAR + 24, h: 26 + Math.max(1, n.body.length) * NODE_LINE + 8 }
  const lines = nodeLines(n)
  const tw = widest(lines) * CHAR
  const th = lines.length * NODE_LINE
  if (n.shape === 'diamond') return { w: tw * 1.4 + 28, h: th * 1.8 + 14 }
  if (n.shape === 'circle') return { w: Math.max(tw, th) + 28, h: Math.max(tw, th) + 28 }
  return { w: tw + (n.shape === 'hex' ? 44 : 28), h: th + 18 }
}

const nodeSvg = (p: Palette, n: FlowNode, c: Point, s: Size) => {
  const color = shapeColor(p, n.shape)
  const paint = `fill="${color}" fill-opacity=".1" stroke="${color}" stroke-width="1.5"`
  const [l, t, r, b] = [c.x - s.w / 2, c.y - s.h / 2, c.x + s.w / 2, c.y + s.h / 2]
  if (n.body) {
    return (
      `<rect x="${l}" y="${t}" width="${s.w}" height="${s.h}" rx="4" ${paint}/>` +
      text(c.x, t + 17, clip(n.label, BODY_CHARS), p.text, ' text-anchor="middle" font-weight="600"') +
      `<line x1="${l}" y1="${t + 26}" x2="${r}" y2="${t + 26}" stroke="${color}" stroke-opacity=".6"/>` +
      bodyLines(n).map((line, i) => small(l + 10, t + 26 + 15 + i * NODE_LINE, line, p.text)).join('')
    )
  }
  const outline =
    n.shape === 'diamond'
      ? `<polygon points="${c.x},${t} ${r},${c.y} ${c.x},${b} ${l},${c.y}" ${paint}/>`
      : n.shape === 'hex'
        ? `<polygon points="${l + 14},${t} ${r - 14},${t} ${r},${c.y} ${r - 14},${b} ${l + 14},${b} ${l},${c.y}" ${paint}/>`
        : n.shape === 'circle'
          ? `<circle cx="${c.x}" cy="${c.y}" r="${s.w / 2}" ${paint}/>`
          : `<rect x="${l}" y="${t}" width="${s.w}" height="${s.h}" rx="${n.shape === 'pill' ? s.h / 2 : n.shape === 'round' ? 10 : 4}" ${paint}/>`
  const lines = nodeLines(n)
  const top = c.y - (lines.length * NODE_LINE) / 2 + 12
  return outline + lines.map((line, i) => text(c.x, top + i * NODE_LINE, line, p.text, ' text-anchor="middle"')).join('')
}

// ── lines ──

// A smooth path through the route, leaving and arriving along the rank axis.
const curve = (pts: readonly Point[], isLR: boolean): string =>
  pts.reduce((d, b, i) => {
    const a = pts[i - 1]
    if (!a) return `M${b.x.toFixed(1)},${b.y.toFixed(1)}`
    const m = isLR ? (a.x + b.x) / 2 : (a.y + b.y) / 2
    const [c1, c2] = isLR ? [`${m},${a.y}`, `${m},${b.y}`] : [`${a.x},${m}`, `${b.x},${m}`]
    return `${d} C${c1} ${c2} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
  }, '')

// An arrowhead with its tip at `tip`, pointing along (dx, dy).
export const head = (tip: Point, dx: number, dy: number, color: string) => {
  const [bx, by] = [tip.x - dx * ARROW, tip.y - dy * ARROW]
  const [px, py] = [-dy * 4.5, dx * 4.5]
  return `<polygon points="${tip.x},${tip.y} ${bx + px},${by + py} ${bx - px},${by - py}" fill="${color}"/>`
}

// The route pulled back from each end that carries a head, so the line stops at its base.
const trimmed = (pts: readonly Point[], isLR: boolean, atStart: boolean, atEnd: boolean): Point[] => {
  const pull = (a: Point, toward: Point): Point => {
    const s = Math.sign(isLR ? toward.x - a.x : toward.y - a.y)
    return isLR ? { x: a.x + s * ARROW, y: a.y } : { x: a.x, y: a.y + s * ARROW }
  }
  const first = pts[0]
  const last = pts.at(-1)
  if (!first || !last || pts.length < 2) return [...pts]
  return [atStart ? pull(first, pts[1] ?? last) : first, ...pts.slice(1, -1), atEnd ? pull(last, pts.at(-2) ?? first) : last]
}

// The point `u` of the way along a route as `curve` draws it: each segment a cubic
// leaving and arriving along the rank axis.
const pointOn = (pts: readonly Point[], isLR: boolean, u: number): Point => {
  const segs = Math.max(1, pts.length - 1)
  const k = Math.min(segs - 1, Math.floor(u * segs))
  const t = u * segs - k
  const [a, b] = [pts[k] ?? ORIGIN, pts[k + 1] ?? pts[k] ?? ORIGIN]
  const m = isLR ? (a.x + b.x) / 2 : (a.y + b.y) / 2
  const [c1, c2] = isLR ? [{ x: m, y: a.y }, { x: m, y: b.y }] : [{ x: a.x, y: m }, { x: b.x, y: m }]
  const mt = 1 - t
  const at = (p0: number, p1: number, p2: number, p3: number) => mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3
  return { x: at(a.x, c1.x, c2.x, b.x), y: at(a.y, c1.y, c2.y, b.y) }
}

// ── labels ──

type Box = { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// An edge's label: two lines of 32 at most, the second ending in `…` if it runs on.
const labelLines = (e: { label: string }): string[] => wrapWords(e.label, LABEL_CHARS, LABEL_LINES)
const labelSize = (lines: readonly string[]): Size => ({ w: widest(lines) * SMALL_CHAR + 8, h: 16 + (lines.length - 1) * LABEL_LINE })

// Fractions along a route a label tries, in turn: labels fanning out of one node stagger
// along their lines rather than sit on one another.
const LABEL_SPOTS = [0.5, 0.2, 0.8, 0.1, 0.9, 0.35, 0.65]

// What is drawn so far: the boxes labels must keep clear of (nodes, placed labels), the labels,
// the holes masked out of the lines behind them, and how far the drawing reaches.
type Ink = { taken: Box[]; labels: string[]; holes: string[]; ext: { x0: number; y0: number; x1: number; y1: number } }

const reach = (ink: Ink, b: Box): void => {
  ink.ext = { x0: Math.min(ink.ext.x0, b.x - 4), y0: Math.min(ink.ext.y0, b.y - 4), x1: Math.max(ink.ext.x1, b.x + b.w + 4), y1: Math.max(ink.ext.y1, b.y + b.h + 4) }
}

// A label in the first spot clear of nodes and other labels (or the first spot); on a line,
// the line is masked out behind it.
const placeLabel = (ink: Ink, lines: readonly string[], spots: readonly Box[], color: string, isOnLine: boolean): void => {
  const box = spots.find(b => !ink.taken.some(t => overlaps(t, b))) ?? spots[0]
  if (!box) return
  ink.taken.push({ ...box, x: box.x - LABEL_PAD, w: box.w + LABEL_PAD * 2 })
  reach(ink, box)
  if (isOnLine) ink.holes.push(`<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h}" fill="black"/>`)
  ink.labels.push(lines.map((l, j) => small(Number((box.x + box.w / 2).toFixed(1)), Number((box.y + 12.5 + j * LABEL_LINE).toFixed(1)), l, color, ' text-anchor="middle"')).join(''))
}

// ── the drawing ──

type Drawing = { f: Flow; p: Palette; isLR: boolean; sizes: Size[]; lay: Layout; froms: number[]; ink: Ink }

const strokeOf = (e: FlowEdge, color: string) =>
  `stroke="${color}" stroke-width="${e.line === 'thick' ? 2.6 : 1.4}" fill="none"${e.line === 'dotted' ? ' stroke-dasharray="4 4"' : ''}`

// A node's edge to itself: a loop off its right side, the `k`th one wider; its label beside it.
const loopSvg = (d: Drawing, e: FlowEdge, i: number, k: number): string => {
  const c = d.lay.centers[d.froms[i] ?? 0] ?? ORIGIN
  const s = d.sizes[d.froms[i] ?? 0] ?? { w: 0, h: 0 }
  const [x, bulge] = [c.x + s.w / 2, 30 + k * 16]
  reach(d.ink, { x, y: c.y - 24 - k * 4, w: bulge, h: 48 + k * 8 })
  if (e.label) {
    const lines = labelLines(e)
    const { w, h } = labelSize(lines)
    placeLabel(d.ink, lines, [0, 16, -16, 32, -32].map(dy => ({ x: x + bulge + 2, y: c.y - 1 - h / 2 + dy, w, h })), d.p.text, false)
  }
  const path = `<path d="M${x},${c.y - 8} C${x + bulge},${c.y - 24 - k * 4} ${x + bulge},${c.y + 24 + k * 4} ${x + ARROW},${c.y + 8}" ${strokeOf(e, d.p.muted)}/>`
  return path + head({ x, y: c.y + 6 }, -1, -0.3, d.p.muted)
}

// An edge along its route, its heads, and its label on it.
const lineSvg = (d: Drawing, e: FlowEdge, pts: readonly Point[]): string => {
  pts.forEach(q => reach(d.ink, { x: q.x, y: q.y, w: 0, h: 0 }))
  const [first, second, before, last] = [pts[0], pts[1], pts.at(-2), pts.at(-1)]
  if (!first || !second || !before || !last) return ''
  const along = (a: Point, b: Point) => (d.isLR ? [Math.sign(b.x - a.x), 0] : [0, Math.sign(b.y - a.y)]) as [number, number]
  const [atStart, atEnd] = [e.head === 'both' || e.head === 'start', e.head === 'both' || e.head === 'arrow']
  const heads = (atEnd ? head(last, ...along(before, last), d.p.muted) : '') + (atStart ? head(first, ...along(second, first), d.p.muted) : '')
  if (e.label) {
    const lines = labelLines(e)
    const { w, h } = labelSize(lines)
    placeLabel(d.ink, lines, LABEL_SPOTS.map(u => pointOn(pts, d.isLR, u)).map(q => ({ x: q.x - w / 2, y: q.y - 1 - h / 2, w, h })), d.p.text, true)
  }
  return `<path d="${curve(trimmed(pts, d.isLR, atStart, atEnd), d.isLR)}" ${strokeOf(e, d.p.muted)}/>` + heads
}

// Edges between the same two nodes (either way) bow apart, so neither line nor label overlaps:
// each edge's offset across the rank axis.
const spreadOf = (f: Flow, isLR: boolean): number[] => {
  const keys = f.edges.map(e => [e.from, e.to].sort().join('\u0000'))
  const groups = new Map<string, number[]>()
  keys.forEach((k, j) => groups.set(k, [...(groups.get(k) ?? []), j]))
  const steps = new Map([...groups].map(([k, group]) => [k, Math.max(28, ...group.map(j => (isLR ? 18 : labelSize(labelLines(f.edges[j] ?? { label: '' })).w + 4)))]))
  return keys.map((k, i) => {
    const group = groups.get(k) ?? [i]
    return (group.indexOf(i) - (group.length - 1) / 2) * (steps.get(k) ?? 28)
  })
}

const bowed = (pts: readonly Point[], by: number, isLR: boolean): Point[] => {
  if (by === 0 || pts.length < 2) return [...pts]
  const shift = (q: Point): Point => (isLR ? { x: q.x, y: q.y + by } : { x: q.x + by, y: q.y })
  const [a, b] = [pts[0], pts.at(-1)]
  const inner = pts.length > 2 ? pts.slice(1, -1).map(shift) : a && b ? [shift({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })] : []
  return [...pts.slice(0, 1), ...inner, ...pts.slice(-1)]
}

const counts = (ids: readonly string[]): number[] => [...ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>()).values()]

// The room between ranks. Labelled edges get longer lines, so their labels fit between: down
// the page, a level for each label a node fans out to (up to four), so they stagger along
// their lines; across it, as wide as the widest label.
const rankGap = (f: Flow, isLR: boolean): number => {
  const labelled = f.edges.filter(e => e.label !== '' && e.from !== e.to)
  const sizes = labelled.map(e => labelSize(labelLines(e)))
  if (isLR) return Math.max(64, ...sizes.map(s => s.w + 24))
  if (labelled.length === 0) return 46
  const fan = Math.min(4, Math.max(...counts(labelled.map(e => e.from)), ...counts(labelled.map(e => e.to))))
  return Math.max(62, fan * (Math.max(...sizes.map(s => s.h)) + 6) + 20)
}

const flowDrawing = (f: Flow, p: Palette, dir: Dir, id: string) => {
  const sizes = f.nodes.map(nodeSize)
  const index = new Map(f.nodes.map((n, i) => [n.id, i]))
  const links = f.edges.map(e => [index.get(e.from) ?? 0, index.get(e.to) ?? 0] as const)
  const isLR = dir === 'LR' || dir === 'RL'
  const lay = layoutFlow(sizes, links, dir, { rank: rankGap(f, isLR), cross: 28, margin: 6 })
  const taken = f.nodes.map((_, i) => {
    const [c, s] = [lay.centers[i] ?? ORIGIN, sizes[i] ?? { w: 0, h: 0 }]
    return { x: c.x - s.w / 2, y: c.y - s.h / 2, w: s.w, h: s.h }
  })
  const d: Drawing = { f, p, isLR, sizes, lay, froms: links.map(l => l[0]), ink: { taken, labels: [], holes: [], ext: { x0: 0, y0: 0, x1: lay.width, y1: lay.height } } }
  const spread = spreadOf(f, isLR)
  const loops = new Map<string, number>()
  const lines = f.edges.map((e, i) => {
    if (e.from !== e.to) return lineSvg(d, e, bowed(lay.routes[i] ?? [], spread[i] ?? 0, isLR))
    const k = loops.get(e.from) ?? 0
    loops.set(e.from, k + 1)
    return loopSvg(d, e, i, k)
  })
  const { x0, y0, x1, y1 } = d.ink.ext
  const [w, h] = [x1 - x0, y1 - y0]
  const mask = `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${w}" height="${h}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="white"/>${d.ink.holes.join('')}</mask>`
  const nodes = f.nodes.map((n, i) => nodeSvg(p, n, lay.centers[i] ?? ORIGIN, sizes[i] ?? { w: 0, h: 0 })).join('')
  const drawing = `${mask}<g mask="url(#${id})">${lines.join('')}</g>${d.ink.labels.join('')}${nodes}`
  return { inner: `<g transform="translate(${-x0} ${-y0})">${drawing}</g>`, w, h }
}

const UNITS: Record<FlowName | 'flowchart', string> = { flowchart: 'steps', 'state diagram': 'states', 'mind map': 'topics', 'class diagram': 'classes', 'ER diagram': 'entities' }

// Past these a chart is turned the other way, if that draws it larger: across the page too
// wide to read goes down it, down the page too wide goes across.
const TURN_BELOW: Readonly<Record<'across' | 'down', number>> = { across: 0.75, down: 0.6 }

// The card; null when even the better way round would draw too small to read.
export const flowCard = (f: Flow, p: Palette, width: number, alt: string): Card | null => {
  const isLR = f.dir === 'LR' || f.dir === 'RL'
  const first = flowDrawing(f, p, f.dir, idOf(alt + f.dir))
  const turn: Dir = isLR ? 'TD' : 'LR'
  const other = scaleFor(first.w, width) < TURN_BELOW[isLR ? 'across' : 'down'] ? flowDrawing(f, p, turn, idOf(alt + turn)) : null
  const d = other && scaleFor(other.w, width) > scaleFor(first.w, width) ? other : first
  const fit = fitted(d.inner, d.w, d.h, width)
  if (!fit) return null
  const mark: [string, string] = [`${f.nodes.length} ${UNITS[f.name ?? 'flowchart']}`, p.muted]
  return panel(p, width, f.title || f.name || 'flowchart', mark, fit.body, fit.height, alt)
}
