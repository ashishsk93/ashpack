import type { Card } from './cards'
import { CHAR, fit, PAD, panel, text } from './cards'
import { fitted, hues, idOf, shortNumber, small, SMALL_CHAR, wrapWords } from './chart-kit'
import type { Point } from './flow-layout'
import { layoutFlow } from './flow-layout'
import type { Chart, Flow, FlowName, FlowNode, Pie, Sequence, Shape, XY } from './mermaid'
import { ganttSvg, quadrantSvg, timelineSvg } from './charts-more'
import type { Palette } from './skins'

// Chart cards the desktop app draws as images: a flowchart, a sequence diagram, a pie and
// an xy chart (bars and lines), in the skin's colours. Each is a card like the code and
// table cards: an outline, a header, the drawing under it. Pure: chart in, SVG out.

// ── flowchart ──

const NODE_CHARS = 22
const NODE_LINE = 16
const ARROW = 7

const shapeColor = (p: Palette, shape: Shape): string =>
  shape === 'diamond' ? p.yellow : shape === 'hex' ? p.purple : shape === 'rect' ? p.blue : p.green

const nodeLines = (n: FlowNode) => wrapWords(n.label, NODE_CHARS)

// A node with a body (a class, an entity): its name over a hairline, then a line per member.
const BODY_CHARS = 34
const bodyLines = (n: FlowNode): string[] => (n.body ?? []).map(l => ([...l].length > BODY_CHARS ? `${[...l].slice(0, BODY_CHARS - 1).join('')}…` : l))

const nodeSize = (n: FlowNode) => {
  if (n.body) {
    const all = [n.label, ...bodyLines(n)]
    return { w: Math.max(...all.map(l => [...l].length)) * CHAR + 24, h: 26 + Math.max(1, n.body.length) * NODE_LINE + 8 }
  }
  const lines = nodeLines(n)
  const tw = Math.max(...lines.map(l => [...l].length)) * CHAR
  const th = lines.length * NODE_LINE
  if (n.shape === 'diamond') return { w: tw * 1.4 + 28, h: th * 1.8 + 14 }
  if (n.shape === 'circle') return { w: Math.max(tw, th) + 28, h: Math.max(tw, th) + 28 }
  return { w: tw + (n.shape === 'hex' ? 44 : 28), h: th + 18 }
}

const nodeSvg = (p: Palette, n: FlowNode, c: Point, s: { w: number; h: number }) => {
  const color = shapeColor(p, n.shape)
  const paint = `fill="${color}" fill-opacity=".1" stroke="${color}" stroke-width="1.5"`
  const [l, t, r, b] = [c.x - s.w / 2, c.y - s.h / 2, c.x + s.w / 2, c.y + s.h / 2]
  if (n.body) {
    return (
      `<rect x="${l}" y="${t}" width="${s.w}" height="${s.h}" rx="4" ${paint}/>` +
      text(c.x, t + 17, n.label, p.text, ' text-anchor="middle" font-weight="600"') +
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
const head = (tip: Point, dx: number, dy: number, color: string) => {
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

type Box = { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// Fractions along a route a label tries, in turn.
const LABEL_SPOTS = [0.5, 0.2, 0.8, 0.1, 0.9, 0.35, 0.65]

// The point `u` of the way along a route as `curve` draws it: each segment a cubic
// leaving and arriving along the rank axis.
const pointOn = (pts: readonly Point[], isLR: boolean, u: number): Point => {
  const segs = Math.max(1, pts.length - 1)
  const k = Math.min(segs - 1, Math.floor(u * segs))
  const t = u * segs - k
  const [a, b] = [pts[k] ?? { x: 0, y: 0 }, pts[k + 1] ?? pts[k] ?? { x: 0, y: 0 }]
  const m = isLR ? (a.x + b.x) / 2 : (a.y + b.y) / 2
  const [c1, c2] = isLR ? [{ x: m, y: a.y }, { x: m, y: b.y }] : [{ x: a.x, y: m }, { x: b.x, y: m }]
  const mt = 1 - t
  const at = (p0: number, p1: number, p2: number, p3: number) => mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3
  return { x: at(a.x, c1.x, c2.x, b.x), y: at(a.y, c1.y, c2.y, b.y) }
}

const flowDrawing = (f: Flow, p: Palette, dir: Flow['dir']) => {
  const sizes = f.nodes.map(nodeSize)
  const index = new Map(f.nodes.map((n, i) => [n.id, i]))
  const links = f.edges.map(e => [index.get(e.from) ?? 0, index.get(e.to) ?? 0] as const)
  const isLR = dir === 'LR' || dir === 'RL'
  const labelW = (e: { label: string }) => [...e.label].length * SMALL_CHAR + 8
  // Labelled edges get longer lines, so their labels have room between the ranks: down the
  // page a little more, across it as wide as the widest label.
  const widest = Math.max(0, ...f.edges.filter(e => e.label !== '' && e.from !== e.to).map(labelW))
  const rank = isLR ? Math.max(64, widest + 24) : widest > 0 ? 62 : 46
  const lay = layoutFlow(sizes, links, dir, { rank, cross: 28, margin: 6 })
  const labels: string[] = []
  const holes: string[] = []
  // Where labels may not go: the nodes, then each label placed so far.
  const taken: Box[] = f.nodes.map((_, i) => {
    const [c, s] = [lay.centers[i] ?? { x: 0, y: 0 }, sizes[i] ?? { w: 0, h: 0 }]
    return { x: c.x - s.w / 2, y: c.y - s.h / 2, w: s.w, h: s.h }
  })
  // What the drawing reaches: the layout, then any bowed line or label past it.
  const ext = { x0: 0, y0: 0, x1: lay.width, y1: lay.height }
  const reach = (b: Box) => {
    ext.x0 = Math.min(ext.x0, b.x - 4)
    ext.y0 = Math.min(ext.y0, b.y - 4)
    ext.x1 = Math.max(ext.x1, b.x + b.w + 4)
    ext.y1 = Math.max(ext.y1, b.y + b.h + 4)
  }
  // Edges between the same two nodes (either way) bow apart, so neither line nor label overlaps.
  const pairOf = (e: { from: string; to: string }) => [e.from, e.to].sort().join('\u0000')
  const pairs = f.edges.map(pairOf)
  const spread = (i: number) => {
    const group = pairs.flatMap((k, j) => (k === pairs[i] ? [j] : []))
    const step = Math.max(28, ...group.map(j => (isLR ? 18 : labelW(f.edges[j] ?? { label: '' }) + 4)))
    return (group.indexOf(i) - (group.length - 1) / 2) * step
  }
  const bowed = (pts: readonly Point[], by: number): Point[] => {
    if (by === 0 || pts.length < 2) return [...pts]
    const shift = (q: Point): Point => (isLR ? { x: q.x, y: q.y + by } : { x: q.x + by, y: q.y })
    const [a, b] = [pts[0], pts.at(-1)]
    const inner = pts.length > 2 ? pts.slice(1, -1).map(shift) : a && b ? [shift({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })] : []
    return [...pts.slice(0, 1), ...inner, ...pts.slice(-1)]
  }
  const loopsSoFar = new Map<string, number>()
  const lines = f.edges.map((e, i) => {
    const color = p.muted
    const stroke = `stroke="${color}" stroke-width="${e.line === 'thick' ? 2.6 : 1.4}" fill="none"${e.line === 'dotted' ? ' stroke-dasharray="4 4"' : ''}`
    const c = lay.centers[links[i]?.[0] ?? 0] ?? { x: 0, y: 0 }
    const s = sizes[links[i]?.[0] ?? 0] ?? { w: 0, h: 0 }
    // A node's edge to itself: a loop off its right side, each further one wider; its label
    // beside it, clear of what is already placed, like any other.
    if (e.from === e.to) {
      const k = loopsSoFar.get(e.from) ?? 0
      loopsSoFar.set(e.from, k + 1)
      const [x, bulge] = [c.x + s.w / 2, 30 + k * 16]
      reach({ x, y: c.y - 24 - k * 4, w: bulge, h: 48 + k * 8 })
      if (e.label) {
        const w = labelW(e)
        const spots = [0, 16, -16, 32, -32].map(dy => ({ x: x + bulge + 2, y: c.y - 9 + dy, w, h: 16 }))
        const box = spots.find(b => !taken.some(t => overlaps(t, b))) ?? spots[0] ?? { x, y: c.y, w, h: 16 }
        taken.push(box)
        reach(box)
        labels.push(small(box.x + 4, box.y + 12.5, e.label, p.text))
      }
      return `<path d="M${x},${c.y - 8} C${x + bulge},${c.y - 24 - k * 4} ${x + bulge},${c.y + 24 + k * 4} ${x + ARROW},${c.y + 8}" ${stroke}/>` + head({ x, y: c.y + 6 }, -1, -0.3, color)
    }
    const pts = bowed(lay.routes[i] ?? [], spread(i))
    pts.forEach(q => reach({ x: q.x, y: q.y, w: 0, h: 0 }))
    const last = pts.at(-1)
    const before = pts.at(-2)
    const first = pts[0]
    const second = pts[1]
    if (!last || !before || !first || !second) return ''
    const along = (a: Point, b: Point) => (isLR ? [Math.sign(b.x - a.x), 0] : [0, Math.sign(b.y - a.y)]) as [number, number]
    const [atStart, atEnd] = [e.head === 'both' || e.head === 'start', e.head === 'both' || e.head === 'arrow']
    const heads = (atEnd ? head(last, ...along(before, last), color) : '') + (atStart ? head(first, ...along(second, first), color) : '')
    if (e.label) {
      // The label sits on its line, the line masked out behind it: halfway along, or the
      // first spot nearer either end that is clear of nodes and other labels.
      const w = labelW(e)
      const boxAt = (q: Point): Box => ({ x: q.x - w / 2, y: q.y - 9, w, h: 16 })
      const spots = LABEL_SPOTS.map(u => pointOn(pts, isLR, u))
      const at = spots.find(q => !taken.some(b => overlaps(b, boxAt(q)))) ?? spots[0] ?? first
      taken.push(boxAt(at))
      reach(boxAt(at))
      holes.push(`<rect x="${at.x - w / 2}" y="${at.y - 9}" width="${w}" height="16" fill="black"/>`)
      labels.push(small(at.x, at.y + 3.5, e.label, p.text, ' text-anchor="middle"'))
    }
    return `<path d="${curve(trimmed(pts, isLR, atStart, atEnd), isLR)}" ${stroke}/>` + heads
  })
  const [w, h] = [ext.x1 - ext.x0, ext.y1 - ext.y0]
  const id = idOf(alt(f) + dir)
  const mask = `<mask id="${id}" maskUnits="userSpaceOnUse" x="${ext.x0}" y="${ext.y0}" width="${w}" height="${h}"><rect x="${ext.x0}" y="${ext.y0}" width="${w}" height="${h}" fill="white"/>${holes.join('')}</mask>`
  const drawing =
    mask +
    `<g mask="url(#${id})">${lines.join('')}</g>` +
    labels.join('') +
    f.nodes.map((n, i) => nodeSvg(p, n, lay.centers[i] ?? { x: 0, y: 0 }, sizes[i] ?? { w: 0, h: 0 })).join('')
  return { inner: `<g transform="translate(${-ext.x0} ${-ext.y0})">${drawing}</g>`, w, h }
}

const UNITS: Record<FlowName | 'flowchart', string> = { flowchart: 'steps', 'state diagram': 'states', 'mind map': 'topics', 'class diagram': 'classes', 'ER diagram': 'entities' }

const flowSvg = (f: Flow, p: Palette, width: number): Card => {
  // A chart across the page too wide to read is turned down the page.
  const across = flowDrawing(f, p, f.dir)
  const isLR = f.dir === 'LR' || f.dir === 'RL'
  const d = isLR && (width - PAD * 2) / across.w < 0.75 ? flowDrawing(f, p, 'TD') : across
  const { body, height } = fitted(d.inner, d.w, d.h, width)
  const mark: [string, string] = [`${f.nodes.length} ${UNITS[f.name ?? 'flowchart']}`, p.muted]
  return panel(p, width, f.name ?? 'flowchart', mark, body, height, alt(f))
}

// ── sequence diagram ──

const ACTOR_H = 30

const sequenceSvg = (s: Sequence, p: Palette, width: number): Card => {
  const colors = hues(p).slice(1).concat(hues(p).slice(0, 1))
  const aw = s.actors.map(a => Math.max(64, [...a.name].length * CHAR + 24))
  const spans = s.steps.flatMap(st => (st.kind === 'msg' && st.from !== st.to ? [{ k: Math.abs(st.to - st.from), w: [...st.text].length * SMALL_CHAR + 28 }] : []))
  const gap = Math.max(120, ...aw.slice(1).map((w, i) => ((aw[i] ?? 0) + w) / 2 + 24), ...spans.map(x => x.w / x.k))
  const x0 = PAD + (aw[0] ?? 0) / 2
  const xs = s.actors.map((_, i) => x0 + i * gap)
  const hasSelf = s.steps.some(st => st.kind === 'msg' && st.from === st.to)
  const w = (xs.at(-1) ?? x0) + (aw.at(-1) ?? 0) / 2 + PAD + (hasSelf ? 60 : 0)
  const out: string[] = []
  const groups: { y: number; depth: number; keyword: string; label: string }[] = []
  let y = 10 + ACTOR_H + 18
  for (const st of s.steps) {
    const depth = groups.length
    const left = PAD / 2 + depth * 6
    const right = w - PAD / 2 - depth * 6
    if (st.kind === 'msg') {
      const [a, b] = [xs[st.from] ?? x0, xs[st.to] ?? x0]
      const dash = st.isDashed ? ' stroke-dasharray="5 4"' : ''
      if (a === b) {
        out.push(small(a + 10, y + 10, st.text, p.text))
        out.push(`<path d="M${a},${y + 16} h28 v14 h-${28 - ARROW}" fill="none" stroke="${p.muted}" stroke-width="1.4"${dash}/>` + head({ x: a, y: y + 30 }, -1, 0, p.muted))
        y += 42
        continue
      }
      const dir = Math.sign(b - a)
      out.push(small((a + b) / 2, y + 10, st.text, p.text, ' text-anchor="middle"'))
      out.push(`<line x1="${a}" y1="${y + 18}" x2="${b - dir * ARROW}" y2="${y + 18}" stroke="${p.muted}" stroke-width="1.4"${dash}/>`)
      out.push(
        st.isCross
          ? `<path d="M${b - 5},${y + 13} l10,10 M${b + 5},${y + 13} l-10,10" stroke="${p.red}" stroke-width="1.6"/>`
          : head({ x: b, y: y + 18 }, dir, 0, p.text),
      )
      y += 32
    } else if (st.kind === 'note') {
      const [a, b] = [Math.min(xs[st.from] ?? x0, xs[st.to] ?? x0), Math.max(xs[st.from] ?? x0, xs[st.to] ?? x0)]
      const nw = Math.max(b - a + 60, [...st.text].length * SMALL_CHAR + 20)
      const nx = (a + b) / 2 - nw / 2
      out.push(`<rect x="${nx}" y="${y}" width="${nw}" height="24" rx="4" fill="${p.yellow}" fill-opacity=".1" stroke="${p.yellow}" stroke-opacity=".7"/>`)
      out.push(small((a + b) / 2, y + 16, st.text, p.text, ' text-anchor="middle"'))
      y += 34
    } else if (st.kind === 'open') {
      groups.push({ y, depth, keyword: st.keyword, label: st.label })
      out.push(text(left + 8, y + 15, st.keyword, p.accent, ' font-weight="600"') + small(left + 16 + [...st.keyword].length * CHAR, y + 15, st.label, p.muted))
      y += 26
    } else if (st.kind === 'else') {
      const l = PAD / 2 + (depth - 1) * 6
      out.push(`<line x1="${l}" y1="${y + 4}" x2="${w - l}" y2="${y + 4}" stroke="${p.muted}" stroke-opacity=".6" stroke-dasharray="4 4"/>`)
      out.push(small(l + 8, y + 18, `${st.keyword}${st.label ? ` ${st.label}` : ''}`, p.muted))
      y += 26
    } else {
      const g = groups.pop()
      if (g) {
        const l = PAD / 2 + g.depth * 6
        out.push(`<rect x="${l}" y="${g.y}" width="${w - l * 2}" height="${y - g.y + 4}" rx="5" fill="none" stroke="${p.muted}" stroke-opacity=".6"/>`)
      }
      y += 12
    }
  }
  const h = y + 8
  const actors = s.actors
    .map((a, i) => {
      const x = xs[i] ?? x0
      const c = colors[i % colors.length] ?? p.blue
      const bw = aw[i] ?? 64
      return (
        `<line x1="${x}" y1="${10 + ACTOR_H}" x2="${x}" y2="${h - 6}" stroke="${p.muted}" stroke-opacity=".5" stroke-dasharray="3 4"/>` +
        `<rect x="${x - bw / 2}" y="10" width="${bw}" height="${ACTOR_H}" rx="6" fill="${c}" fill-opacity=".1" stroke="${c}" stroke-width="1.5"/>` +
        text(x, 10 + ACTOR_H / 2 + 4, a.name, p.text, ' text-anchor="middle" font-weight="600"')
      )
    })
    .join('')
  const { body, height } = fitted(actors + out.join(''), w, h, width)
  return panel(p, width, 'sequence', [`${s.actors.length} actors`, p.muted], body, height, alt(s))
}

// ── pie ──

const pieSvg = (pie: Pie, p: Palette, width: number): Card => {
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
      text(lx + 18, y, fit(s.label, right - valueW - 70 - (lx + 18)), p.text) +
      text(right - valueW - 14, y, pct, color, ' text-anchor="end" font-weight="600"') +
      text(right, y, shortNumber(s.value), p.muted, ' text-anchor="end"')
    )
  })
  const center = text(cx, cy + 2, shortNumber(total), p.text, ' text-anchor="middle" font-weight="600"') + small(cx, cy + 16, 'total', p.muted, ' text-anchor="middle"')
  const height = Math.max(2 * R + 32, pie.slices.length * 22 + 20)
  return panel(p, width, pie.title || 'pie', [`${pie.slices.length} parts`, p.muted], slices.join('') + center + legend.join(''), height, alt(pie))
}

// ── xy chart: bars and lines ──

// A tick step of 1, 2 or 5 times a power of ten, about `span / 4`.
const MAX_TICKS = 12

export const niceStep = (span: number): number => {
  const raw = (span > 0 && Number.isFinite(span) ? span : 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 5, 10].find(m => m * pow >= raw) ?? 10) * pow
}

const xySvg = (c: XY, p: Palette, width: number): Card => {
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
  const xLabels = c.xLabels.map((l, i) => (i % every === 0 ? small(left + (i + 0.5) * band, bottom + 16, l.length * SMALL_CHAR > band * every - 4 ? `${l.slice(0, Math.max(1, Math.floor((band * every - 4) / SMALL_CHAR) - 1))}…` : l, p.muted, ' text-anchor="middle"') : '')).join('')
  const hasLegend = c.series.length > 1
  const legend = hasLegend
    ? c.series
        .map((s, i) => {
          const x = left + i * 120
          return `<rect x="${x}" y="${bottom + 30}" width="10" height="10" rx="2" fill="${colorOf(i)}"/>` + small(x + 16, bottom + 39, s.name || `${s.kind} ${i + 1}`, p.text)
        })
        .join('')
    : ''
  const yTitle = c.yTitle ? small(left, 14, c.yTitle, p.muted) : ''
  const kinds = [...new Set(c.series.map(s => s.kind))].join(' + ')
  const body = yTitle + grid + drawn.join('') + xLabels + legend
  return panel(p, width, c.title || 'chart', [kinds, p.muted], body, bottom + (hasLegend ? 50 : 28), alt(c))
}

// ── every chart ──

// What a chart says, as text: the image's alt, and what Copy takes.
export const alt = (c: Chart): string => {
  switch (c.kind) {
    case 'flow': {
      const name = new Map(c.nodes.map(n => [n.id, n.label]))
      return c.edges.map(e => `${name.get(e.from) ?? e.from} -> ${name.get(e.to) ?? e.to}${e.label ? ` (${e.label})` : ''}`).join('\n') || c.nodes.map(n => n.label).join('\n')
    }
    case 'sequence':
      return c.steps.flatMap(st => (st.kind === 'msg' ? [`${c.actors[st.from]?.name} -> ${c.actors[st.to]?.name}: ${st.text}`] : [])).join('\n')
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

export const chartSvg = (c: Chart, p: Palette, width: number): Card => {
  switch (c.kind) {
    case 'flow':
      return flowSvg(c, p, width)
    case 'sequence':
      return sequenceSvg(c, p, width)
    case 'pie':
      return pieSvg(c, p, width)
    case 'xy':
      return xySvg(c, p, width)
    case 'timeline':
      return timelineSvg(c, p, width, alt(c))
    case 'gantt':
      return ganttSvg(c, p, width, alt(c))
    case 'quadrant':
      return quadrantSvg(c, p, width, alt(c))
  }
}
