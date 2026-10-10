import type { Flow, FlowEdge, FlowNode, Shape } from './mermaid'
import { clean, frontTitle, linesOf, MAX_ITEMS, MAX_NODES, rawLinesOf, unquote } from './mermaid-text'

// More Mermaid kinds. State, mind map, class and ER diagrams read into the flowchart's
// shape (nodes and edges), so they share its layout and drawing; timeline, Gantt and
// quadrant charts have shapes of their own. Pure, like mermaid.ts, and as strict: what a
// reader cannot read whole is null, and the fence stays code.

export type Timeline = { kind: 'timeline'; title: string; periods: { section: string; label: string; events: string[] }[] }
export type GanttTask = { section: string; name: string; start: number; end: number; tags: string[] } // days since the epoch
export type Gantt = { kind: 'gantt'; title: string; tasks: GanttTask[] }
export type Quadrant = {
  kind: 'quadrant'
  title: string
  x: [string, string]
  y: [string, string]
  names: [string, string, string, string] // quadrant-1 (top right) to quadrant-4 (bottom right), as Mermaid numbers them
  points: { label: string; x: number; y: number }[]
}

type Graph = { nodes: Map<string, FlowNode>; edges: FlowEdge[] }
const graph = (): Graph => ({ nodes: new Map(), edges: [] })
const see = (g: Graph, id: string, patch: Partial<FlowNode> = {}): void => {
  const held = g.nodes.get(id)
  g.nodes.set(id, { id, label: held?.label ?? id, shape: held?.shape ?? 'round', ...(held?.body ? { body: held.body } : {}), ...patch })
}
// The graph as a flow, its front matter's title on it; null when empty or past the caps.
const flowOf = (g: Graph, dir: Flow['dir'], src: string): Flow | null => {
  const nodes = [...g.nodes.values()]
  const members = nodes.reduce((a, n) => a + (n.body?.length ?? 0), 0)
  if (nodes.length === 0 || nodes.length > MAX_NODES || g.edges.length > MAX_ITEMS || members > MAX_ITEMS) return null
  const title = frontTitle(src)
  return { kind: 'flow', dir, nodes, edges: g.edges, ...(title ? { title } : {}) }
}
const dirOf = (lines: readonly string[], fallback: Flow['dir']): Flow['dir'] =>
  (/^\s*direction\s+(TB|TD|BT|LR|RL)\b/m.exec(lines.join('\n'))?.[1]?.replace('TB', 'TD') as Flow['dir'] | undefined) ?? fallback

// ── state diagram: states and transitions; [*] is where it starts and ends ──

export const parseState = (src: string): Flow | null => {
  const [head, ...body] = linesOf(src)
  if (!/^stateDiagram(-v2)?\b/.test(head ?? '')) return null
  const g = graph()
  const id = (name: string, side: 'from' | 'to') => {
    if (name !== '[*]') return name
    const start = side === 'from'
    see(g, start ? '__start' : '__end', { label: start ? 'start' : 'end', shape: 'pill' })
    return start ? '__start' : '__end'
  }
  let depth = 0 // inside a composite state's braces
  let inNote = false // inside a note's lines, up to `end note`
  for (const raw of body) {
    const line = raw.replace(/:::[\w-]+/g, '')
    if (inNote) {
      inNote = line !== 'end note'
      continue
    }
    if (/^note\b/.test(line) && !line.includes(':')) {
      inNote = true
      continue
    }
    if (/\{\s*$/.test(line)) depth++
    if (line === '}') depth = Math.max(0, depth - 1)
    // A composite's own start and end would merge with the outer ones: code instead.
    if (depth > 0 && line.includes('[*]')) return null
    const move = /^(\S+)\s*-->\s*(\S+?)\s*(?::\s*(.*))?$/.exec(line)
    const named = /^state\s+"([^"]+)"\s+as\s+(\w+)/.exec(line)
    const special = /^state\s+(\w+)\s+<<(choice|fork|join)>>/.exec(line)
    const described = /^(\w+)\s*:\s*(.+)$/.exec(line)
    if (move?.[1] && move[2]) {
      const [from, to] = [id(move[1], 'from'), id(move[2], 'to')]
      if (from !== '__start') see(g, from)
      if (to !== '__end') see(g, to)
      g.edges.push({ from, to, label: clean(move[3] ?? ''), line: 'solid', head: 'arrow' })
    } else if (named?.[1] && named[2]) see(g, named[2], { label: clean(named[1]) })
    else if (special?.[1]) see(g, special[1], { label: special[2] === 'choice' ? '?' : special[2] ?? '', shape: special[2] === 'choice' ? 'diamond' : 'rect' })
    else if (/^(state\s+\S+.*\{|\}|--|note\b|end note|direction\b|classDef|class\b|style\b|accTitle|accDescr)/.test(line)) continue
    else if (described?.[1] && described[2]) see(g, described[1], { label: clean(described[2]) })
    else if (/^\w+$/.test(line)) see(g, line)
    else return null
  }
  return flowOf(g, dirOf(body, 'TD'), src)
}

// ── mind map: an indented tree, drawn across the page from its root ──

const MIND_SHAPES: readonly [RegExp, Shape][] = [
  [/^\(\((.*)\)\)$/, 'circle'],
  [/^\)\)(.*)\(\($/, 'circle'],
  [/^\{\{(.*)\}\}$/, 'hex'],
  [/^\[(.*)\]$/, 'rect'],
  [/^\)(.*)\($/, 'round'],
  [/^\((.*)\)$/, 'round'],
]

export const parseMindmap = (src: string): Flow | null => {
  const [head, ...body] = rawLinesOf(src)
  if (!/^\s*mindmap\b/.test(head ?? '')) return null
  const g = graph()
  const stack: { indent: number; id: string }[] = []
  for (const line of body) {
    const text = line.trim()
    if (text.startsWith('::icon') || text.startsWith(':::')) continue
    const indent = line.length - line.trimStart().length
    const bare = text.replace(/:::\S+$/, '').trim()
    // `id((label))` or a bare label; the id is dropped, the shape kept.
    const m = /^([\w-]*)(.*)$/.exec(bare)
    const shaped = MIND_SHAPES.map(([re, shape]) => [re.exec(m?.[2] ?? ''), shape] as const).find(([hit]) => hit)
    const label = clean(shaped ? (shaped[0]?.[1] ?? '') : bare)
    const id = `n${g.nodes.size}`
    while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) stack.pop()
    const parent = stack.at(-1)
    if (!parent && g.nodes.size > 0) return null // a second root
    see(g, id, { label, shape: shaped?.[1] ?? (parent ? 'round' : 'circle') })
    if (parent) g.edges.push({ from: parent.id, to: id, label: '', line: 'solid', head: 'none' })
    stack.push({ indent, id })
  }
  return flowOf(g, 'LR', src)
}

// ── class diagram: classes with their members, and how they relate ──

// `A "1" --> "*" B : owns`: the quoted cardinalities are kept, shown in the edge's label.
const RELATION = /^([\w~<>]+)\s*(?:"([^"]*)"\s*)?(<\|--|\*--|o--|<--|<\.\.|<\|\.\.|--\|>|--\*|--o|-->|\.\.>|\.\.\|>|--|\.\.)\s*(?:"([^"]*)"\s*)?([\w~<>]+)\s*(?::\s*(.*))?$/

// `Repository~T~` is the class `Repository`, shown `Repository<T>`; `List~int~` in a member too.
const classId = (name: string): string => name.replace(/~[^~]*~$/, '')
const generics = (text: string): string => text.replace(/~([^~]*)~/g, '<$1>')

const relationEdge = (rel: RegExpExecArray, a: string, b: string): FlowEdge => {
  const op = rel[3] ?? ''
  const hasHead = /[<>]/.test(op)
  const cards = [rel[2], rel[4]].filter((c): c is string => c !== undefined).join(' to ')
  const label = [clean(rel[6] ?? ''), cards ? `(${cards})` : ''].filter(Boolean).join(' ')
  // Kept in the order written, so the first-named class sits on top; `<|--` puts the head at it.
  return { from: a, to: b, label, line: op.includes('..') ? 'dotted' : 'solid', head: !hasHead ? 'none' : op.startsWith('<') ? 'start' : 'arrow' }
}

export const parseClass = (src: string): Flow | null => {
  const [head, ...body] = linesOf(src)
  if (!/^classDiagram(-v2)?\b/.test(head ?? '')) return null
  const g = graph()
  // A member under the name; `<<interface>>` as `«interface»` over the members.
  const member = (cls: string, text: string, isFirst = false) => {
    see(g, cls, { shape: 'rect' })
    const held = g.nodes.get(cls)
    if (held) g.nodes.set(cls, { ...held, body: isFirst ? [text, ...(held.body ?? [])] : [...(held.body ?? []), text] })
  }
  const annotation = (word: string) => `«${clean(word)}»`
  let open: string | null = null
  for (const line of body) {
    const stereo = /^<<(.+)>>\s*([\w~]+)?$/.exec(line)
    if (open) {
      if (line === '}') open = null
      else if (stereo?.[1] && !stereo[2]) member(open, annotation(stereo[1]), true)
      else member(open, generics(line))
      continue
    }
    const cls = /^class\s+([\w~<>]+)(?:\["([^"]*)"\])?\s*(\{)?\s*$/.exec(line)
    const rel = RELATION.exec(line)
    const field = /^([\w~<>]+)\s*:\s*(.+)$/.exec(line)
    if (cls?.[1]) {
      const id = classId(cls[1])
      see(g, id, { shape: 'rect', label: cls[2] ? clean(cls[2]) : generics(cls[1]) })
      if (cls[3]) open = id
    } else if (rel?.[1] && rel[3] && rel[5]) {
      const [a, b] = [classId(rel[1]), classId(rel[5])]
      see(g, a, { shape: 'rect' })
      see(g, b, { shape: 'rect' })
      g.edges.push(relationEdge(rel, a, b))
    } else if (field?.[1] && field[2]) member(classId(field[1]), generics(field[2].trim()))
    else if (stereo?.[1] && stereo[2]) member(classId(stereo[2]), annotation(stereo[1]), true)
    else if (/^(direction|note|classDef|style|cssClass|click|callback|link|<<)/.test(line)) continue
    else return null
  }
  return flowOf(g, dirOf(body, 'TD'), src)
}

// ── ER diagram: entities with their fields, joined by how many of each ──

// `}|`, `|{`, `}o`, `o{` are many; `||`, `|o`, `o|` one.
const sideWord = (end: string): string => (/[{}]/.test(end) ? 'many' : 'one')

export const parseEr = (src: string): Flow | null => {
  const [head, ...body] = linesOf(src)
  if (!/^erDiagram\b/.test(head ?? '')) return null
  const g = graph()
  let open: string | null = null
  for (const line of body) {
    if (open) {
      if (line === '}') open = null
      else {
        const [type = '', name = '', ...rest] = line.split(/\s+/)
        const keys = rest.filter(w => /^(PK|FK|UK)$/.test(w.replace(/,$/, ''))).join(' ')
        const held = g.nodes.get(open)
        if (held) g.nodes.set(open, { ...held, body: [...(held.body ?? []), `${name} ${type}${keys ? ` ${keys}` : ''}`] })
      }
      continue
    }
    const rel = /^([\w-]+|"[^"]+")\s+([|}o]{2})(--|\.\.)([|{o]{2})\s+([\w-]+|"[^"]+")\s*:\s*(.+)$/.exec(line)
    const entity = /^([\w-]+|"[^"]+")(?:\s*\[([^\]]+)\])?(?:\s*(\{))?$/.exec(line)
    if (rel?.[1] && rel[2] && rel[4] && rel[5]) {
      const [a, b] = [unquote(rel[1]), unquote(rel[5])]
      see(g, a, { shape: 'rect' })
      see(g, b, { shape: 'rect' })
      g.edges.push({ from: a, to: b, label: `${clean(rel[6] ?? '')} (${sideWord(rel[2])} to ${sideWord(rel[4])})`, line: rel[3] === '..' ? 'dotted' : 'solid', head: 'none' })
    } else if (entity?.[1]) {
      const id = unquote(entity[1])
      see(g, id, { shape: 'rect', ...(entity[2] ? { label: clean(entity[2]) } : {}) })
      if (entity[3]) open = id
    } else if (!/^(direction|style|classDef|class)\b/.test(line)) return null
  }
  return flowOf(g, dirOf(body, 'TD'), src)
}

// ── timeline: periods, each with its events, in sections ──

export const parseTimeline = (src: string): Timeline | null => {
  const [head, ...body] = linesOf(src)
  if (!/^timeline\b/.test(head ?? '')) return null
  const chart: Timeline = { kind: 'timeline', title: frontTitle(src), periods: [] }
  let section = ''
  for (const line of body) {
    const title = /^title\s+(.*)$/.exec(line)
    const sect = /^section\s+(.*)$/.exec(line)
    if (title) chart.title = clean(title[1] ?? '')
    else if (sect) section = clean(sect[1] ?? '')
    else if (line.startsWith(':')) {
      const last = chart.periods.at(-1)
      if (!last) return null
      last.events.push(...line.split(':').map(clean).filter(Boolean))
    } else {
      const [label = '', ...events] = line.split(':').map(clean)
      chart.periods.push({ section, label, events: events.filter(Boolean) })
    }
  }
  const items = chart.periods.reduce((a, x) => a + 1 + x.events.length, 0)
  return chart.periods.length > 0 && items <= MAX_ITEMS ? chart : null
}

// ── Gantt: tasks on a calendar ──

export const DAY = 86_400_000
const MAX_DAYS = 36_600 // a century: past it a length is a typo, and the calendar would not draw
const dayOf = (iso: string): number | null => {
  const t = Date.parse(`${iso}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(t) ? Math.round(t / DAY) : null
}
const lengthOf = (spec: string): number | null => {
  const m = /^(\d+(?:\.\d+)?)\s*(d|w|h)$/.exec(spec)
  if (!m) return null
  const n = Number(m[1])
  const days = m[2] === 'w' ? n * 7 : m[2] === 'h' ? n / 24 : n
  return days <= MAX_DAYS ? days : null
}
const TAGS = new Set(['done', 'active', 'crit', 'milestone'])

// Day 0 of the epoch was a Thursday, so 2 and 3 (mod 7) are Saturday and Sunday.
const isWeekend = (day: number): boolean => [2, 3].includes(((Math.floor(day) % 7) + 7) % 7)

// Mermaid's `excludes weekends`: each weekend day from the start to the end pushes the end a
// day on; the bar is drawn to the close of the last working day.
const workSpan = (start: number, end: number): { end: number; shown: number } => {
  let [e, shown, isOff] = [end, end, false]
  for (let d = start; d <= e; d++) {
    if (!isOff) shown = e
    isOff = isWeekend(d)
    if (isOff) e++
  }
  return { end: e, shown }
}

type Span = { id: string; start: number; end: number; shown: number; tags: string[] }

// A task's `[id,] start, end-or-length`, or just a length after the task before (ending at
// `prev`); `after a b` starts when the last of those ends.
const spanOf = (spec: string, prev: number | null, ends: ReadonlyMap<string, number>, skipsWeekends: boolean): Span | null => {
  const parts = spec.split(',').map(p => p.trim())
  const tags = parts.filter(p => TAGS.has(p))
  const rest = parts.filter(p => !TAGS.has(p))
  const [a = '', b, c] = rest
  const hasId = rest.length === 3 || (rest.length === 2 && !/^after\s/.test(a) && dayOf(a) === null && lengthOf(a) === null)
  const [id, startSpec, endSpec] = hasId ? [a, b ?? '', c ?? ''] : ['', rest.length === 1 ? '' : a, rest.length === 1 ? a : (b ?? '')]
  const after = /^after\s+(.+)$/.exec(startSpec)
  const start = startSpec === '' ? prev : after ? Math.max(...(after[1] ?? '').split(/\s+/).map(x => ends.get(x) ?? Number.NaN)) : dayOf(startSpec)
  if (start === null || !Number.isFinite(start)) return null
  const date = dayOf(endSpec)
  const length = lengthOf(endSpec)
  // A date ends where it says; a length counts only working days when weekends are off.
  const span = date !== null ? { end: date, shown: date } : length === null ? null : skipsWeekends ? workSpan(start, start + length) : { end: start + length, shown: start + length }
  return span && span.end >= start ? { id, start, ...span, tags } : null
}

const WEEKENDS = /^excludes\s+weekends$/i

export const parseGantt = (src: string): Gantt | null => {
  const [head, ...body] = linesOf(src)
  if (!/^gantt\b/.test(head ?? '')) return null
  const chart: Gantt = { kind: 'gantt', title: frontTitle(src), tasks: [] }
  const ends = new Map<string, number>()
  const skipsWeekends = body.some(l => WEEKENDS.test(l)) // wherever it is written, as Mermaid reads it
  let [section, prev] = ['', null as number | null]
  for (const line of body) {
    const title = /^title\s+(.*)$/.exec(line)
    const sect = /^section\s+(.*)$/.exec(line)
    const task = /^([^:]+?)\s*:\s*(.+)$/.exec(line)
    if (title) chart.title = clean(title[1] ?? '')
    else if (sect) section = clean(sect[1] ?? '')
    else if (/^(dateFormat|axisFormat|includes|todayMarker|tickInterval|weekday|topAxis|displayMode)\b/.test(line)) {
      const format = /^dateFormat\s+(.*)$/.exec(line)
      if (format && format[1]?.trim() !== 'YYYY-MM-DD') return null // only ISO dates are read
    } else if (WEEKENDS.test(line)) continue
    else if (/^(excludes|inclusiveEndDates|weekend)\b/.test(line)) return null // calendars it does not keep: code, not wrong bars
    else if (task?.[1] && task[2]) {
      const span = spanOf(task[2], prev, ends, skipsWeekends)
      if (!span || chart.tasks.length >= MAX_ITEMS) return null
      chart.tasks.push({ section, name: clean(task[1]), start: span.start, end: span.shown, tags: span.tags })
      if (span.id) ends.set(span.id, span.end)
      prev = span.end
    } else return null
  }
  return chart.tasks.length > 0 ? chart : null
}

// ── quadrant chart: points on two axes, four named quarters ──

export const parseQuadrant = (src: string): Quadrant | null => {
  const [head, ...body] = linesOf(src)
  if (!/^quadrantChart\b/.test(head ?? '')) return null
  const chart: Quadrant = { kind: 'quadrant', title: frontTitle(src), x: ['', ''], y: ['', ''], names: ['', '', '', ''], points: [] }
  const axis = (t: string): [string, string] => {
    const [lo = '', hi = ''] = t.split('-->').map(clean)
    return [lo, hi]
  }
  for (const line of body) {
    const title = /^title\s+(.*)$/.exec(line)
    const x = /^x-axis\s+(.*)$/.exec(line)
    const y = /^y-axis\s+(.*)$/.exec(line)
    const q = /^quadrant-([1-4])\s+(.*)$/.exec(line)
    const point = /^(.+?)\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/.exec(line)
    if (title) chart.title = clean(title[1] ?? '')
    else if (x) chart.x = axis(x[1] ?? '')
    else if (y) chart.y = axis(y[1] ?? '')
    else if (q) chart.names[Number(q[1]) - 1] = clean(q[2] ?? '')
    else if (point?.[1]) {
      const [px, py] = [Number(point[2]), Number(point[3])]
      if (!(px >= 0 && px <= 1 && py >= 0 && py <= 1)) return null
      chart.points.push({ label: clean(point[1]), x: px, y: py })
    } else if (!/^(classDef|style)\b/.test(line)) return null
  }
  return (chart.points.length > 0 || chart.names.some(Boolean)) && chart.points.length <= MAX_ITEMS ? chart : null
}
