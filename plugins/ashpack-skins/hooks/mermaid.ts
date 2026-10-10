import type { Gantt, Quadrant, Timeline } from './mermaid-more'
import { parseClass, parseEr, parseGantt, parseMindmap, parseQuadrant, parseState, parseTimeline } from './mermaid-more'
import { clean, frontTitle, linesOf, MAX_ITEMS, MAX_NODES } from './mermaid-text'

// Reads the ```mermaid fences a reply holds into charts the skin can draw: flowcharts,
// sequence diagrams, pies, and xy charts (bars and lines). Pure: text in, data out. Any
// other kind, or a fence it cannot read, is null and stays a code block.

export type Shape = 'rect' | 'round' | 'pill' | 'diamond' | 'hex' | 'circle'
export type FlowNode = { id: string; label: string; shape: Shape; body?: string[] } // body: a class's members, an entity's fields
export type FlowEdge = { from: string; to: string; label: string; line: 'solid' | 'dotted' | 'thick'; head: 'arrow' | 'none' | 'both' | 'start' } // start: the head at `from`
// `name`: what the drawing is when it is not a flowchart (a state diagram, a mind map...).
export type Flow = { kind: 'flow'; dir: 'TD' | 'LR' | 'BT' | 'RL'; nodes: FlowNode[]; edges: FlowEdge[]; name?: FlowName; title?: string }
export type FlowName = 'state diagram' | 'mind map' | 'class diagram' | 'ER diagram'

export type Actor = { id: string; name: string }
export type Step =
  | { kind: 'msg'; from: number; to: number; text: string; isDashed: boolean; isCross: boolean }
  | { kind: 'note'; from: number; to: number; text: string; place: 'left' | 'right' | 'over' }
  | { kind: 'open'; keyword: string; label: string }
  | { kind: 'else'; keyword: string; label: string }
  | { kind: 'close' }
export type Sequence = { kind: 'sequence'; actors: Actor[]; steps: Step[]; title?: string; autonumber?: { start: number; step: number } }

export type Pie = { kind: 'pie'; title: string; slices: { label: string; value: number }[] }

export type Series = { kind: 'bar' | 'line'; name: string; values: number[] }
export type XY = { kind: 'xy'; title: string; xLabels: string[]; yTitle: string; yMin?: number; yMax?: number; series: Series[] }

export type Chart = Flow | Sequence | Pie | XY | Timeline | Gantt | Quadrant

// ── flowchart ──

// Openers, longest first, with the closers that end them.
const SHAPES: readonly [string, readonly string[], Shape][] = [
  ['(((', [')))'], 'circle'],
  ['((', ['))'], 'circle'],
  ['([', ['])'], 'pill'],
  ['[[', [']]'], 'rect'],
  ['[(', [')]'], 'rect'],
  ['{{', ['}}'], 'hex'],
  ['[/', ['/]', '\\]'], 'rect'],
  ['[\\', ['\\]', '/]'], 'rect'],
  ['[', [']'], 'rect'],
  ['(', [')'], 'round'],
  ['{', ['}'], 'diamond'],
  ['>', [']'], 'rect'],
]

const NAMED_SHAPES: Readonly<Record<string, Shape>> = {
  diamond: 'diamond', diam: 'diamond', decision: 'diamond', question: 'diamond',
  circle: 'circle', circ: 'circle', 'dbl-circ': 'circle',
  stadium: 'pill', pill: 'pill', terminal: 'pill',
  hex: 'hex', hexagon: 'hex', prepare: 'hex',
  rounded: 'round', event: 'round',
}

// Letters, digits, `_`, and a `-` between them (`api-gateway`); `A-->B` stops at the arrow.
const ID = /^\s*([\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*)/u

type Read<T> = { value: T; rest: string }

// One node: its id, then a shape holding its label (a quoted label may hold the closer).
const readNode = (s: string): Read<{ id: string; label?: string; shape?: Shape }> | null => {
  const m = ID.exec(s)
  if (!m?.[1]) return null
  let rest = s.slice(m[0].length)
  const id = m[1]
  // The newer `A@{ shape: diamond, label: "Text" }`.
  const props = /^@\{([^}]*)\}/.exec(rest)
  if (props) {
    const label = /label:\s*"([^"]*)"/.exec(props[1] ?? '')?.[1]
    const named = /shape:\s*([\w-]+)/.exec(props[1] ?? '')?.[1] ?? ''
    return { value: { id, label: clean(label ?? id), shape: NAMED_SHAPES[named] ?? 'rect' }, rest: rest.slice(props[0].length) }
  }
  const shape = SHAPES.find(([open]) => rest.startsWith(open))
  if (!shape) return { value: { id }, rest: rest.replace(/^:::[\w-]+/, '') }
  const [open, closes, kind] = shape
  const body = rest.slice(open.length)
  const from = body.trimStart().startsWith('"') ? body.indexOf('"', body.indexOf('"') + 1) + 1 : 0
  const ends = closes.map(c => body.indexOf(c, from)).filter(i => i >= 0)
  if (ends.length === 0) return null
  const end = Math.min(...ends)
  const close = closes.find(c => body.indexOf(c, from) === end) ?? ''
  rest = body.slice(end + close.length).replace(/^:::[\w-]+/, '')
  return { value: { id, label: clean(body.slice(0, end)), shape: kind }, rest }
}

// `A & B`: the nodes one end of an edge joins.
const readGroup = (s: string): Read<{ id: string; label?: string; shape?: Shape }[]> | null => {
  const first = readNode(s)
  if (!first) return null
  const nodes = [first.value]
  let rest = first.rest
  for (let amp = /^\s*&\s*/.exec(rest); amp; amp = /^\s*&\s*/.exec(rest)) {
    const next = readNode(rest.slice(amp[0].length))
    if (!next) break
    nodes.push(next.value)
    rest = next.rest
  }
  return { value: nodes, rest }
}

// `-- text -->`, `-. text .->`, `== text ==>`, spaced or not (`A--text-->B`); then the plain
// ops, `-->|text|`. A head at the start too: `<-->`, `o--o`, `x--x`. The text may not open
// like another op (`-->`, `---`, `-.->`) or be a `--o `/`--x ` head.
const TEXT_EDGE = /^\s*(<|[ox](?=[-=]))?(--|==|-\.)(?![->=.]|[ox]\s)\s*(.+?)\s*(-{2,}[xo>]?|={2,}[xo>]?|\.-+[xo>]?)\s*/
const EDGE = /^\s*(<|[ox](?=[-=.]))?(-{2,}[xo](?=\s)|={2,}[xo](?=\s)|-\.+-[xo>]?|-{2,}>?|={2,}>?|~{3,})\s*(?:\|([^|]*)\|)?\s*/

// `isHidden`: `~~~`, a link Mermaid lays out by but never draws.
const readEdge = (s: string): Read<Omit<FlowEdge, 'from' | 'to'> & { isHidden: boolean }> | null => {
  const t = TEXT_EDGE.exec(s)
  const m = t ? null : EDGE.exec(s)
  if (!t && !m) return null
  const op = t ? `${t[2]}${t[4]}` : (m?.[2] ?? '')
  const isBack = Boolean((t ?? m)?.[1])
  const hasHead = /[>xo]$/.test(op)
  return {
    value: {
      label: clean(t ? (t[3] ?? '') : (m?.[3] ?? '')),
      line: op.includes('.') ? 'dotted' : op.includes('=') ? 'thick' : 'solid',
      head: hasHead ? (isBack ? 'both' : 'arrow') : 'none',
      isHidden: op.startsWith('~'),
    },
    rest: s.slice((t ?? m)?.[0].length ?? 0),
  }
}

// Statements that draw nothing here. `(?=\s|$)`, so `end-user` and `class-a` are nodes.
const SKIP = /^(subgraph|end|classDef|class|style|linkStyle|click|direction|accTitle|accDescr)(?=[\s:]|$)/

// Statements on a line, split on `;` outside brackets and quotes.
const statements = (line: string): string[] => {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') quoted = !quoted
    else if (!quoted && '[({'.includes(c ?? '')) depth++
    else if (!quoted && '])}'.includes(c ?? '')) depth = Math.max(0, depth - 1)
    else if (!quoted && depth === 0 && c === ';') {
      out.push(line.slice(start, i))
      start = i + 1
    }
  }
  return [...out, line.slice(start)].map(s => s.trim()).filter(Boolean)
}

type Seen = { id: string; label?: string; shape?: Shape }

// One statement's nodes and edges, `A & B --> C`; false when it cannot read it whole, or when
// its `&` groups would multiply past the cap (200 by 200 is 40,000 edges).
const readStatement = (st: string, see: (n: Seen) => void, edges: FlowEdge[]): boolean => {
  let group = readGroup(st)
  if (!group || group.value.length > MAX_NODES) return false
  group.value.forEach(see)
  for (let edge = readEdge(group.rest); edge; edge = readEdge(group.rest)) {
    const next = readGroup(edge.rest)
    if (!next || edges.length + group.value.length * next.value.length > MAX_ITEMS) return false
    next.value.forEach(see)
    const { isHidden, ...link } = edge.value
    if (!isHidden) for (const a of group.value) for (const b of next.value) edges.push({ from: a.id, to: b.id, ...link })
    group = next
  }
  return group.rest.trim() === ''
}

export const parseFlow = (src: string): Flow | null => {
  const [head, ...body] = linesOf(src).flatMap(statements)
  const m = /^(?:flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\b/i.exec(head ?? '')
  if (!m) return null
  const raw = (m[1] ?? 'TD').toUpperCase()
  const dir = raw === 'TB' ? 'TD' : (raw as Flow['dir'])
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  const groups = new Set<string>() // subgraph ids: this draws no boxes, so a link to one would be a bogus node
  const see = (n: Seen) => {
    const held = nodes.get(n.id)
    if (!held || n.shape) nodes.set(n.id, { id: n.id, label: n.label || held?.label || n.id, shape: n.shape ?? held?.shape ?? 'rect' })
  }
  // A statement it cannot read whole makes the fence code: better than a wrong chart.
  for (const st of body) {
    const sub = /^subgraph\s+([\p{L}\p{N}_-]+)/u.exec(st)?.[1]
    if (sub) groups.add(sub)
    if (SKIP.test(st)) continue
    if (!readStatement(st, see, edges) || nodes.size > MAX_NODES) return null
  }
  if ([...nodes.keys()].some(id => groups.has(id))) return null
  const title = frontTitle(src)
  return nodes.size > 0 ? { kind: 'flow', dir, nodes: [...nodes.values()], edges, ...(title ? { title } : {}) } : null
}

// ── sequence diagram ──

// A `>` arrow is looked for first, so `web-xhr->>API` is not read as a cross at `-x`.
const MSG = /^([^\s:<>-][^:<>]*?)\s*(?:<<)?(--?)(>>|>)\s*[+-]?\s*([^:]+?)\s*:\s*(.*)$/
const MSG_END = /^([^\s:<>-][^:<>]*?)\s*(--?)(x|\))\s*[+-]?\s*([^:]+?)\s*:\s*(.*)$/
const NOTE = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s*(.*)$/i
const OPEN = /^(loop|alt|opt|par|critical|break)\b\s*(.*)$/
const ELSE = /^(else|and|option)\b\s*(.*)$/
const ACTOR = /^(?:create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/
const AUTONUMBER = /^autonumber(?:\s+(\d+))?(?:\s+(\d+))?$/

export const parseSequence = (src: string): Sequence | null => {
  const [head, ...body] = linesOf(src)
  if (!/^sequenceDiagram\b/.test(head ?? '')) return null
  const chart: Sequence = { kind: 'sequence', actors: [], steps: [] }
  const { actors, steps } = chart
  const blocks: string[] = [] // what each open `end` closes: a drawn group, or a box/rect we skip
  const at = (id: string): number => {
    const key = id.trim()
    const i = actors.findIndex(a => a.id === key)
    if (i >= 0) return i
    actors.push({ id: key, name: key })
    return actors.length - 1
  }
  for (const line of body) {
    const actor = ACTOR.exec(line)
    const msg = MSG.exec(line) ?? MSG_END.exec(line)
    const note = NOTE.exec(line)
    const open = OPEN.exec(line)
    const other = ELSE.exec(line)
    const auto = AUTONUMBER.exec(line)
    const title = /^title(?:\s*:\s*|\s+)(.*)$/.exec(line)
    if (actor?.[2]) {
      const i = at(actor[2])
      actors[i] = { id: actors[i]?.id ?? actor[2], name: clean(actor[3] ?? actor[2]) }
    } else if (note?.[1] && note[2]) {
      const [a = '', b = a] = note[2].split(',')
      const place = note[1].toLowerCase() === 'left of' ? 'left' : note[1].toLowerCase() === 'right of' ? 'right' : 'over'
      steps.push({ kind: 'note', from: at(a), to: at(b), text: clean(note[3] ?? ''), place })
    } else if (auto) chart.autonumber = { start: Number(auto[1] ?? 1), step: Number(auto[2] ?? 1) }
    else if (line === 'autonumber off') return null // numbers on only some messages: code, not wrong numbers
    else if (title && !msg) chart.title = clean(title[1] ?? '')
    else if (/^(box|rect)\b/.test(line)) blocks.push('skip')
    else if (line === 'end') {
      if (blocks.pop() === 'group') steps.push({ kind: 'close' })
    } else if (open?.[1]) {
      blocks.push('group')
      steps.push({ kind: 'open', keyword: open[1], label: clean(open[2] ?? '') })
    } else if (other?.[1]) steps.push({ kind: 'else', keyword: other[1], label: clean(other[2] ?? '') })
    else if (msg?.[1] && msg[4]) {
      steps.push({ kind: 'msg', from: at(msg[1]), to: at(msg[4]), text: clean(msg[5] ?? ''), isDashed: msg[2] === '--', isCross: msg[3] === 'x' })
    }
  }
  while (blocks.length > 0) if (blocks.pop() === 'group') steps.push({ kind: 'close' })
  const title = chart.title ?? frontTitle(src)
  const fits = actors.length > 0 && actors.length <= MAX_NODES && steps.length <= MAX_ITEMS
  return fits ? { ...chart, ...(title ? { title } : {}) } : null
}

// ── pie ──

export const parsePie = (src: string): Pie | null => {
  const [head, ...body] = linesOf(src)
  const m = /^pie\b(?:\s+showData)?(?:\s+title\s+(.*))?$/.exec(head ?? '')
  if (!m) return null
  let title = clean(m[1] ?? '') || frontTitle(src)
  const slices: Pie['slices'] = []
  // `1,200` and `5%` read as numbers; a line it cannot read makes the fence code.
  for (const line of body) {
    const t = /^title\s+(.*)$/.exec(line)
    const s = /^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(\S+)$/.exec(line)
    const value = Number((s?.[2] ?? '').replace(/[,%]/g, ''))
    if (t) title = clean(t[1] ?? '')
    else if (/^(showData|accTitle|accDescr)\b/.test(line)) continue
    else if (!s?.[1] || !Number.isFinite(value) || value < 0) return null
    else if (value > 0) slices.push({ label: clean(s[1]), value })
  }
  return slices.length > 0 && slices.length <= MAX_ITEMS ? { kind: 'pie', title, slices } : null
}

// ── xy chart ──

// `[a, "b c", d]` -> its items, quotes off.
const list = (s: string): string[] =>
  [...s.replace(/^\[|\]$/g, '').matchAll(/\s*(?:"([^"]*)"|'([^']*)'|([^,]+))/g)].map(m => (m[1] ?? m[2] ?? m[3] ?? '').trim()).filter(Boolean)

// `x-axis "t" 0 --> 10`: the points spread across the range, each labelled by where it falls.
const rangeLabels = (lo: number, hi: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => String(Number((lo + (n > 1 ? ((hi - lo) * i) / (n - 1) : 0)).toFixed(2))))

export const parseXY = (src: string): XY | null => {
  const [head, ...body] = linesOf(src)
  const m = /^xychart(-beta)?\b(?:\s+(horizontal|vertical))?/.exec(head ?? '')
  // Horizontal bars this does not draw: code, rather than bars turned the wrong way.
  if (!m || m[2] === 'horizontal') return null
  const chart: XY = { kind: 'xy', title: frontTitle(src), xLabels: [], yTitle: '', series: [] }
  let range: [number, number] | null = null
  for (const line of body) {
    const title = /^title\s+(.*)$/.exec(line)
    const x = /^x-axis\s*(?:("[^"]*"|\S+(?=\s*\[)))?\s*(\[.*\])/.exec(line)
    const xRange = /^x-axis\s*(?:"[^"]*"|[^\d\s"-]\S*)?\s*(-?[\d.]+)\s*-->\s*(-?[\d.]+)$/.exec(line)
    const y = /^y-axis\s*(?:"([^"]*)"|([^\d\s"-][^\s]*))?\s*(?:(-?[\d.]+)\s*-->\s*(-?[\d.]+))?/.exec(line)
    const series = /^(bar|line)\s*(?:"([^"]*)")?\s*(\[.*\])/.exec(line)
    if (title) chart.title = clean(title[1] ?? '')
    else if (x?.[2]) chart.xLabels = list(x[2])
    else if (xRange) range = [Number(xRange[1]), Number(xRange[2])]
    else if (y) {
      chart.yTitle = clean(y[1] ?? y[2] ?? '')
      if (y[3] !== undefined && y[4] !== undefined) {
        chart.yMin = Number(y[3])
        chart.yMax = Number(y[4])
      }
    } else if (series?.[1] && series[3]) {
      // A value that is not a number would shift the rest onto the wrong categories: code instead.
      const values = list(series[3]).map(v => Number(v.replace(/,/g, '')))
      if (values.some(v => !Number.isFinite(v))) return null
      if (values.length > 0) chart.series.push({ kind: series[1] as Series['kind'], name: clean(series[2] ?? ''), values })
    }
  }
  const n = Math.max(0, ...chart.series.map(s => s.values.length))
  if (n === 0 || chart.series.reduce((a, s) => a + s.values.length, 0) > MAX_ITEMS) return null
  if (range && range.every(Number.isFinite)) chart.xLabels = rangeLabels(range[0], range[1], n)
  // Categories the axis lacks are numbered.
  chart.xLabels = Array.from({ length: n }, (_, i) => chart.xLabels[i] ?? String(i + 1))
  return chart
}

const named = (f: Flow | null, name: FlowName): Flow | null => (f ? { ...f, name } : null)

export const parseChart = (src: string): Chart | null =>
  parseFlow(src) ??
  parseSequence(src) ??
  parsePie(src) ??
  parseXY(src) ??
  named(parseState(src), 'state diagram') ??
  named(parseMindmap(src), 'mind map') ??
  named(parseClass(src), 'class diagram') ??
  named(parseEr(src), 'ER diagram') ??
  parseTimeline(src) ??
  parseGantt(src) ??
  parseQuadrant(src)
