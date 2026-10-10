import type { Card } from './cards'
import { CHAR, PAD, panel, text } from './cards'
import { cells, clip, dayLabel, fitted, ganttColor, hues, small, SMALL_CHAR, wrapWords } from './chart-kit'
import type { Gantt, Quadrant, Timeline } from './mermaid-more'
import type { Palette } from './skins'

// Cards for the timeline, Gantt and quadrant charts, like the others: an outline, a
// header, the drawing under it, in the skin's colours.

// ── timeline: a line across, a dot per period, its events under it ──

export const timelineSvg = (c: Timeline, p: Palette, width: number, alt: string): Card | null => {
  const colors = hues(p)
  const col = 150
  const chars = Math.floor((col - 16) / SMALL_CHAR)
  const sections = [...new Set(c.periods.map(x => x.section))]
  const hasSections = sections.some(Boolean)
  const top = hasSections ? 26 : 8
  const lineY = top + 34
  const w = PAD * 2 + c.periods.length * col
  const events = c.periods.map(x => x.events.flatMap(ev => wrapWords(ev, chars - 2).map((l, i) => (i === 0 ? `• ${l}` : `  ${l}`))))
  const h = lineY + 22 + Math.max(1, ...events.map(e => e.length)) * 15 + 8
  const drawn = c.periods.map((x, i) => {
    const cx = PAD + i * col + col / 2
    const color = colors[(hasSections ? sections.indexOf(x.section) : i) % colors.length] ?? p.accent
    const head = hasSections && c.periods[i - 1]?.section !== x.section ? small(PAD + i * col + 4, 14, x.section, p.muted, ' font-weight="600"') : ''
    return (
      head +
      text(cx, lineY - 14, clip(x.label, Math.floor((col - 8) / CHAR)), color, ' text-anchor="middle" font-weight="600"') +
      `<circle cx="${cx}" cy="${lineY}" r="5" fill="${color}"/>` +
      (events[i] ?? []).map((line, j) => small(PAD + i * col + 8, lineY + 26 + j * 15, line, p.text)).join('')
    )
  })
  const axis = `<line x1="${PAD}" y1="${lineY}" x2="${w - PAD}" y2="${lineY}" stroke="${p.muted}" stroke-opacity=".6"/>`
  const fit = fitted(axis + drawn.join(''), w, h, width)
  return fit && panel(p, width, c.title || 'timeline', [`${c.periods.length} periods`, p.muted], fit.body, fit.height, alt)
}

// ── Gantt: a row per task, its bar on a calendar ──

const TICK_DAYS = [1, 2, 7, 14, 30, 60, 91, 182, 365]
const ROW = 22

export const ganttSvg = (c: Gantt, p: Palette, width: number, alt: string): Card => {
  const first = Math.min(...c.tasks.map(t => t.start))
  const last = Math.max(...c.tasks.map(t => t.end))
  const span = Math.max(1, last - first)
  const sections = [...new Set(c.tasks.map(t => t.section))]
  const hasSections = sections.some(Boolean)
  const labelW = Math.min(26, Math.max(...c.tasks.map(t => cells(t.name)))) * SMALL_CHAR + 12
  const [x0, x1] = [PAD + labelW, width - PAD]
  const x = (day: number) => x0 + ((day - first) / span) * (x1 - x0)
  const step = TICK_DAYS.find(d => span / d <= 8) ?? 365
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => first + i * step)
  const withYear = span > 300
  // Rows: a section's name where one starts, then its tasks.
  const rows = c.tasks.flatMap((t, i) => [...(hasSections && c.tasks[i - 1]?.section !== t.section ? [{ section: t.section }] : []), { task: t }])
  const axisH = 26
  const grid = ticks
    .map(d => `<line x1="${x(d)}" y1="${axisH - 6}" x2="${x(d)}" y2="${axisH + rows.length * ROW}" stroke="${p.muted}" stroke-opacity=".18"/>` + small(x(d), 14, dayLabel(d, withYear), p.muted, ' text-anchor="middle"'))
    .join('')
  const drawn = rows.map((r, i) => {
    const y = axisH + i * ROW
    if ('section' in r) return small(PAD, y + 15, r.section ?? '', p.muted, ' font-weight="600"')
    const t = r.task
    const color = ganttColor(p, t.tags, sections.indexOf(t.section))
    const label = small(PAD, y + 15, clip(t.name, Math.round((labelW - 12) / SMALL_CHAR)), p.text)
    if (t.tags.includes('milestone')) {
      const cx = x(t.start)
      return label + `<polygon points="${cx},${y + 4} ${cx + 7},${y + 11} ${cx},${y + 18} ${cx - 7},${y + 11}" fill="${color}"/>`
    }
    const bw = Math.max(3, x(t.end) - x(t.start))
    return label + `<rect x="${x(t.start).toFixed(1)}" y="${y + 4}" width="${bw.toFixed(1)}" height="14" rx="3" fill="${color}" fill-opacity="${t.tags.includes('done') ? 0.45 : 0.85}"/>`
  })
  const height = axisH + rows.length * ROW + 10
  return panel(p, width, c.title || 'gantt', [`${dayLabel(first, withYear)} → ${dayLabel(last, withYear)}`, p.muted], grid + drawn.join(''), height, alt)
}

// ── quadrant: a square split four ways, each point placed by its two scores ──

export const quadrantSvg = (c: Quadrant, p: Palette, width: number, alt: string): Card => {
  const colors = hues(p)
  const size = Math.min(320, width - PAD * 2 - 140)
  const [x0, y0] = [Math.max(PAD + 28, (width - size) / 2), 10]
  const half = size / 2
  // Mermaid numbers them from the top right, going round to the left: 1 2 / 3 4 is 2 1 / 3 4.
  const at: [number, number][] = [
    [x0 + half, y0],
    [x0, y0],
    [x0, y0 + half],
    [x0 + half, y0 + half],
  ]
  const quarters = at
    .map(([qx, qy], i) => `<rect x="${qx}" y="${qy}" width="${half}" height="${half}" fill="${colors[i % colors.length]}" fill-opacity=".07" stroke="${p.muted}" stroke-opacity=".35"/>` + small(qx + half / 2, qy + 16, clip(c.names[i] ?? '', Math.floor((half - 8) / SMALL_CHAR)), p.muted, ' text-anchor="middle" font-weight="600"'))
    .join('')
  const axes =
    small(x0, y0 + size + 16, c.x[0], p.muted) +
    small(x0 + size, y0 + size + 16, c.x[1], p.muted, ' text-anchor="end"') +
    small(x0 - 8, y0 + size, c.y[0], p.muted, ` text-anchor="start" transform="rotate(-90 ${x0 - 8} ${y0 + size})"`) +
    small(x0 - 8, y0, c.y[1], p.muted, ` text-anchor="end" transform="rotate(-90 ${x0 - 8} ${y0})"`)
  const points = c.points
    .map(pt => {
      const [px, py] = [x0 + pt.x * size, y0 + (1 - pt.y) * size]
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${p.accent}"/>` + small(px + 9, py + 4, pt.label, p.text)
    })
    .join('')
  return panel(p, width, c.title || 'quadrant', [`${c.points.length} points`, p.muted], quarters + axes + points, size + y0 + 28, alt)
}
