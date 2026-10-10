import { actorHues, cells, clip, dayLabel, ganttColor, hues, numberedSteps, shapeColor, shortNumber } from './chart-kit'
import { ranksOf } from './flow-layout'
import type { Chart, Flow, FlowEdge, Pie, Sequence, Step, XY } from './mermaid'
import type { Gantt, Quadrant, Timeline } from './mermaid-more'
import type { Palette } from './skins'

// The same charts drawn in terminal cells, as rows of coloured runs: a pie as one stacked
// bar and a legend, an xy chart as bars across the page, a flowchart as each step with
// where it leads, a sequence diagram as lifelines with arrows between them. Widths are in
// cells, so CJK and emoji line up.

export type Run = { text: string; color?: string; bold?: boolean }
export type Row = Run[]

const pad = (t: string, n: number): string => {
  const cut = clip(t, n)
  return cut + ' '.repeat(Math.max(0, n - cells(cut)))
}

// A row cut to `n` cells, the run that crosses the edge ending in `…`.
const clipRow = (row: Row, n: number): Row => {
  const out: Row = []
  let room = n
  for (const r of row) {
    const w = cells(r.text)
    if (w > room) return [...out, { ...r, text: clip(r.text, room) }]
    out.push(r)
    room -= w
  }
  return out
}

// ── a grid of cells, for drawings with things at places across the row ──

type Cell = { ch: string; color?: string; bold: boolean }
type Grid = Cell[]

const blank = (width: number): Grid => Array.from({ length: width }, () => ({ ch: ' ', bold: false }))

// `t` into the row from cell `x`. A wide glyph takes two cells, the second left empty; a
// combining mark joins the glyph before it; a wide glyph half overwritten is blanked, so the
// row keeps its width. What falls off either end is left out.
const put = (g: Grid, x: number, t: string, color?: string, bold = false): void => {
  let at = x
  for (const ch of t) {
    const w = cells(ch)
    const base = g[at - 1]?.ch === '' ? at - 2 : at - 1
    const prev = g[base]
    if (w === 0 && prev) g[base] = { ...prev, ch: prev.ch + ch }
    else if (w > 0 && at >= 0 && at + w <= g.length) {
      if (g[at]?.ch === '' && g[at - 1]) g[at - 1] = { ch: ' ', bold: false }
      if (g[at + w]?.ch === '') g[at + w] = { ch: ' ', bold: false }
      g[at] = { ch, color, bold }
      if (w === 2) g[at + 1] = { ch: '', color, bold }
    }
    at += w
  }
}

const runs = (g: Grid): Row =>
  g.reduce<Row>((row, c) => {
    const last = row.at(-1)
    if (last && last.color === c.color && last.bold === c.bold) return [...row.slice(0, -1), { ...last, text: last.text + c.ch }]
    return [...row, { text: c.ch, color: c.color, bold: c.bold }]
  }, [])

const EIGHTHS = ' ▏▎▍▌▋▊▉'

// A bar `cells` long at most, in eighths of a cell.
export const barCells = (value: number, max: number, cells: number): string => {
  const eighths = Math.round((Math.max(0, value) / (max || 1)) * cells * 8)
  return '█'.repeat(Math.floor(eighths / 8)) + (eighths % 8 > 0 ? EIGHTHS[eighths % 8] : '')
}

const SPARK = '▁▂▃▄▅▆▇█'
export const sparkline = (values: readonly number[]): string => {
  const [lo, hi] = [Math.min(...values), Math.max(...values)]
  return values.map(v => SPARK[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)]).join('')
}

// ── pie: one stacked bar, then a legend ──

// Each slice's cells in a bar `width` long: at least one each while they fit, else rounded
// along the running total so the bar is never longer.
const sliceCells = (values: readonly number[], width: number): number[] => {
  const total = values.reduce((a, v) => a + v, 0)
  const own = values.map(v => Math.max(1, Math.round((v / total) * width)))
  if (own.reduce((a, c) => a + c, 0) <= width) return own
  const ends = values.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v], []).map(v => Math.round((v / total) * width))
  return ends.map((e, i) => e - (ends[i - 1] ?? 0))
}

const pieRows = (pie: Pie, p: Palette, columns: number): Row[] => {
  const colors = hues(p)
  const total = pie.slices.reduce((a, s) => a + s.value, 0)
  const bar = sliceCells(
    pie.slices.map(s => s.value),
    Math.max(10, Math.min(48, columns)),
  )
  const valueW = Math.max(...pie.slices.map(s => shortNumber(s.value).length))
  const labelW = Math.max(1, Math.min(24, columns - 10 - valueW, Math.max(...pie.slices.map(s => cells(s.label)))))
  return [
    pie.slices.map((_, i) => ({ text: '█'.repeat(bar[i] ?? 0), color: colors[i % colors.length] })),
    [],
    ...pie.slices.map((s, i) => [
      { text: '■ ', color: colors[i % colors.length] },
      { text: `${pad(s.label, labelW)}  `, color: p.text },
      { text: `${String(Math.round((s.value / total) * 100)).padStart(3)}%`, color: colors[i % colors.length], bold: true },
      { text: `  ${shortNumber(s.value).padStart(valueW)}`, color: p.muted },
    ]),
    [{ text: `total ${shortNumber(total)}`, color: p.muted }],
  ]
}

// ── xy: a bar per category across the page; a line as a sparkline ──

// A bar row per category and series, from a zero line: negative values grow left of it in
// whole cells, positive ones right of it in eighths.
const barRows = (c: XY, p: Palette, columns: number, colorOf: (s: XY['series'][number]) => string | undefined): Row[] => {
  const bars = c.series.filter(s => s.kind === 'bar')
  const labelW = Math.min(14, Math.max(...c.xLabels.map(cells)))
  const valueW = Math.max(...c.series.flatMap(s => s.values.map(v => shortNumber(v).length)))
  const room = Math.max(8, columns - labelW - valueW - 4)
  const values = bars.flatMap(s => s.values)
  const [lo, hi] = [Math.min(0, ...values), Math.max(0, ...values)]
  const negRoom = lo < 0 ? Math.round((room * -lo) / (hi - lo)) : 0
  const posRoom = room - negRoom
  return c.xLabels.flatMap((label, i) =>
    bars.map((s, j) => {
      const v = s.values[i] ?? 0
      const neg = v < 0 ? '█'.repeat(Math.round((v / lo) * negRoom)) : ''
      const pos = barCells(v, hi, posRoom)
      return [
        { text: `${pad(j === 0 ? label : '', labelW)} ${' '.repeat(negRoom - neg.length)}`, color: p.muted },
        { text: neg, color: colorOf(s) },
        { text: '│', color: p.muted },
        { text: pos, color: colorOf(s) },
        { text: ' '.repeat(posRoom - [...pos].length + 1), color: undefined },
        { text: shortNumber(v).padStart(valueW), color: p.text },
      ]
    }),
  )
}

const xyRows = (c: XY, p: Palette, columns: number): Row[] => {
  const colors = hues(p)
  const lines = c.series.filter(s => s.kind === 'line')
  const colorOf = (s: (typeof c.series)[number]) => colors[c.series.indexOf(s) % colors.length]
  const legend: Row[] = c.series.length > 1 ? [c.series.flatMap((s, i) => [{ text: '■ ', color: colorOf(s) }, { text: `${s.name || `${s.kind} ${i + 1}`}   `, color: p.text }])] : []
  const yTitle: Row[] = c.yTitle ? [[{ text: c.yTitle, color: p.muted }]] : []
  const barLines = barRows(c, p, columns, colorOf)
  const labelW = Math.min(14, Math.max(...c.xLabels.map(cells)))
  const sparkName = (s: (typeof lines)[number], i: number) => s.name || (lines.length > 1 ? `line ${i + 1}` : 'trend')
  const sparkW = Math.min(24, Math.max(labelW, ...lines.map((s, i) => cells(sparkName(s, i)))))
  const sparkRows = lines.map((s, i) => [
    { text: `${pad(sparkName(s, i), sparkW)}  `, color: p.muted },
    { text: sparkline(s.values), color: colorOf(s) },
    { text: `  ${shortNumber(Math.min(...s.values))} – ${shortNumber(Math.max(...s.values))}`, color: p.muted },
  ])
  const ends: Row[] = lines.length > 0 && barLines.length === 0 ? [[{ text: `${' '.repeat(sparkW + 2)}${c.xLabels[0] ?? ''} → ${c.xLabels.at(-1) ?? ''}`, color: p.muted }]] : []
  return [...legend, ...yTitle, ...barLines, ...(barLines.length > 0 && sparkRows.length > 0 ? [[]] : []), ...sparkRows, ...ends]
}

// ── flowchart: each step, then the steps it leads to ──

const LINES: Record<FlowEdge['line'], string> = { solid: '─', dotted: '┄', thick: '━' }

const flowRows = (f: Flow, p: Palette): Row[] => {
  const index = new Map(f.nodes.map((n, i) => [n.id, i]))
  const rank = ranksOf(
    f.nodes.length,
    f.edges.map(e => [index.get(e.from) ?? 0, index.get(e.to) ?? 0] as const),
  )
  const order = f.nodes.map((n, i) => ({ n, i })).sort((a, b) => (rank[a.i] ?? 0) - (rank[b.i] ?? 0) || a.i - b.i)
  const byId = new Map(f.nodes.map(n => [n.id, n]))
  return order.flatMap(({ n }) => {
    const out = f.edges.filter(e => e.from === n.id)
    const isAlone = out.length === 0 && !f.edges.some(e => e.to === n.id)
    if (out.length === 0 && !isAlone && !n.body) return []
    const head: Row = [{ text: n.label, color: shapeColor(p, n.shape), bold: true }]
    const body: Row[] = (n.body ?? []).map(line => [{ text: `    ${line}`, color: p.muted }])
    return [
      head,
      ...body,
      ...out.map((e, k) => {
        const to = byId.get(e.to)
        const line = LINES[e.line]
        const tip = e.head === 'none' || e.head === 'start' ? line : '▶'
        return [
          { text: `  ${k === out.length - 1 ? '└' : '├'}${e.head === 'both' || e.head === 'start' ? '◀' : line}`, color: p.muted },
          ...(e.label ? [{ text: ` ${e.label} `, color: p.text }] : []),
          { text: `${line}${tip} `, color: p.muted },
          { text: to?.label ?? e.to, color: to ? shapeColor(p, to.shape) : p.text },
        ]
      }),
    ]
  })
}

// ── sequence: lifelines, an arrow per message ──

const NAME_CELLS = 24

// Where each actor's lifeline runs, `gap` apart: as far as names and messages want, as near
// as the width allows.
const seqLayout = (names: readonly string[], steps: readonly Step[], columns: number) => {
  const firstHalf = Math.ceil(cells(names[0] ?? '') / 2)
  const lastHalf = Math.ceil(cells(names.at(-1) ?? '') / 2)
  const right = steps.some(st => st.kind === 'msg' && st.from === st.to) ? 12 : 1
  const need = Math.max(
    10,
    ...names.slice(1).map((nm, i) => Math.ceil((cells(names[i] ?? '') + cells(nm)) / 2) + 3),
    ...steps.flatMap(st => (st.kind === 'msg' && st.from !== st.to ? [Math.ceil((cells(st.text) + 6) / Math.abs(st.to - st.from))] : [])),
  )
  const gap = Math.min(need, Math.floor((columns - firstHalf - lastHalf - right) / Math.max(1, names.length - 1)))
  const cols = names.map((_, i) => firstHalf + i * gap)
  return { gap, cols, width: Math.min(columns, (cols.at(-1) ?? 0) + lastHalf + right) }
}

// Too many actors for the width: a line per message instead.
const listRows = (steps: readonly Step[], names: readonly string[], colors: readonly string[], p: Palette): Row[] =>
  steps.flatMap(st =>
    st.kind === 'msg'
      ? [[{ text: names[st.from] ?? '', color: colors[st.from % colors.length], bold: true }, { text: st.isDashed ? ' ┄▶ ' : ' ─▶ ', color: p.muted }, { text: names[st.to] ?? '', color: colors[st.to % colors.length], bold: true }, { text: `  ${st.text}`, color: p.text }]]
      : [],
  )

// A step's rows over the lifelines `lined()` draws.
const stepGrids = (st: Step, cols: readonly number[], width: number, p: Palette, lined: () => Grid): Grid[] => {
  const g = lined()
  if (st.kind === 'msg') {
    const [a, b] = [cols[st.from] ?? 0, cols[st.to] ?? 0]
    if (a === b) {
      put(g, a + 1, ` ↺ ${clip(st.text, width - a - 4)}`, p.text)
      return [g]
    }
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)]
    put(g, lo + 2, clip(st.text, hi - lo - 3), p.text)
    const arrow = lined()
    put(arrow, lo + 1, (st.isDashed ? '┄' : '─').repeat(hi - lo - 1), p.muted)
    put(arrow, b > a ? b - 1 : b + 1, st.isCross ? '✕' : b > a ? '▶' : '◀', st.isCross ? p.red : p.text)
    return [g, arrow]
  }
  if (st.kind === 'note') {
    const [x, y] = [cols[st.from] ?? 0, cols[st.to] ?? 0]
    const t = `[ ${clip(st.text, Math.max(6, width - 4))} ]`
    const tw = cells(t)
    const at = st.place === 'left' ? x - 1 - tw : st.place === 'right' ? x + 2 : Math.round((x + y) / 2 - tw / 2)
    put(g, Math.max(0, Math.min(width - tw, at)), t, p.yellow)
    return [g]
  }
  if (st.kind === 'close') {
    put(g, 0, '└─', p.muted)
    return [g]
  }
  const lead = st.kind === 'open' ? '┌ ' : '├┄ '
  put(g, 0, lead, p.muted)
  put(g, cells(lead), st.keyword, st.kind === 'open' ? p.accent : p.muted, st.kind === 'open')
  if (st.label) put(g, cells(lead) + cells(st.keyword), ` ${clip(st.label, width - cells(lead) - cells(st.keyword) - 1)}`, p.muted)
  return [g]
}

const seqRows = (s: Sequence, p: Palette, columns: number): Row[] => {
  const steps = numberedSteps(s)
  const names = s.actors.map(a => clip(a.name, NAME_CELLS))
  const colors = actorHues(p)
  const { gap, cols, width } = seqLayout(names, steps, columns)
  if (names.length > 1 && gap < 8) return listRows(steps, names, colors, p)
  const lined = (): Grid => {
    const g = blank(width)
    cols.forEach(c => put(g, c, '│', p.muted))
    return g
  }
  const head = blank(width)
  names.forEach((nm, i) => {
    const t = clip(nm, i === 0 || i === names.length - 1 ? NAME_CELLS : gap - 1)
    put(head, (cols[i] ?? 0) - Math.floor(cells(t) / 2), t, colors[i % colors.length] ?? p.text, true)
  })
  return [head, ...steps.flatMap(st => stepGrids(st, cols, width, p, lined))].map(runs)
}

// ── timeline: a period per row, its events after it ──

const timelineRows = (c: Timeline, p: Palette): Row[] => {
  const colors = hues(p)
  const sections = [...new Set(c.periods.map(x => x.section))]
  const labelW = Math.min(16, Math.max(...c.periods.map(x => cells(x.label))))
  return c.periods.flatMap((x, i) => {
    const color = colors[(sections.some(Boolean) ? sections.indexOf(x.section) : i) % colors.length]
    const head: Row[] = x.section && c.periods[i - 1]?.section !== x.section ? [[{ text: x.section, color: p.muted, bold: true }]] : []
    return [...head, [{ text: `${pad(x.label, labelW)}  `, color, bold: true }, { text: x.events.join(' · '), color: p.text }]]
  })
}

// ── Gantt: a row per task, its bar placed on the days the chart spans ──

const ganttRows = (c: Gantt, p: Palette, columns: number): Row[] => {
  const first = Math.min(...c.tasks.map(t => t.start))
  const last = Math.max(...c.tasks.map(t => t.end))
  const span = Math.max(1, last - first)
  const sections = [...new Set(c.tasks.map(t => t.section))]
  const labelW = Math.min(20, Math.max(...c.tasks.map(t => cells(t.name))))
  const room = Math.max(10, columns - labelW - 3)
  const cell = (day: number) => Math.round(((day - first) / span) * room)
  const withYear = span > 300
  const end = dayLabel(last, withYear)
  const axis: Row = [{ text: `${' '.repeat(labelW + 2)}${pad(dayLabel(first, withYear), room - end.length)}${end}`, color: p.muted }]
  const rows = c.tasks.flatMap((t, i) => {
    const head: Row[] = t.section && c.tasks[i - 1]?.section !== t.section ? [[{ text: t.section, color: p.muted, bold: true }]] : []
    const color = ganttColor(p, t.tags, sections.indexOf(t.section))
    const from = cell(t.start)
    const bar = t.tags.includes('milestone') ? '◆' : '█'.repeat(Math.max(1, cell(t.end) - from))
    return [...head, [{ text: `${pad(t.name, labelW)} │${' '.repeat(from)}`, color: p.muted }, { text: bar, color }]]
  })
  return [axis, ...rows]
}

// ── quadrant: a grid split four ways, each point a number, then the numbers' names ──

const MARKS = '123456789abcdefghijklmnopqrstuvwxyz'

const quadrantRows = (c: Quadrant, p: Palette, columns: number): Row[] => {
  const w = Math.max(20, Math.min(48, columns - 4))
  const h = 13
  const [mx, my] = [Math.floor(w / 2), Math.floor(h / 2)]
  const grid = Array.from({ length: h }, (_, y) => {
    const g = blank(w)
    put(g, 0, (y === my ? '─' : ' ').repeat(w), p.muted)
    put(g, mx, y === my ? '┼' : '│', p.muted)
    return g
  })
  // Each quarter's name in its top row: 2 1 over 3 4, as Mermaid numbers them.
  const corners: [number, number][] = [
    [mx + 2, 0],
    [1, 0],
    [1, my + 1],
    [mx + 2, my + 1],
  ]
  corners.forEach(([x, y], i) => grid[y] && put(grid[y], x, clip(c.names[i] ?? '', mx - 3), p.muted))
  c.points.forEach((pt, i) => {
    const row = grid[Math.round((1 - pt.y) * (h - 1))]
    if (row) put(row, Math.round(pt.x * (w - 1)), MARKS[i % MARKS.length] ?? '•', p.accent)
  })
  const axis: Row[] = [
    [{ text: `${pad(c.x[0], mx)}${c.x[1]}`, color: p.muted }],
    [{ text: `↑ ${c.y[1] || 'high'}  ↓ ${c.y[0] || 'low'}`, color: p.muted }],
  ]
  const legend: Row[] = c.points.map((pt, i) => [{ text: `${MARKS[i % MARKS.length]} `, color: p.accent, bold: true }, { text: pt.label, color: p.text }, { text: `  ${pt.x}, ${pt.y}`, color: p.muted }])
  return [...grid.map(runs), ...axis, [], ...legend]
}

// A chart's title line, then its rows.
export const chartTitle = (c: Chart): string =>
  c.kind === 'flow' ? c.title || c.name || 'flowchart' : c.kind === 'sequence' ? c.title || 'sequence' : c.title || c.kind

const rowsOf = (c: Chart, p: Palette, columns: number): Row[] => {
  switch (c.kind) {
    case 'flow':
      return flowRows(c, p)
    case 'sequence':
      return seqRows(c, p, columns)
    case 'pie':
      return pieRows(c, p, columns)
    case 'xy':
      return xyRows(c, p, columns)
    case 'timeline':
      return timelineRows(c, p)
    case 'gantt':
      return ganttRows(c, p, columns)
    case 'quadrant':
      return quadrantRows(c, p, columns)
  }
}

// Every row fits the width: a long label is cut, never wrapped onto the next line.
export const chartRows = (c: Chart, p: Palette, columns: number): Row[] => rowsOf(c, p, columns).map(row => clipRow(row, columns))
