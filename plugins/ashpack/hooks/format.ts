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

export const COLORS = { ok: '#c3e88d', warn: '#ffcb6b', hot: '#f07178', accent: '#c792ea', blue: '#82aaff' } as const

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

// A filled bar: 42% over 8 cells -> "▰▰▰▱▱▱▱▱"
export const bar = (percent: number, width: number): string => {
  const lit = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return '▰'.repeat(lit) + '▱'.repeat(width - lit)
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

// The tab `delta` steps from `current`, wrapping at either end.
export const stepTab = (names: readonly string[], current: string, delta: number): string => {
  const at = Math.max(0, names.indexOf(current))
  return names[(at + delta + names.length) % names.length] ?? current
}

// ── the status grid: 2 rows x 3 sections, as styled spans ──

export type Span = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type Cell = Span[]

const meter = (label: string, percent: number, width: number): Cell => [
  { text: `${label} `, dim: true },
  { text: `${bar(percent, width)} ${Math.round(percent)}%`, color: levelColor(percent) },
]

const resetIn = (r: RateWindow, now: number): Span[] => {
  const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  return Number.isNaN(at) ? [] : [{ text: ` ↻${shortDuration(at - now)}`, dim: true }]
}

// Columns:   who            where                spend
// row 1:     model effort   ⎇ branch ●n ↑n ↓n    folder · $cost · time
// row 2:     ctx bar        session bar ↻reset   week bar + per-model bars ↻reset
export const statusGrid = (d: StatusData, now: number, barWidth: number): Cell[][] => {
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
  const weeklyCell: Cell = weekly.flatMap((r, i) => [
    ...(i > 0 ? [{ text: '  ' }] : []),
    ...meter(windowLabel(r.kind), r.percentUsed, barWidth),
    ...(resets.size > 1 ? resetIn(r, now) : []),
  ])
  const lastWeekly = weekly.at(-1)
  return [
    [
      [{ text: `◆ ${prettyModel(d.model)}`, color: COLORS.accent, bold: true }, ...(d.effort ? [{ text: ` ${effortLabel(d.effort)}`, color: COLORS.blue }] : [])],
      git,
      spend,
    ],
    [
      meter('ctx', d.contextPercent ?? 0, barWidth),
      session ? [...meter('session', session.percentUsed, barWidth), ...resetIn(session, now)] : [{ text: 'session —', dim: true }],
      weekly.length > 0 ? [...weeklyCell, ...(resets.size === 1 && lastWeekly ? resetIn(lastWeekly, now) : [])] : [{ text: 'week —', dim: true }],
    ],
  ]
}

const cellWidth = (cell: Cell): number => cell.reduce((n, sp) => n + [...sp.text].length, 0)

// Each section as wide as its widest cell, plus the separator ("│ ") and `gap`: no wider.
export const gridWidths = (grid: Cell[][], gap: number): number[] =>
  (grid[0] ?? []).map((_, c) => Math.max(...grid.map(row => cellWidth(row[c] ?? []))) + gap + (c > 0 ? 2 : 0))

export const gridBarWidth = (total: number): number => (total >= 140 ? 8 : total >= 100 ? 6 : 4)

// ── the loader: a dotted track crossed left to right by a block with a fading trail ──

const SPRITE = '░▒▓██'

// The terminal's loader at `frame`: `width` cells, `·` wherever the block is not.
export const scanner = (frame: number, width: number): string => {
  const at = (frame % (width + SPRITE.length)) - SPRITE.length + 1 // the sprite's first cell
  return Array.from({ length: width }, (_, i) => SPRITE[i - at] ?? '·').join('')
}

const DOT = 4 // px between the desktop loader's dots
const STEP_S = 0.07

// The desktop's loader: the same picture as an SVG that animates itself (SMIL), a
// grid of dots 5 high and `cols` wide, the block stepping one dot at a time.
// The markup never changes, so a redraw does not restart it.
export const scannerSvg = (color: string, cols: number): string => {
  const w = cols * DOT
  const h = 5 * DOT
  const steps = Array.from({ length: cols + 7 }, (_, i) => `${(i - 3) * DOT} 0`)
  const trail = [0.85, 0.55, 0.3]
    .map((o, k) => `<rect x="${-(k + 1) * DOT}" width="${DOT * 0.7}" height="${h}" fill="url(#d)" opacity="${o}"/>`)
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">` +
    `<defs><pattern id="g" width="${DOT}" height="${DOT}" patternUnits="userSpaceOnUse"><rect x="${DOT / 2 - 0.5}" y="${DOT / 2 - 0.5}" width="1" height="1" fill="${color}" opacity="0.8"/></pattern>` +
    `<pattern id="d" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${color}"/><rect x="1" y="1" width="1" height="1" fill="${color}"/></pattern></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<g><animateTransform attributeName="transform" type="translate" calcMode="discrete" values="${steps.join(';')}" dur="${(steps.length * STEP_S).toFixed(2)}s" repeatCount="indefinite"/>` +
    `${trail}<rect width="${DOT * 3 - 1}" height="${h}" fill="${color}"/></g></svg>`
  )
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

// A mod that wraps the mods beneath it returns their badges inside its own tree.
// `without` drops every child that deep-equals `inner`, so its tab keeps only its own part.
export const without = (tree: unknown, inner: unknown): unknown => {
  const key = JSON.stringify(inner)
  const strip = (node: unknown): unknown => {
    const children = (node as { children?: unknown })?.children
    if (!Array.isArray(children)) return node
    return { ...(node as object), children: children.filter(c => JSON.stringify(c) !== key).map(strip) }
  }
  return strip(tree)
}

// A tab's name: the pack's own mods drop the pack's prefix (`ashpack-skins` -> `skins`).
export const tabLabel = (plugin: string, pack: string): string => plugin.replace(new RegExp(`^${pack}-`), '')
