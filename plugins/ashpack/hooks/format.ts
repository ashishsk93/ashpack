import type { GitInfo, PackMod, RateWindow, Section, StatusData } from '../types'

// Pure helpers, kept apart from the hooks so the tests can call them directly.

const MODES: Record<string, string> = {
  auto: '⏵⏵ auto',
  plan: '⏸ plan',
  acceptEdits: '⏵⏵ accept edits',
  bypassPermissions: '⚠ bypass',
  dontAsk: "don't ask",
  default: '',
}

const WINDOWS: Record<string, string> = { five_hour: 'session', seven_day: 'week' }

const EFFORT: Record<string, string> = { low: '◔', medium: '◑', high: '◕', xhigh: '●', max: '●' }

// Mid-tones that read on a light and a dark background alike (3.5:1 or more on the
// desktop app's off-white, 3.9:1 or more on #1e1e1e): a mod cannot tell which it is drawn on.
export const COLORS = { ok: '#1a9450', warn: '#a87700', hot: '#e5484d', accent: '#8b5cf6', blue: '#2f7bf0', muted: '#8a8a8a' } as const

// "claude-opus-5-5[1m]" -> "Opus 5.5 1M"; "opus[1m]" -> "Opus 1M"
export const prettyModel = (id: string): string => {
  const ctx = /\[(\w+)\]/.exec(id)?.[1]?.toUpperCase()
  const base = id.replace(/\[.*\]/, '').replace(/^claude-/, '').replace(/-\d{8}$/, '')
  const [family = base, ...rest] = base.split('-')
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  const version = rest.length > 0 ? ` ${rest.join('.')}` : ''
  return `${name}${version}${ctx ? ` ${ctx}` : ''}`
}

// ms -> "3d4h", "2h14m", "9m"
export const shortDuration = (ms: number): string => {
  const mins = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

// five_hour -> session, seven_day -> week, seven_day_fable -> fable
export const windowLabel = (kind: string): string =>
  WINDOWS[kind] ?? kind.replace(/^seven_day_/, '').replace(/_/g, ' ')

export const modeLabel = (mode: string): string => MODES[mode] ?? mode

export const effortLabel = (level: string): string => `${EFFORT[level] ?? '○'} ${level}`

export const levelColor = (percent: number): string =>
  percent >= 85 ? COLORS.hot : percent >= 60 ? COLORS.warn : COLORS.ok

// A segment bar: lit blocks, then empty ones. 42% over 8 cells -> ["▰▰▰", "▱▱▱▱▱"].
export const bar = (percent: number, width: number): [string, string] => {
  const lit = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return ['▰'.repeat(lit), '▱'.repeat(width - lit)]
}

export const money = (usd: number): string => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

// `git status --porcelain=v2 --branch` -> branch, changed files, ahead/behind.
export const parseGit = (porcelain: string): GitInfo | null => {
  const lines = porcelain.split('\n').filter(Boolean)
  const head = lines.find(l => l.startsWith('# branch.head '))?.slice(14)
  if (!head) return null
  const ab = /^# branch\.ab \+(\d+) -(\d+)/m.exec(porcelain)
  return {
    branch: head === '(detached)' ? 'detached' : head,
    dirty: lines.filter(l => !l.startsWith('#')).length,
    ahead: Number(ab?.[1] ?? 0),
    behind: Number(ab?.[2] ?? 0),
  }
}

// ── the status chips: one row of outlined pills ──

export type TextSpan = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type BarSpan = { bar: number; width: number } // a segment bar: percent over `width` segments
export type Span = TextSpan | BarSpan
export type Cell = Span[]

export const isBar = (sp: Span): sp is BarSpan => 'bar' in sp

// A bar as text, for the terminal and the tests: lit segments, then empty ones.
export const barSpans = (sp: BarSpan): TextSpan[] => {
  const [lit, track] = bar(sp.bar, sp.width)
  return [{ text: lit, color: levelColor(sp.bar) }, { text: track, dim: true }]
}

const meter = (label: string, percent: number, width: number): Cell => [
  { text: `${label} `, dim: true },
  { bar: percent, width },
  { text: ` ${Math.round(percent)}%`, color: levelColor(percent) },
]

const SEG_W = 7
const SEG_GAP = 3
const SEG_H = 7

// The desktop's bar: the segments as an image, so they line up whatever the font does.
export const barSvg = (percent: number, width: number): string => {
  const lit = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  const color = levelColor(percent)
  const w = width * (SEG_W + SEG_GAP) - SEG_GAP
  const rects = Array.from({ length: width }, (_, i) => `<rect x="${i * (SEG_W + SEG_GAP)}" width="${SEG_W}" height="${SEG_H}" rx="1.5" fill="${color}" opacity="${i < lit ? 1 : 0.25}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${SEG_H}" width="${w}" height="${SEG_H}">${rects}</svg>`
}

export const barPx = (width: number): number => width * (SEG_W + SEG_GAP) - SEG_GAP

const resetIn = (r: RateWindow, now: number): Span[] => {
  const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  return Number.isNaN(at) ? [] : [{ text: ` ↻${shortDuration(at - now)}`, dim: true }]
}

// Chips, in order: model · effort | ⎇ branch ●n ↑n ↓n | ctx | session ↻ | week (+ per-model) ↻ | folder · $cost · time
// `accent` colors the model: the skin's accent when one is on, else AshPack's own. With
// `hasModel` false the model chip is left out (the desktop app names the model and effort
// in its own footer).
export const statusChips = (d: StatusData, now: number, barWidth: number, accent: string, hasModel = true): Cell[] => {
  const session = d.rateLimits.find(r => r.kind === 'five_hour')
  const weekly = d.rateLimits.filter(r => r.kind !== 'five_hour')
  const resets = new Set(weekly.map(r => r.resetsAt))
  const git: Cell = d.git
    ? [
        { text: `⎇ ${d.git.branch}`, color: COLORS.ok },
        ...(d.git.dirty > 0 ? [{ text: ` ●${d.git.dirty}`, color: COLORS.warn }] : []),
        ...(d.git.ahead > 0 ? [{ text: ` ↑${d.git.ahead}`, color: COLORS.blue }] : []),
        ...(d.git.behind > 0 ? [{ text: ` ↓${d.git.behind}`, color: COLORS.hot }] : []),
      ]
    : [{ text: '⎇ no repo', dim: true }]
  const spend: Cell = [
    { text: d.folder },
    { text: `${d.costUsd !== undefined ? ` · ${money(d.costUsd)}` : ''} · ${shortDuration(now - d.startedAt)}`, dim: true },
  ]
  // Weekly windows usually share one reset: say it once, at the end.
  const lastWeekly = weekly.at(-1)
  const weeklyCell: Cell = weekly.flatMap((r, i) => [
    ...(i > 0 ? [{ text: '  ' }] : []),
    ...meter(windowLabel(r.kind), r.percentUsed, barWidth),
    ...(resets.size > 1 ? resetIn(r, now) : []),
  ])
  const model: Cell = [{ text: `◆ ${prettyModel(d.model)}`, color: accent, bold: true }, ...(d.effort ? [{ text: ` · ${effortLabel(d.effort)}`, color: COLORS.blue }] : [])]
  return [
    ...(hasModel ? [model] : []),
    git,
    meter('ctx', d.contextPercent ?? 0, barWidth),
    session ? [...meter('session', session.percentUsed, barWidth), ...resetIn(session, now)] : [{ text: 'session —', dim: true }],
    weekly.length > 0 ? [...weeklyCell, ...(resets.size === 1 && lastWeekly ? resetIn(lastWeekly, now) : [])] : [{ text: 'week —', dim: true }],
    spend,
  ]
}

export const chipBarWidth = (total: number): number => (total >= 160 ? 8 : total >= 120 ? 6 : 4)

// ── the loader: a row of bars that rise and fall in turn, a wave moving right ──

const LEVELS = '▁▂▃▄▅▆▇█'

// The terminal's loader at `frame`: `width` cells, each a bar of the wave.
export const wave = (frame: number, width: number): string =>
  Array.from({ length: width }, (_, i) => LEVELS[Math.round(((Math.sin(i * 0.8 - frame * 0.45) + 1) / 2) * 7)]).join('')

const BAR_PX = 4
const BAR_GAP_PX = 3
const WAVE_H = 12 // px
const WAVE_S = 0.9

// The desktop's loader: the same picture as an SVG that animates itself (SMIL), each bar
// a beat behind the one before. The markup never changes, so a redraw does not restart it.
export const waveSvg = (color: string, width: number): string => {
  const bars = Math.max(3, Math.floor((width + BAR_GAP_PX) / (BAR_PX + BAR_GAP_PX)))
  const w = bars * (BAR_PX + BAR_GAP_PX) - BAR_GAP_PX
  const low = WAVE_H / 4
  const rects = Array.from({ length: bars }, (_, i) => {
    const begin = `begin="${(-i * 0.1).toFixed(1)}s"`
    return (
      `<rect x="${i * (BAR_PX + BAR_GAP_PX)}" width="${BAR_PX}" rx="${BAR_PX / 2}" fill="${color}">` +
      `<animate attributeName="height" values="${low};${WAVE_H};${low}" dur="${WAVE_S}s" ${begin} repeatCount="indefinite"/>` +
      `<animate attributeName="y" values="${(WAVE_H - low) / 2};0;${(WAVE_H - low) / 2}" dur="${WAVE_S}s" ${begin} repeatCount="indefinite"/>` +
      `</rect>`
    )
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${WAVE_H}" width="${w}" height="${WAVE_H}">${rects}</svg>`
}

// The working popup takes half the band, but no less than a readable 48 columns.
export const popupWidth = (columns: number): number => Math.min(columns, Math.max(48, Math.ceil(columns / 2)))

// ── the working popup: sections ──

// Finished steps the popup keeps before the running one.
export const TRAIL = 3

export type Segment = { title: string; state: 'done' | 'now' | 'todo' }

// The popup's sections: the model's task list when it keeps one; else the turn's
// latest finished steps, then the running one.
export const segments = (plan: readonly Section[], label: string, trail: readonly string[]): Segment[] => {
  if (plan.length === 0) {
    return [...trail.slice(-TRAIL).map(title => ({ title, state: 'done' }) as const), { title: label, state: 'now' }]
  }
  const running = plan.findIndex(s => s.status === 'in_progress')
  const at = running >= 0 ? running : plan.findIndex(s => s.status === 'pending')
  return plan.map((s, i) => ({ title: s.title, state: s.status === 'completed' ? 'done' : i === at ? 'now' : 'todo' }))
}

// At most `n` sections, the running one kept in view (the last ones once all are done).
export const around = (segs: readonly Segment[], n: number): Segment[] => {
  const now = segs.findIndex(s => s.state === 'now')
  const at = now >= 0 ? now : segs.length - 1
  const start = Math.max(0, Math.min(at - Math.floor(n / 2), segs.length - n))
  return segs.slice(start, start + n)
}

const STATUSES = new Set<string>(['pending', 'in_progress', 'completed'])
const asStatus = (v: unknown): Section['status'] | undefined =>
  typeof v === 'string' && STATUSES.has(v) ? (v as Section['status']) : undefined

export const planFromTodos = (todos: readonly { content: string; status: string }[]): Section[] =>
  todos.map((t, i) => ({ id: String(i), title: t.content, status: asStatus(t.status) ?? 'pending' }))

export const addTask = (plan: readonly Section[], id: string, title: string): Section[] => [
  ...plan,
  { id, title, status: 'pending' },
]

export const updateTask = (plan: readonly Section[], u: { taskId: string; subject?: string; status?: string }): Section[] =>
  u.status === 'deleted'
    ? plan.filter(s => s.id !== u.taskId)
    : plan.map(s => (s.id === u.taskId ? { ...s, title: u.subject ?? s.title, status: asStatus(u.status) ?? s.status } : s))

// The pack's mods (its marketplace's plugins), each installed and on, installed and off, or not installed.
export const packMods = (
  catalogJson: string,
  installedJson: string,
  enabled: Readonly<Record<string, unknown>>,
  market: string,
): PackMod[] => {
  const catalog = JSON.parse(catalogJson) as { plugins?: { name?: unknown }[] }
  const installed = (JSON.parse(installedJson) as { plugins?: Record<string, unknown[]> }).plugins ?? {}
  return (catalog.plugins ?? []).flatMap(p => {
    if (typeof p.name !== 'string') return []
    const id = `${p.name}@${market}`
    return [{ name: p.name, state: !installed[id]?.length ? 'missing' : enabled[id] === true ? 'on' : 'off' } as const]
  })
}

// A short line for what a tool call is doing.
export const describeTool = (tool: string, input: unknown): string => {
  const i = (input ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const base = (p: string) => p.split('/').pop() ?? p
  const clip = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s)
  switch (tool) {
    case 'Bash':
      return `Running ${clip(str('description') || str('command'))}`
    case 'Read':
      return `Reading ${base(str('file_path'))}`
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `Editing ${base(str('file_path') || str('notebook_path'))}`
    case 'Grep':
    case 'Glob':
      return `Searching ${clip(str('pattern'))}`
    case 'Skill':
      return `Running /${clip(str('skill'))}`
    case 'Agent':
    case 'Task':
      return `Delegating ${clip(str('description'))}`
    case 'WebFetch':
    case 'WebSearch':
      return 'Browsing the web'
    default:
      return `Using ${tool.replace(/^mcp__/, '').replace(/__/g, ' ')}`
  }
}

// ── the drawer's pages ──
// A mod gives itself a page in the drawer by hooking the drawer's pane and adding a
// Box keyed `ashpack-page:<Label>` to the tree `next(e)` hands it (see the README).

export const PAGE_PREFIX = 'ashpack-page:'
export const BUILT_IN_PAGES = ['home', 'mods'] as const

export type Page = { id: string; label: string; tree: unknown }

const pagesIn = (node: unknown): Page[] => {
  if (typeof node !== 'object' || node === null) return []
  const { props, children } = node as { props?: { key?: unknown }; children?: unknown[] }
  const key = props?.key
  if (typeof key === 'string' && key.startsWith(PAGE_PREFIX)) {
    const label = key.slice(PAGE_PREFIX.length).trim()
    return label ? [{ id: label.toLowerCase(), label, tree: node }] : []
  }
  return Array.isArray(children) ? children.flatMap(pagesIn) : []
}

// The pages in a drawn tree, in order; one per id, the drawer's own ids left to it.
export const findPages = (tree: unknown): Page[] =>
  pagesIn(tree).filter((p, i, all) => all.findIndex(q => q.id === p.id) === i && !(BUILT_IN_PAGES as readonly string[]).includes(p.id))
