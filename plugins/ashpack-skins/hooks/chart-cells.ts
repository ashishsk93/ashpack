import { hues, shortNumber } from './chart-kit'
import { ganttColor } from './charts-more'
import type { Gantt, Quadrant, Timeline } from './mermaid-more'
import { dayLabel } from './mermaid-more'
import { ranksOf } from './flow-layout'
import type { Chart, Flow, FlowEdge, Pie, Sequence, Shape, XY } from './mermaid'
import type { Palette } from './skins'

// The same charts drawn in terminal cells, as rows of coloured runs: a pie as one stacked
// bar and a legend, an xy chart as bars across the page, a flowchart as each step with
// where it leads, a sequence diagram as lifelines with arrows between them.

export type Run = { text: string; color?: string; bold?: boolean }
export type Row = Run[]

const len = (t: string): number => [...t].length
const clip = (t: string, n: number): string => (len(t) <= n ? t : n <= 1 ? '…'.slice(0, n) : `${[...t].slice(0, n - 1).join('')}…`)
const pad = (t: string, n: number): string => clip(t, n) + ' '.repeat(Math.max(0, n - len(t)))

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

const pieRows = (pie: Pie, p: Palette, columns: number): Row[] => {
  const colors = hues(p)
  const total = pie.slices.reduce((a, s) => a + s.value, 0)
  const width = Math.max(10, Math.min(48, columns))
  const cells = pie.slices.map(s => Math.max(1, Math.round((s.value / total) * width)))
  const labelW = Math.min(24, Math.max(...pie.slices.map(s => len(s.label))))
  const valueW = Math.max(...pie.slices.map(s => shortNumber(s.value).length))
  return [
    pie.slices.map((_, i) => ({ text: '█'.repeat(cells[i] ?? 1), color: colors[i % colors.length] })),
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

const xyRows = (c: XY, p: Palette, columns: number): Row[] => {
  const colors = hues(p)
  const bars = c.series.filter(s => s.kind === 'bar')
  const lines = c.series.filter(s => s.kind === 'line')
  const colorOf = (s: (typeof c.series)[number]) => colors[c.series.indexOf(s) % colors.length]
  const labelW = Math.min(14, Math.max(...c.xLabels.map(len)))
  const valueW = Math.max(...c.series.flatMap(s => s.values.map(v => shortNumber(v).length)))
  const room = Math.max(8, columns - labelW - valueW - 4)
  const max = Math.max(...bars.flatMap(s => s.values), 0)
  const legend: Row[] = c.series.length > 1 ? [c.series.flatMap((s, i) => [{ text: '■ ', color: colorOf(s) }, { text: `${s.name || `${s.kind} ${i + 1}`}   `, color: p.text }])] : []
  const yTitle: Row[] = c.yTitle ? [[{ text: c.yTitle, color: p.muted }]] : []
  const barRows = c.xLabels.flatMap((label, i) =>
    bars.map((s, j) => {
      const v = s.values[i] ?? 0
      const bar = barCells(v, max, room)
      return [
        { text: `${pad(j === 0 ? label : '', labelW)} │`, color: p.muted },
        { text: bar, color: colorOf(s) },
        { text: ' '.repeat(room - len(bar) + 1), color: undefined },
        { text: shortNumber(v).padStart(valueW), color: p.text },
      ]
    }),
  )
  const sparkName = (s: (typeof lines)[number], i: number) => s.name || (lines.length > 1 ? `line ${i + 1}` : 'trend')
  const sparkW = Math.max(labelW, ...lines.map((s, i) => len(sparkName(s, i))))
  const sparkRows = lines.map((s, i) => [
    { text: `${pad(sparkName(s, i), sparkW)}  `, color: p.muted },
    { text: sparkline(s.values), color: colorOf(s) },
    { text: `  ${shortNumber(Math.min(...s.values))} – ${shortNumber(Math.max(...s.values))}`, color: p.muted },
  ])
  const ends: Row[] = lines.length > 0 && bars.length === 0 ? [[{ text: `${' '.repeat(sparkW + 2)}${c.xLabels[0] ?? ''} → ${c.xLabels.at(-1) ?? ''}`, color: p.muted }]] : []
  return [...legend, ...yTitle, ...barRows, ...(barRows.length > 0 && sparkRows.length > 0 ? [[]] : []), ...sparkRows, ...ends]
}

// ── flowchart: each step, then the steps it leads to ──

const shapeColor = (p: Palette, shape: Shape): string =>
  shape === 'diamond' ? p.yellow : shape === 'hex' ? p.purple : shape === 'rect' ? p.blue : p.green

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

type Grid = { ch: string[]; color: (string | undefined)[]; bold: boolean[] }

const seqRows = (s: Sequence, p: Palette, columns: number): Row[] => {
  const names = s.actors.map(a => a.name)
  const colors = hues(p).slice(1).concat(hues(p).slice(0, 1))
  const n = names.length
  const firstHalf = Math.ceil(len(names[0] ?? '') / 2)
  const lastHalf = Math.ceil(len(names.at(-1) ?? '') / 2)
  const hasSelf = s.steps.some(st => st.kind === 'msg' && st.from === st.to)
  const need = Math.max(
    10,
    ...names.slice(1).map((nm, i) => Math.ceil((len(names[i] ?? '') + len(nm)) / 2) + 3),
    ...s.steps.flatMap(st => (st.kind === 'msg' && st.from !== st.to ? [Math.ceil((len(st.text) + 6) / Math.abs(st.to - st.from))] : [])),
  )
  const fits = Math.floor((columns - firstHalf - lastHalf - (hasSelf ? 12 : 1)) / Math.max(1, n - 1))
  const gap = Math.min(need, fits)
  // Too many actors for the width: one line per message instead.
  if (n > 1 && gap < 8) {
    return s.steps.flatMap(st =>
      st.kind === 'msg'
        ? [[{ text: names[st.from] ?? '', color: colors[st.from % colors.length], bold: true }, { text: st.isDashed ? ' ┄▶ ' : ' ─▶ ', color: p.muted }, { text: names[st.to] ?? '', color: colors[st.to % colors.length], bold: true }, { text: `  ${st.text}`, color: p.text }]]
        : [],
    )
  }
  const cols = names.map((_, i) => firstHalf + i * gap)
  const width = (cols.at(-1) ?? 0) + lastHalf + (hasSelf ? 12 : 1)
  const grid = (): Grid => ({ ch: new Array<string>(width).fill(' '), color: new Array<string | undefined>(width).fill(undefined), bold: new Array<boolean>(width).fill(false) })
  const put = (g: Grid, x: number, t: string, color: string, bold = false) =>
    [...t].forEach((c, k) => {
      if (x + k < 0 || x + k >= width) return
      g.ch[x + k] = c
      g.color[x + k] = color
      g.bold[x + k] = bold
    })
  const lined = (): Grid => {
    const g = grid()
    cols.forEach(c => put(g, c, '│', p.muted))
    return g
  }
  const runs = (g: Grid): Row =>
    g.ch.reduce<Row>((row, c, i) => {
      const last = row.at(-1)
      if (last && last.color === g.color[i] && last.bold === g.bold[i]) return [...row.slice(0, -1), { ...last, text: last.text + c }]
      return [...row, { text: c, color: g.color[i], bold: g.bold[i] }]
    }, [])
  const head = grid()
  names.forEach((nm, i) => {
    const t = clip(nm, i === 0 || i === n - 1 ? 24 : gap - 1)
    put(head, (cols[i] ?? 0) - Math.floor(len(t) / 2), t, colors[i % colors.length] ?? p.text, true)
  })
  const rows: Grid[] = [head]
  for (const st of s.steps) {
    if (st.kind === 'msg') {
      const [a, b] = [cols[st.from] ?? 0, cols[st.to] ?? 0]
      if (a === b) {
        const g = lined()
        put(g, a + 1, ` ↺ ${clip(st.text, width - a - 4)}`, p.text)
        rows.push(g)
        continue
      }
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)]
      const label = lined()
      put(label, lo + 2, clip(st.text, hi - lo - 3), p.text)
      const arrow = lined()
      put(arrow, lo + 1, (st.isDashed ? '┄' : '─').repeat(hi - lo - 1), p.muted)
      put(arrow, b > a ? b - 1 : b + 1, st.isCross ? '✕' : b > a ? '▶' : '◀', st.isCross ? p.red : p.text)
      rows.push(label, arrow)
    } else if (st.kind === 'note') {
      const g = lined()
      const [lo, hi] = [Math.min(cols[st.from] ?? 0, cols[st.to] ?? 0), Math.max(cols[st.from] ?? 0, cols[st.to] ?? 0)]
      const t = `[ ${clip(st.text, Math.max(6, width - lo - 6))} ]`
      put(g, Math.max(0, Math.min(width - len(t), Math.round((lo + hi) / 2 - len(t) / 2))), t, p.yellow)
      rows.push(g)
    } else if (st.kind === 'open' || st.kind === 'else') {
      const g = lined()
      const lead = st.kind === 'open' ? '┌ ' : '├┄ '
      put(g, 0, lead, p.muted)
      put(g, len(lead), st.keyword, st.kind === 'open' ? p.accent : p.muted, st.kind === 'open')
      if (st.label) put(g, len(lead) + len(st.keyword), ` ${clip(st.label, width - len(lead) - len(st.keyword) - 1)}`, p.muted)
      rows.push(g)
    } else {
      const g = lined()
      put(g, 0, '└─', p.muted)
      rows.push(g)
    }
  }
  return rows.map(runs)
}

// ── timeline: a period per row, its events after it ──

const timelineRows = (c: Timeline, p: Palette): Row[] => {
  const colors = hues(p)
  const sections = [...new Set(c.periods.map(x => x.section))]
  const labelW = Math.min(16, Math.max(...c.periods.map(x => len(x.label))))
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
  const labelW = Math.min(20, Math.max(...c.tasks.map(t => len(t.name))))
  const room = Math.max(10, columns - labelW - 3)
  const cell = (day: number) => Math.round(((day - first) / span) * room)
  const withYear = span > 300
  const end = dayLabel(last, withYear)
  const axis: Row = [{ text: `${' '.repeat(labelW + 2)}${pad(dayLabel(first, withYear), room - len(end))}${end}`, color: p.muted }]
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
  const grid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x): { ch: string; color?: string } => ({ ch: x === mx && y === my ? '┼' : x === mx ? '│' : y === my ? '─' : ' ', color: p.muted })),
  )
  // Each quarter's name in its top row: 2 1 over 3 4, as Mermaid numbers them.
  const corners: [number, number][] = [
    [mx + 2, 0],
    [1, 0],
    [1, my + 1],
    [mx + 2, my + 1],
  ]
  const put = (x: number, y: number, ch: string, color: string) => {
    const row = grid[y]
    if (row && x >= 0 && x < w) row[x] = { ch, color }
  }
  corners.forEach(([x, y], i) => [...clip(c.names[i] ?? '', mx - 3)].forEach((ch, k) => put(x + k, y, ch, p.muted)))
  c.points.forEach((pt, i) => put(Math.round(pt.x * (w - 1)), Math.round((1 - pt.y) * (h - 1)), MARKS[i % MARKS.length] ?? '•', p.accent))
  const rows: Row[] = grid.map(cells => cells.map(c2 => ({ text: c2.ch, color: c2.color })))
  const axis: Row[] = [
    [{ text: `${pad(c.x[0], mx)}${c.x[1]}`, color: p.muted }],
    [{ text: `↑ ${c.y[1] || 'high'}  ↓ ${c.y[0] || 'low'}`, color: p.muted }],
  ]
  const legend: Row[] = c.points.map((pt, i) => [{ text: `${MARKS[i % MARKS.length]} `, color: p.accent, bold: true }, { text: pt.label, color: p.text }, { text: `  ${pt.x}, ${pt.y}`, color: p.muted }])
  return [...rows, ...axis, [], ...legend]
}

// A chart's title line, then its rows.
export const chartTitle = (c: Chart): string =>
  c.kind === 'flow' ? (c.name ?? 'flowchart') : c.kind === 'sequence' ? 'sequence' : c.title || c.kind

export const chartRows = (c: Chart, p: Palette, columns: number): Row[] => {
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
