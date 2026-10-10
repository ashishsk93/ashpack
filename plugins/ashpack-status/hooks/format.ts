import type { Call, CallKind, ChipId, GitInfo, PullRequest, RateWindow, RepoInfo, Section, StatusData } from '../types'

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

// The colours the chips and the popup draw in: AshPack's own, or the active skin's.
export type Colors = { [K in keyof typeof COLORS]: string }

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

export const levelColor = (percent: number, c: Colors = COLORS): string =>
  percent >= 85 ? c.hot : percent >= 60 ? c.warn : c.ok

// A segment bar: lit blocks, then empty ones. 42% over 8 cells -> ["▰▰▰", "▱▱▱▱▱"].
export const bar = (percent: number, width: number): [string, string] => {
  const lit = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return ['▰'.repeat(lit), '▱'.repeat(width - lit)]
}

export const money = (usd: number): string => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

// `git status --porcelain=v2 --branch` -> branch, changed files, ahead/behind. A path's
// two status letters say staged (first) and changed in the tree (second); `u` is a
// conflict, `?` a new file.
export const parseGit = (porcelain: string): GitInfo | null => {
  const lines = porcelain.split('\n').filter(Boolean)
  const head = lines.find(l => l.startsWith('# branch.head '))?.slice(14)
  if (!head) return null
  const ab = /^# branch\.ab \+(\d+) -(\d+)/m.exec(porcelain)
  const paths = lines.filter(l => /^[12] /.test(l))
  return {
    branch: head === '(detached)' ? 'detached' : head,
    dirty: lines.filter(l => !l.startsWith('#')).length,
    ahead: Number(ab?.[1] ?? 0),
    behind: Number(ab?.[2] ?? 0),
    staged: paths.filter(l => l[2] !== '.').length,
    changed: paths.filter(l => l[3] !== '.').length,
    untracked: lines.filter(l => l.startsWith('? ')).length,
    conflicts: lines.filter(l => l.startsWith('u ')).length,
  }
}

// ── the repo chips' data: pure readers of what git and gh print ──

// `git diff --shortstat HEAD` -> lines added and removed; nothing printed is a clean tree.
export const parseShortstat = (out: string): { added: number; removed: number } => ({
  added: Number(/(\d+) insertion/.exec(out)?.[1] ?? 0),
  removed: Number(/(\d+) deletion/.exec(out)?.[1] ?? 0),
})

// `git log -1 --format=%ct%x1f%s` -> when HEAD was committed and its subject.
// The subject loses control bytes: a commit message is the repo's text, drawn as is.
export const parseCommit = (out: string): { at: number; subject: string } | null => {
  const [secs, subject = ''] = out.trim().split('\x1f')
  const at = Number(secs) * 1000
  return secs && Number.isFinite(at) ? { at, subject: subject.replace(/[\x00-\x1f\x7f]/g, '') } : null
}

// The operation under way, from the names in the git directory.
const OPERATIONS: readonly [string, string][] = [
  ['rebase-merge', 'rebasing'],
  ['rebase-apply', 'rebasing'],
  ['MERGE_HEAD', 'merging'],
  ['CHERRY_PICK_HEAD', 'cherry-picking'],
  ['REVERT_HEAD', 'reverting'],
  ['BISECT_LOG', 'bisecting'],
]
export const operationOf = (names: readonly string[]): string | undefined => OPERATIONS.find(([file]) => names.includes(file))?.[1]

const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

// `gh pr view --json number,state,isDraft,reviewDecision,statusCheckRollup` -> the PR and
// its checks: a check run by its conclusion once completed, a status by its state.
export const parsePr = (json: string): PullRequest | null => {
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    if (typeof o.number !== 'number') return null
    const rollup = Array.isArray(o.statusCheckRollup) ? (o.statusCheckRollup as Record<string, unknown>[]) : []
    const verdicts = rollup.map(c => String(c.conclusion || c.state || '').toUpperCase())
    const isDone = (c: Record<string, unknown>) => c.status === undefined || c.status === 'COMPLETED'
    return {
      number: o.number,
      state: String(o.state ?? 'OPEN'),
      isDraft: o.isDraft === true,
      review: typeof o.reviewDecision === 'string' ? o.reviewDecision : '',
      checks: {
        passed: rollup.filter((c, i) => isDone(c) && PASSED.has(verdicts[i] ?? '')).length,
        failed: rollup.filter((c, i) => isDone(c) && FAILED.has(verdicts[i] ?? '')).length,
        pending: rollup.filter((c, i) => !isDone(c) || !(PASSED.has(verdicts[i] ?? '') || FAILED.has(verdicts[i] ?? ''))).length,
      },
    }
  } catch {
    return null
  }
}

// ── the status chips: one row of outlined pills ──

export type TextSpan = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type BarSpan = { bar: number; width: number; color: string } // a segment bar: percent over `width` segments
export type Span = TextSpan | BarSpan
export type Cell = Span[]

export const isBar = (sp: Span): sp is BarSpan => 'bar' in sp

// A bar as text, for the terminal and the tests: lit segments, then empty ones.
export const barSpans = (sp: BarSpan): TextSpan[] => {
  const [lit, track] = bar(sp.bar, sp.width)
  return [{ text: lit, color: sp.color }, { text: track, dim: true }]
}

const meter = (label: string, percent: number, width: number, c: Colors): Cell => [
  { text: `${label} `, dim: true },
  { bar: percent, width, color: levelColor(percent, c) },
  { text: ` ${Math.round(percent)}%`, color: levelColor(percent, c) },
]

const SEG_W = 7
const SEG_GAP = 3
const SEG_H = 7

// The desktop's bar: the segments as an image, so they line up whatever the font does.
export const barSvg = (percent: number, width: number, color = levelColor(percent)): string => {
  const lit = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  const w = width * (SEG_W + SEG_GAP) - SEG_GAP
  const rects = Array.from({ length: width }, (_, i) => `<rect x="${i * (SEG_W + SEG_GAP)}" width="${SEG_W}" height="${SEG_H}" rx="1.5" fill="${color}" opacity="${i < lit ? 1 : 0.25}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${SEG_H}" width="${w}" height="${SEG_H}">${rects}</svg>`
}

export const barPx = (width: number): number => width * (SEG_W + SEG_GAP) - SEG_GAP

const resetIn = (r: RateWindow, now: number): Span[] => {
  const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  return Number.isNaN(at) ? [] : [{ text: ` ↻${shortDuration(at - now)}`, dim: true }]
}

// The chips the Status page lists, in their order, with a sample of what each shows.
// `isExtra` chips start off: the repo's state, for those who want more of it.
export const CHIPS: readonly { id: ChipId; label: string; sample: string; isExtra?: boolean }[] = [
  { id: 'model', label: 'Model and effort', sample: '◆ Opus 5.5 · ◕ high' },
  { id: 'branch', label: 'Branch', sample: '⎇ main ●2 ↑1' },
  { id: 'context', label: 'Context', sample: 'ctx 42%' },
  { id: 'session', label: 'Session limit', sample: 'session 23% ↻2h14m' },
  { id: 'week', label: 'Weekly limits', sample: 'week 41%' },
  { id: 'spend', label: 'Folder, cost and time', sample: 'ashpack · $1.24 · 23m' },
  { id: 'tree', label: 'Working tree', sample: 'rebasing · 2 staged · 3 changed · 1 new · 1 stash', isExtra: true },
  { id: 'lines', label: 'Lines changed', sample: 'diff +120 −34', isExtra: true },
  { id: 'commit', label: 'Last commit', sample: 'commit 2h ago · fix: login redirect', isExtra: true },
  { id: 'pr', label: 'Pull request and checks', sample: 'PR #12 ✓ 5 checks · approved', isExtra: true },
]

export const CHIP_IDS: readonly ChipId[] = CHIPS.map(c => c.id)
const EXTRA_IDS: readonly ChipId[] = CHIPS.filter(c => c.isExtra).map(c => c.id)

// The hidden chips at the start of a session: the stored pick, plus every extra chip the
// stored order has not listed yet (new to this person, so it starts off).
export const hiddenChipsOf = (storedHidden: unknown, storedOrder: unknown): ChipId[] => {
  const seen: unknown[] = Array.isArray(storedOrder) ? storedOrder : []
  const hidden = chipIds(storedHidden)
  return CHIP_IDS.filter(id => hidden.includes(id) || (EXTRA_IDS.includes(id) && !seen.includes(id)))
}

// A stored list of hidden chips, kept to the ids above: $.store may hold anything.
export const chipIds = (stored: unknown): ChipId[] => (Array.isArray(stored) ? CHIP_IDS.filter(id => stored.includes(id)) : [])

// A stored order, kept to known chips in their stored place; any it lacks (one added in a
// later version) go at the end.
export const chipOrder = (stored: unknown): ChipId[] => {
  const known = Array.isArray(stored) ? stored.filter((id, i): id is ChipId => CHIP_IDS.includes(id) && stored.indexOf(id) === i) : []
  return [...known, ...CHIP_IDS.filter(id => !known.includes(id))]
}

// `id` swapped with its neighbour among `listed` (the rows a page shows): `by` -1 up, 1 down.
// At either end, or not listed, the order stays.
export const moveChip = (order: readonly ChipId[], id: ChipId, by: -1 | 1, listed: readonly ChipId[]): ChipId[] => {
  const rows = order.filter(x => listed.includes(x))
  const i = rows.indexOf(id)
  const other = i < 0 ? undefined : rows[i + by]
  return other ? order.map(x => (x === id ? other : x === other ? id : x)) : [...order]
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

// The working tree: an operation under way first, then what is staged, changed, new, in conflict, stashed.
const treeCell = (git: GitInfo | null, repo: RepoInfo, c: Colors): Cell => {
  if (!git) return [{ text: 'no repo', dim: true }]
  const parts: TextSpan[] = [
    ...(git.staged > 0 ? [{ text: `${git.staged} staged`, color: c.ok }] : []),
    ...(git.changed > 0 ? [{ text: `${git.changed} changed`, color: c.warn }] : []),
    ...(git.untracked > 0 ? [{ text: `${git.untracked} new`, color: c.blue }] : []),
    ...(git.conflicts > 0 ? [{ text: plural(git.conflicts, 'conflict'), color: c.hot, bold: true }] : []),
    ...(repo.stashes ? [{ text: plural(repo.stashes, 'stash', 'stashes'), dim: true }] : []),
  ]
  const op: TextSpan[] = repo.operation ? [{ text: repo.operation, color: c.hot, bold: true }] : []
  const all = [...op, ...(parts.length > 0 || op.length > 0 ? parts : [{ text: 'clean', color: c.ok }])]
  return all.flatMap((sp, i) => (i > 0 ? [{ text: ' · ', dim: true }, sp] : [sp]))
}

const linesCell = (repo: RepoInfo, c: Colors): Cell =>
  repo.lines
    ? [
        { text: 'diff ', dim: true },
        { text: `+${repo.lines.added}`, color: repo.lines.added > 0 ? c.ok : undefined, dim: repo.lines.added === 0 },
        { text: ` −${repo.lines.removed}`, color: repo.lines.removed > 0 ? c.hot : undefined, dim: repo.lines.removed === 0 },
      ]
    : [{ text: 'diff —', dim: true }]

const SUBJECT = 40 // a commit subject's room in its chip

const commitCell = (repo: RepoInfo, now: number, c: Colors): Cell => {
  if (!repo.commit) return [{ text: repo.commit === null ? 'no commits yet' : 'commit —', dim: true }]
  const { at, subject } = repo.commit
  const clipped = [...subject].length > SUBJECT ? `${[...subject].slice(0, SUBJECT - 1).join('')}…` : subject
  return [
    { text: 'commit ', dim: true },
    { text: `${shortDuration(now - at)} ago`, color: c.blue },
    { text: ` · ${clipped}` },
  ]
}

// The PR: its number, then where it stands. An open one says its checks (failing first) and its review.
const prCell = (repo: RepoInfo, c: Colors): Cell => {
  const pr = repo.pr
  if (!pr) return [{ text: pr === null ? 'no PR' : 'PR —', dim: true }] // undefined: not asked yet
  const head: TextSpan = { text: `PR #${pr.number}`, color: c.accent, bold: true }
  if (pr.state === 'MERGED') return [head, { text: ' merged', color: c.accent }]
  if (pr.state === 'CLOSED') return [head, { text: ' closed', dim: true }]
  const { passed, failed, pending } = pr.checks
  const checks: TextSpan[] =
    failed > 0
      ? [{ text: ` ✗ ${failed} failing`, color: c.hot }]
      : pending > 0
        ? [{ text: ` ● ${pending} running`, color: c.warn }]
        : passed > 0
          ? [{ text: ` ✓ ${plural(passed, 'check')}`, color: c.ok }]
          : []
  const REVIEWS: Record<string, TextSpan> = {
    APPROVED: { text: ' · approved', color: c.ok },
    CHANGES_REQUESTED: { text: ' · changes asked', color: c.hot },
    REVIEW_REQUIRED: { text: ' · needs review', dim: true },
  }
  const review = REVIEWS[pr.review]
  return [head, ...(pr.isDraft ? [{ text: ' draft', dim: true }] : []), ...checks, ...(review ? [review] : [])]
}

export type Chip = { id: ChipId; cell: Cell }

// Chips, in order: model · effort | ⎇ branch ●n ↑n ↓n | ctx | session ↻ | week (+ per-model) ↻ | folder · $cost · time,
// then the extra repo chips: working tree | diff | last commit | PR.
// `c` colours them: the skin's palette when one is on, else AshPack's own. With
// `hasModel` false the model chip is left out (the desktop app names the model and effort
// in its own footer); `shown` lists the chips to draw, in order, as the Status page set them.
export const statusChips = (d: StatusData, now: number, barWidth: number, c: Colors = COLORS, hasModel = true, shown: readonly ChipId[] = CHIP_IDS): Chip[] => {
  const session = d.rateLimits.find(r => r.kind === 'five_hour')
  const weekly = d.rateLimits.filter(r => r.kind !== 'five_hour')
  const resets = new Set(weekly.map(r => r.resetsAt))
  const git: Cell = d.git
    ? [
        { text: `⎇ ${d.git.branch}`, color: c.ok },
        ...(d.git.dirty > 0 ? [{ text: ` ●${d.git.dirty}`, color: c.warn }] : []),
        ...(d.git.ahead > 0 ? [{ text: ` ↑${d.git.ahead}`, color: c.blue }] : []),
        ...(d.git.behind > 0 ? [{ text: ` ↓${d.git.behind}`, color: c.hot }] : []),
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
    ...meter(windowLabel(r.kind), r.percentUsed, barWidth, c),
    ...(resets.size > 1 ? resetIn(r, now) : []),
  ])
  const model: Cell = [{ text: `◆ ${prettyModel(d.model)}`, color: c.accent, bold: true }, ...(d.effort ? [{ text: ` · ${effortLabel(d.effort)}`, color: c.blue }] : [])]
  const cells: Record<ChipId, Cell> = {
    model,
    branch: git,
    context: meter('ctx', d.contextPercent ?? 0, barWidth, c),
    session: session ? [...meter('session', session.percentUsed, barWidth, c), ...resetIn(session, now)] : [{ text: 'session —', dim: true }],
    week: weekly.length > 0 ? [...weeklyCell, ...(resets.size === 1 && lastWeekly ? resetIn(lastWeekly, now) : [])] : [{ text: 'week —', dim: true }],
    spend,
    tree: treeCell(d.git, d.repo, c),
    lines: linesCell(d.repo, c),
    commit: commitCell(d.repo, now, c),
    pr: prCell(d.repo, c),
  }
  return shown.filter(id => hasModel || id !== 'model').map(id => ({ id, cell: cells[id] }))
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

// ── the working popup: a card per kind of call, the running step, the task list ──

// Calls the popup counts by kind; the task-list tools are the Tasks card instead.
const PLAN_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop'])

export const CARDS: readonly { kind: CallKind; label: string; hotkey: string }[] = [
  { kind: 'read', label: 'Read', hotkey: 'r' },
  { kind: 'edit', label: 'Edit', hotkey: 'e' },
  { kind: 'command', label: 'Command', hotkey: 'c' },
  { kind: 'search', label: 'Search', hotkey: 's' },
  { kind: 'web', label: 'Web', hotkey: 'w' },
  { kind: 'agent', label: 'Agent', hotkey: 'a' },
  { kind: 'skill', label: 'Skill', hotkey: 'k' },
  { kind: 'tool', label: 'Tool', hotkey: 'o' },
]

// A path as the popup shows it: under the session's folder, relative to it.
const shortPath = (p: string, cwd: string): string => (cwd && p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : p)

// A tool call's kind and what it acted on; null for the task-list tools.
export const callOf = (tool: string, input: unknown, cwd: string): { kind: CallKind; target: string } | null => {
  if (PLAN_TOOLS.has(tool)) return null
  const i = (input ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim()
  switch (tool) {
    case 'Read':
      return { kind: 'read', target: shortPath(str('file_path'), cwd) }
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { kind: 'edit', target: shortPath(str('file_path') || str('notebook_path'), cwd) }
    case 'Bash':
    case 'PowerShell':
      return { kind: 'command', target: oneLine(str('command')) }
    case 'Grep':
    case 'Glob': {
      const where = str('path') ? ` in ${shortPath(str('path'), cwd)}` : ''
      return { kind: 'search', target: `${str('pattern')}${where}` }
    }
    case 'WebFetch':
      return { kind: 'web', target: str('url') }
    case 'WebSearch':
      return { kind: 'web', target: str('query') }
    case 'Agent':
    case 'Task':
      return { kind: 'agent', target: oneLine(str('description') || str('prompt')) }
    case 'Skill':
      return { kind: 'skill', target: `/${str('skill')}` }
    default:
      return { kind: 'tool', target: tool.replace(/^mcp__/, '').replace(/__/g, ' ') }
  }
}

// An edit's size from its result: lines added and removed (a new file is all added).
export const editSize = (output: unknown): { added: number; removed: number } | undefined => {
  const o = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  if (o.type === 'create' && typeof o.content === 'string') return { added: o.content.replace(/\n$/, '').split('\n').length, removed: 0 }
  if (!Array.isArray(o.structuredPatch)) return undefined
  const lines = o.structuredPatch.flatMap(h => (Array.isArray((h as { lines?: unknown })?.lines) ? ((h as { lines: unknown[] }).lines) : [])).filter((l): l is string => typeof l === 'string')
  return { added: lines.filter(l => l.startsWith('+')).length, removed: lines.filter(l => l.startsWith('-')).length }
}

// The cards to draw: each kind the turn used, in CARDS order, with its count.
export const cardCounts = (calls: readonly Call[]): { kind: CallKind; label: string; hotkey: string; count: number }[] =>
  CARDS.map(c => ({ ...c, count: calls.filter(x => x.kind === c.kind).length })).filter(c => c.count > 0)

// The last `n` of a card's calls, and how many came before them.
export const latest = <T>(items: readonly T[], n: number): { shown: T[]; earlier: number } => ({ shown: items.slice(-n), earlier: Math.max(0, items.length - n) })

// How long a call ran: `0.4s`, `12s`, `1m 4s`.
export const took = (ms: number): string => {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export type Segment = { title: string; state: 'done' | 'now' | 'todo' }

// The task list as rows: done, the running one (else the first waiting), the rest waiting.
export const segments = (plan: readonly Section[]): Segment[] => {
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
