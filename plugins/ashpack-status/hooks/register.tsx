import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, Timer } from 'claude-code'

import type { Activity, Call, CallKind, ChipId, GitInfo, PullRequest, RepoInfo, Section, StatusData, Turn } from '../types'
import { callsSvg, chartSvg, heroSvg, kindColor, lasted, mixCells, NO_HISTORY, pagePx, sessionTiles, shownOf, sparkCells, TAG, tilesSvg, turnFacts, turnLabel, turnOf, withTurn } from './activity'
import type { Shown, Tile } from './activity'
import type { Colors, Segment, TextSpan } from './format'
import {
  addTask,
  around,
  callOf,
  cardCounts,
  COLORS,
  describeTool,
  editSize,
  barPx,
  barSpans,
  bar,
  barSvg,
  chipBarWidth,
  CHIP_IDS,
  chipOrder,
  CHIPS,
  hiddenChipsOf,
  moveChip,
  isBar,
  latest,
  levelColor,
  operationOf,
  parseCommit,
  parseGit,
  parsePr,
  parseShortstat,
  planFromTodos,
  popupWidth,
  segments,
  statusChips,
  took,
  updateTask,
  wave,
  waveSvg,
} from './format'

// AshPack Status. Everything that touches `$` lives in this one file (the engine
// follows `$` only into functions of the same file):
//   - status chips: model, branch, context and usage, one row by the prompt. With the
//     AshPack host on, each chip is lifted into its shared strip; alone, they are a row.
//   - compact mode: tool rows hidden, a working popup above the prompt
//   - a Status page in the AshPack drawer with the two switches; a pane of its own
//     without the host
//   - an Activity page beside it: the turn in view and its calls, the session's numbers,
//     and every turn, kept after the popup closes
const DRAWER = 'ashpack' // the AshPack drawer's pane, where Status is a page
const PANE = 'ashpack-status' // the mod's own pane, for sessions without the host
const ACTIVITY_PANE = 'ashpack-activity' // the Activity page's own pane, without the host
const HOST_PAGE = { plugin: 'ashpack', key: 'page' } as const // the drawer's page in view
const CALL_ROWS = 12 // calls the Activity page lists for a turn, the latest
const HOST = 'ashpack@ashpack'
const PANE_COLUMNS = 64
const STATUS_TICK_MS = 30_000
const PR_TTL_MS = 120_000 // the PR chip asks GitHub at most this often
const GIT_MS = 3000
// Polling takes no optional lock, so it never holds `index.lock` against Claude's own git calls.
const GIT = ['git', '--no-optional-locks'] as const
const GH_MS = 10_000
const FRAME_MS = 120
// ponytail: a longer turn counts its latest 500 calls on the Activity page; keep running tallies if that bites
const MAX_CALLS = 500 // calls a turn keeps, the latest
const LOADER_PX = 120 // the desktop loader's width, in CSS pixels
const LOADER_CELLS = 12 // the terminal loader's width at most
const BLUE = COLORS.blue
const COMPACT_KEY = 'compact' // $.store keys: toggles survive sessions
const STATUS_KEY = 'statusOn'
const CHIPS_KEY = 'hiddenChips'
const ORDER_KEY = 'chipOrder'

// The chips and the popup draw in the skin's palette when one is on; the loader in its
// accent, else AshPack's blue.
const loaderColor = async ($: EngineInterface): Promise<string> => (await skinColors($))?.accent ?? BLUE
const colorsOf = async ($: EngineInterface): Promise<Colors> => (await skinColors($)) ?? COLORS

const compact = atom({ plugin: 'ashpack-status', key: 'compact' } as const, false)
const statusOn = atom({ plugin: 'ashpack-status', key: 'statusOn' } as const, true)
const hiddenChips = atom({ plugin: 'ashpack-status', key: 'hiddenChips' } as const, [] as ChipId[])
const orderedChips = atom({ plugin: 'ashpack-status', key: 'orderedChips' } as const, [...CHIP_IDS])
const activity = atom({ plugin: 'ashpack-status', key: 'activity' } as const, null as Activity | null)
const openCard = atom({ plugin: 'ashpack-status', key: 'openCard' } as const, null as CallKind | 'tasks' | null)
const frame = atom({ plugin: 'ashpack-status', key: 'frame' } as const, 0)
const status = atom({ plugin: 'ashpack-status', key: 'status' } as const, null as StatusData | null)
const plan = atom({ plugin: 'ashpack-status', key: 'plan' } as const, [] as Section[])
const history = atom({ plugin: 'ashpack-status', key: 'history' } as const, NO_HISTORY)
const shownTurn = atom({ plugin: 'ashpack-status', key: 'shownTurn' } as const, null as number | null)
const callFilter = atom({ plugin: 'ashpack-status', key: 'callFilter' } as const, 'all' as CallKind | 'all')

// ── status rows: data ────────────────────────────────────────────────────────

type Seen = { effort?: string }

// Effort arrives only on the classic hook inputs, so the grid shows what the
// last one said. (The permission mode is the engine's own hint line, just below.)
let seen: Seen = {}
const see = (e: { effort?: { level: string } }): void => {
  seen = { effort: e.effort?.level ?? seen.effort }
}

// A command's output, or null when it failed or is not installed. In the C locale, so git's
// words (`insertions`) read the same everywhere.
async function run($: EngineInterface, argv: readonly string[], timeoutMs = GIT_MS): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs, env: { LC_ALL: 'C' } })
    return exitCode === 0 ? stdout : null
  } catch {
    return null
  }
}

async function gitInfo($: EngineInterface) {
  const out = await run($, [...GIT, 'status', '--porcelain=v2', '--branch'])
  return out === null ? null : parseGit(out)
}

// The last PR answer, per branch, kept as its promise so refreshes that overlap share one
// `gh` call: GitHub is asked again only after PR_TTL_MS.
let prSeen: { branch: string; at: number; pr: Promise<PullRequest | null> } | undefined

function pullRequest($: EngineInterface, branch: string, now: number): Promise<PullRequest | null> {
  if (prSeen?.branch === branch && now - prSeen.at < PR_TTL_MS) return prSeen.pr
  const pr = run($, ['gh', 'pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'], GH_MS).then(out => (out === null ? null : parsePr(out)))
  prSeen = { branch, at: now, pr }
  return pr
}

async function treeExtras($: EngineInterface): Promise<Pick<RepoInfo, 'operation' | 'stashes'>> {
  const [dir, stash] = await Promise.all([run($, [...GIT, 'rev-parse', '--absolute-git-dir']), run($, [...GIT, 'stash', 'list'])])
  const names = dir ? await $.fs.list(dir.trim()).then(list => list.map(f => f.name), () => []) : []
  return { operation: operationOf(names), stashes: stash === null ? 0 : stash.split('\n').filter(Boolean).length }
}

// What the extra repo chips read, fetched only for the chips that are on.
async function repoInfo($: EngineInterface, git: GitInfo | null, wants: readonly ChipId[], now: number): Promise<RepoInfo> {
  if (!git) return {}
  const [tree, diff, log, pr] = await Promise.all([
    wants.includes('tree') ? treeExtras($) : {},
    wants.includes('lines') ? run($, [...GIT, 'diff', '--shortstat', 'HEAD']) : null,
    wants.includes('commit') ? run($, [...GIT, 'log', '-1', '--format=%ct%x1f%s']) : null,
    wants.includes('pr') ? pullRequest($, git.branch, now) : undefined,
  ])
  return {
    ...tree,
    ...(diff !== null ? { lines: parseShortstat(diff) } : {}),
    ...(wants.includes('commit') ? { commit: log === null ? null : parseCommit(log) } : {}),
    ...(pr !== undefined ? { pr } : {}),
  }
}

async function seenFromSettings($: EngineInterface): Promise<Seen> {
  const s = await $.settings.read()
  return { effort: typeof s.effortLevel === 'string' ? s.effortLevel : undefined }
}

async function loadStatus($: EngineInterface): Promise<void> {
  const [model, usage, git, cwd, isOn, hidden, now] = await Promise.all([
    $.session.model(),
    $.session.usage(),
    gitInfo($),
    $.session.cwd(),
    read($, statusOn),
    read($, hiddenChips),
    $.clock.now(),
  ])
  const held = await read($, status)
  const data: StatusData = {
    model,
    effort: seen.effort,
    contextPercent: usage.context.percent,
    rateLimits: usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    git,
    folder: cwd.split('/').pop() || cwd,
    costUsd: usage.cost?.usd,
    startedAt: usage.startedAt,
    repo: held?.repo ?? {},
  }
  // Only a change is written: every write makes the desktop app re-lay out the transcript.
  if (JSON.stringify(held) !== JSON.stringify(data)) await update($, status, () => data)
  // The repo chips' data after, so a slow `gh` never holds up the other chips. It joins
  // whatever the chips hold by then, so an older refresh cannot undo a newer one's.
  const wants = isOn ? CHIP_IDS.filter(id => !hidden.includes(id)) : []
  const repo = await repoInfo($, git, wants, now)
  const latest = await read($, status)
  if (latest && JSON.stringify(latest.repo) !== JSON.stringify(repo)) await update($, status, s => s && { ...s, repo })
}

// Never lets the status rows break the event they ride on.
function refreshStatus($: EngineInterface): void {
  void loadStatus($).catch(err => $.ui.log(`ashpack status: ${String(err)}`, { to: 'debug' }))
}

// Where the status chips go: under the prompt (PromptHint) on the fullscreen terminal,
// above it (AbovePrompt) everywhere else. The desktop reports fullscreen, since it docks
// panes, but draws no mod tree under its prompt; its footer is a one-line strip that
// truncates, so the chips cannot go there either. In the band, the working popup takes
// the chips' place while Claude works, so the two never stack.
const isUnderPrompt = (e: { surface: string; viewport?: { isFullscreen?: boolean } }): boolean =>
  e.surface === 'terminal' && e.viewport?.isFullscreen === true

type StatusSite = RenderInput<'PromptHint'> | RenderInput<'AbovePrompt'>

// The chips as a tree. The desktop: one strip, the bars as images (its font sets the
// segment glyphs at odd heights), wide gaps between the chips. The terminal: a spaced
// row of text. Both wrap when the row is short.
function drawChips($: EngineInterface, e: StatusSite, data: StatusData, now: number, total: number, colors: Colors, shown: readonly ChipId[]) {
  const { Box, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  const chips = statusChips(data, now, chipBarWidth(total), colors, isTerminal, shown)
  // Svg is not in the terminal's table: resolved only off it.
  const Svg = e.surface === 'terminal' ? null : $.ui.resolve(e).Svg
  const text = (sp: TextSpan, key: string) => (
    <Text key={key} color={sp.color} dimColor={sp.dim} bold={sp.bold}>
      {sp.text}
    </Text>
  )
  return (
    <Box flexWrap="wrap" columnGap={isTerminal ? 2 : 3} rowGap={isTerminal ? 0 : 1}>
      {chips.map(({ id, cell }, c) => (
        // Keyed for the AshPack host, which lifts each chip into its strip.
        <Box key={`ashpack-chip:${id}`} alignItems="center">
          {cell.map((sp, i) => {
            const key = `cell-${c}-${i}`
            if (!isBar(sp)) return text(sp, key)
            if (isTerminal || !Svg) return <Text key={key}>{barSpans(sp).map((t, j) => text(t, `${key}-${j}`))}</Text>
            return <Svg key={key} source={barSvg(sp.bar, sp.width, sp.color)} alt={`${Math.round(sp.bar)}%`} width={barPx(sp.width)} height={7} />
          })}
        </Box>
      ))}
    </Box>
  )
}

// Everything the chips read, in one go; the last, the chips turned on, in their order.
async function statusInputs($: EngineInterface): Promise<[boolean, StatusData | null, number, Colors, ChipId[]]> {
  const [isOn, data, now, colors, order, hidden] = await Promise.all([read($, statusOn), read($, status), $.clock.now(), colorsOf($), read($, orderedChips), read($, hiddenChips)])
  return [isOn, data, now, colors, order.filter(id => !hidden.includes(id))]
}

// ── compact mode ─────────────────────────────────────────────────────────────

let ticker: Timer | undefined
let terminalSeen = false // a terminal has drawn: the frame ticker has a reader

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function resetActivity($: EngineInterface): Promise<void> {
  stopTicker()
  await update($, activity, () => null)
}

// The turn that just ended joins the Activity page's history and the session's totals.
async function recordTurn($: EngineInterface, e: { durationMs: number; reason: Turn['outcome']; usage?: Parameters<typeof turnOf>[1]['usage'] }): Promise<void> {
  const a = await read($, activity)
  if (!a) return
  const usage = await $.session.usage().catch(() => null)
  const costUsd = a.costAtStart !== undefined && usage?.cost ? usage.cost.usd - a.costAtStart : undefined
  const turn = turnOf(a, { ms: e.durationMs, outcome: e.reason, ...(costUsd !== undefined ? { costUsd } : {}), ...(e.usage ? { usage: e.usage } : {}) })
  await update($, history, h => withTurn(h, turn))
}

// A /clear starts the Activity page over (no session.start fires for it).
async function clearHistory($: EngineInterface): Promise<void> {
  await resetActivity($)
  await Promise.all([update($, history, () => NO_HISTORY), update($, shownTurn, () => null), update($, callFilter, () => 'all')])
}

function isCompact($: EngineInterface): Promise<boolean> {
  return read($, compact)
}

const seconds = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// The Skins mod's active palette (null while skins are off), and its accent alone, which a
// Skins mod before 0.8 shares instead.
const SKIN_PALETTE = { plugin: 'ashpack-skins', key: 'palette' } as const
const SKIN_ACCENT = { plugin: 'ashpack-skins', key: 'accent' } as const

const isColors = (v: unknown): v is Colors =>
  typeof v === 'object' && v !== null && Object.keys(COLORS).every(k => typeof (v as Record<string, unknown>)[k] === 'string')

// The skin's colours, or null with no Skins mod or skins off. Reading them while drawing
// redraws the site when the skin changes.
async function skinColors($: EngineInterface): Promise<Colors | null> {
  const [palette, accent] = await Promise.all([
    $.state.get(SKIN_PALETTE as never).catch(() => undefined),
    $.state.get(SKIN_ACCENT as never).catch(() => undefined),
  ])
  if (isColors(palette?.value)) return palette.value
  const a: unknown = accent?.value
  return typeof a === 'string' && a !== '' ? { ...COLORS, accent: a } : null
}



// The running section's loader: redrawn per frame on the terminal; an SVG that
// animates itself elsewhere, so the desktop never redraws for it.
function loader($: EngineInterface, e: RenderInput<'AbovePrompt'>, f: number, cells: number, color: string) {
  if (e.surface !== 'terminal') {
    const { Svg } = $.ui.resolve(e)
    return <Svg key="loader" source={waveSvg(color, LOADER_PX)} alt="Working" />
  }
  const { Text } = $.ui.resolve(e)
  return (
    <Text key="loader" color={color}>
      {wave(f, Math.min(cells, LOADER_CELLS))}
    </Text>
  )
}

const MARK: Record<Segment['state'], string> = { done: '✓', now: '▸', todo: '○' }
const CALL_MARK: Record<Call['state'], string> = { running: '▸', ok: '✓', failed: '✗' }

// One call of an open card: its mark, what it acted on (an edit's size), how long it took;
// on the Activity page, its kind's tag after the mark.
function callRow($: EngineInterface, e: RenderInput<'AbovePrompt'> | PaneInput, c: Colors, call: Call, inner: number, tag?: TextSpan) {
  const { Box, Text } = $.ui.resolve(e)
  const color = { running: c.accent, ok: c.ok, failed: c.hot }[call.state]
  const time = call.ms !== undefined ? took(call.ms) : ''
  return (
    <Box key={`call-${call.id}`} justifyContent="space-between" columnGap={1}>
      <Box width={Math.max(10, inner - 8)}>
        <Text wrap="truncate-end">
          <Text color={color}>{CALL_MARK[call.state]} </Text>
          {tag ? <Text color={tag.color}>{tag.text}</Text> : null}
          <Text>{call.kind === 'command' ? `$ ${call.target}` : call.target}</Text>
          {call.added || call.removed ? <Text color={c.ok}>{`  +${call.added ?? 0}`}</Text> : null}
          {call.added || call.removed ? <Text color={c.hot}>{` −${call.removed ?? 0}`}</Text> : null}
        </Text>
      </Box>
      <Text dimColor>{time}</Text>
    </Box>
  )
}

// The working popup, half the band wide: the running step with the loader beside it, then a
// card per kind of call (`Read 4`, `Command 3`) and one for the task list. A card pressed
// open lists its calls (or the tasks) under the cards; pressed again, it folds.
async function drawPopup($: EngineInterface, e: RenderInput<'AbovePrompt'>, a: Activity | null, now: number) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  // Reading `frame` redraws per tick: the terminal only.
  const [list, f, color, c, open] = await Promise.all([read($, plan), isTerminal ? read($, frame) : 0, loaderColor($), colorsOf($), read($, openCard)])
  const width = popupWidth(e.props.bodyColumns)
  const inner = width - 4 // border and padding
  const titleWidth = Math.floor(inner * 0.55)
  const calls = a?.calls ?? []
  const done = list.filter(s => s.status === 'completed').length
  const task = list.find(s => s.status === 'in_progress')
  const rows = Math.max(2, Math.min(6, e.props.maxRows - 7)) // what fits under the cards
  const facts = [list.length > 0 ? `${done}/${list.length}` : '', a && isTerminal ? seconds(now - a.startedAt) : ''].filter(Boolean) // the desktop draws no ticks, so the time would stand still
  const cards = [
    ...cardCounts(calls).map(k => ({ id: k.kind as CallKind | 'tasks', label: `${k.label} ${k.count}`, hotkey: k.hotkey })),
    ...(list.length > 0 ? [{ id: 'tasks' as const, label: `Tasks ${done}/${list.length}`, hotkey: 't' }] : []),
  ]
  const shownOpen = cards.some(k => k.id === open) ? open : null
  const opened = shownOpen && shownOpen !== 'tasks' ? latest(calls.filter(x => x.kind === shownOpen), rows) : null
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={c.accent} paddingX={1} width={width}>
      <Box justifyContent="space-between" columnGap={2}>
        <Text wrap="truncate-end">
          <Text bold color={c.accent}>
            ◆ AshPack
          </Text>
          {task ? <Text dimColor> {task.title}</Text> : null}
        </Text>
        <Text dimColor>{facts.join(' · ')}</Text>
      </Box>
      <Box columnGap={1}>
        <Box width={titleWidth}>
          <Text wrap="truncate-end" bold color={c.accent}>
            ▸ {a?.label ?? 'Thinking'}…
          </Text>
        </Box>
        {loader($, e, f, inner - titleWidth - 1, color)}
      </Box>
      {cards.length > 0 ? (
        <Box flexWrap="wrap" columnGap={2}>
          {cards.map(k => (
            <Button
              key={`card-${k.id}`}
              plain
              {...(isTerminal ? { hotkey: k.hotkey } : {})}
              dimColor={shownOpen !== null && shownOpen !== k.id}
              label={shownOpen === k.id ? `${k.label} ▾` : k.label}
              onPress={() => update($, openCard, o => (o === k.id ? null : k.id))}
            />
          ))}
        </Box>
      ) : null}
      {opened && opened.earlier > 0 ? <Text dimColor>{`  +${opened.earlier} earlier`}</Text> : null}
      {opened ? opened.shown.map(call => callRow($, e, c, call, inner)) : null}
      {shownOpen === 'tasks'
        ? around(segments(list), rows).map((s, i) => (
            <Text key={`task-${i}`} wrap="truncate-end" bold={s.state === 'now'} color={s.state === 'now' ? c.accent : s.state === 'done' ? c.ok : undefined} dimColor={s.state === 'todo'}>
              {MARK[s.state]} {s.title}
            </Text>
          ))
        : null}
    </Box>
  )
}

// ── the Activity page ────────────────────────────────────────────────────────

// Everything the page reads, in one go. The terminal ticks the running turn's time and
// wave by `frame`; the desktop's wave animates itself, so it never redraws for them.
async function activityInputs($: EngineInterface, e: PaneInput) {
  const [held, { turns: list, totals: t }, picked, filter, data, c, now] = await Promise.all([
    read($, activity),
    read($, history),
    read($, shownTurn),
    read($, callFilter),
    read($, status),
    colorsOf($),
    $.clock.now(),
  ])
  // The ended turn joins the history a write before the live one clears: not counted twice.
  const a = held && held.n > t.turns ? held : null
  // A turn picked that has since left the history is no pick.
  const pick = list.some(x => x.n === picked) ? picked : null
  const shown = shownOf(a, list, pick)
  const f = e.surface === 'terminal' && shown?.isLive ? await read($, frame) : 0
  const kinds = shown ? cardCounts(shown.calls) : []
  const kind = kinds.some(k => k.kind === filter) ? filter : 'all'
  const { shown: calls, earlier } = latest(shown ? shown.calls.filter(x => kind === 'all' || x.kind === kind) : [], CALL_ROWS)
  const bars = [...list, ...(a ? [{ n: a.n, prompt: a.prompt, ms: Math.max(0, now - a.startedAt), calls: a.calls, isLive: true }] : [])]
  return { a, pick, shown, kind, kinds, calls, earlier, bars, c, now, f, tiles: sessionTiles(t, a, now, c, data?.startedAt, data?.costUsd), context: data?.contextPercent }
}

type ActivityView = Awaited<ReturnType<typeof activityInputs>>

async function showTurn($: EngineInterface, n: number | null): Promise<void> {
  // Only a change is written: each write redraws.
  if ((await read($, shownTurn)) !== n) await update($, shownTurn, () => n)
  if ((await read($, callFilter)) !== 'all') await update($, callFilter, () => 'all')
}

// The kinds of the turn in view as filters for its calls (All first); the one on, bright.
function callFilters($: EngineInterface, e: PaneInput, v: ActivityView) {
  const { Box, Button } = $.ui.resolve(e)
  if (!v.shown || v.kinds.length === 0) return null
  const all = { id: 'all' as const, label: `All ${v.shown.calls.length}` }
  return (
    <Box key="activity-filters" flexWrap="wrap" columnGap={2}>
      {[all, ...v.kinds.map(k => ({ id: k.kind, label: `${k.label} ${k.count}` }))].map(k => (
        <Button key={`filter-${k.id}`} plain dimColor={k.id !== v.kind} label={k.label} onPress={() => update($, callFilter, () => k.id)} />
      ))}
    </Box>
  )
}

// Every kept turn, the newest first, each a button that brings it into view.
function turnRows($: EngineInterface, e: PaneInput, v: ActivityView, chars: number) {
  const { Box, Button } = $.ui.resolve(e)
  return (
    <Box key="activity-turns" flexDirection="column">
      {[...v.bars].reverse().map(b => {
        const isLive = 'isLive' in b
        const inView = b.n === v.shown?.n
        return (
          <Button
            key={`turn-${b.n}`}
            plain
            dimColor={!inView}
            label={`${inView ? '▸' : isLive ? '●' : ' '} ${turnLabel({ ...b, ms: isLive ? undefined : b.ms }, chars - 2)}`}
            onPress={() => showTurn($, isLive ? null : b.n)}
          />
        )
      })}
    </Box>
  )
}

const heroAlt = (s: Shown | null): string =>
  !s ? 'No turns yet' : s.isLive ? `Turn ${s.n}, working: ${s.label}` : `Turn ${s.n}, ${s.outcome ?? 'answer'}: ${s.prompt}. ${turnFacts(s).join(', ')}`

const tilesAlt = (tiles: readonly Tile[]): string => tiles.map(t => `${t.label} ${t.value.map(x => x.text).join('')}${t.sub ? ` (${t.sub.text})` : ''}`).join(', ')

// The desktop: SVG cards (the head, the calls, the tiles, the chart), the filters and the
// turns as buttons between them, since a drawing takes no presses. The cards take no size:
// each is its markup's own, shrunk to fit a narrower pane.
function activityDesktop($: EngineInterface, e: PaneInput, v: ActivityView, w: number) {
  if (e.surface === 'terminal') return null
  const { Box, Svg, Text } = $.ui.resolve(e)
  const hero = heroSvg(v.shown, v.c, w)
  const calls = v.calls.length > 0 ? callsSvg(v.calls, v.earlier, v.c, w) : null
  const tiles = tilesSvg(v.tiles, v.context, v.c, w)
  const chart = v.bars.length > 0 ? chartSvg(v.bars, v.c, w, v.pick) : null
  return (
    <Box key="ashpack-page:Activity" flexDirection="column" rowGap={1}>
      {v.pick !== null ? activityBack($, e) : null}
      <Svg key="activity-hero" source={hero.source} alt={heroAlt(v.shown)} />
      {callFilters($, e, v)}
      {calls ? <Svg key="activity-calls" source={calls.source} alt={v.calls.map(x => `${x.state} ${x.kind} ${x.target}`).join('; ')} /> : null}
      <Text key="activity-session-head" bold>
        This session
      </Text>
      <Svg key="activity-tiles" source={tiles.source} alt={tilesAlt(v.tiles)} />
      {chart ? <Svg key="activity-chart" source={chart.source} alt={`${v.bars.length} turns`} /> : null}
      {turnRows($, e, v, Math.floor(w / 7.5))}
    </Box>
  )
}

const MARK_OF: Record<Turn['outcome'], string> = { answer: '✓', aborted: '✗', refusal: '✗', error: '✗' }

// The terminal: the same page in text, the head in a rounded box.
function activityTerminal($: EngineInterface, e: PaneInput, v: ActivityView, cols: number) {
  const { Box, Text } = $.ui.resolve(e)
  const s = v.shown
  const span = (sp: TextSpan, key: string) => (
    <Text key={key} color={sp.color} dimColor={sp.dim} bold={sp.bold}>
      {sp.text}
    </Text>
  )
  const inner = cols - 4
  const tone = !s || s.isLive ? v.c.accent : s.outcome === 'answer' ? v.c.ok : v.c.hot
  const word = !s ? '' : s.isLive ? 'WORKING' : ({ answer: 'DONE', aborted: 'STOPPED', refusal: 'REFUSED', error: 'FAILED' } as const)[s.outcome ?? 'answer']
  const tileW = Math.floor(cols / 3)
  const pct = v.context === undefined ? undefined : Math.round(v.context)
  return (
    <Box key="ashpack-page:Activity" flexDirection="column" rowGap={1}>
      {v.pick !== null ? activityBack($, e) : null}
      <Box key="activity-hero" flexDirection="column" borderStyle="round" borderColor={tone} paddingX={1}>
        {s ? (
          <Box flexDirection="column">
            <Box justifyContent="space-between" columnGap={1}>
              <Text color={tone} bold>
                {s.isLive ? '●' : MARK_OF[s.outcome ?? 'answer']} TURN {s.n} · {word}
              </Text>
              <Text dimColor>{lasted(s.isLive ? v.now - s.startedAt : (s.ms ?? 0))}</Text>
            </Box>
            <Box columnGap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Text bold wrap="truncate-end">
                  {s.isLive ? `${s.label}…` : s.prompt || `Turn ${s.n}`}
                </Text>
              </Box>
              {s.isLive ? <Text color={v.c.accent}>{wave(v.f, 8)}</Text> : null}
            </Box>
            <Text dimColor wrap="truncate-end">
              {s.isLive ? (s.prompt ? `“${s.prompt}”` : ' ') : turnFacts(s).join(' · ')}
            </Text>
            <Text>{mixCells(s.calls, inner, v.c).map((sp, i) => span(sp, `mix-${i}`))}</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text bold>Ready when you are</Text>
            <Text dimColor>Each turn’s tool calls, timings and cost land here.</Text>
          </Box>
        )}
      </Box>
      {callFilters($, e, v)}
      {v.calls.length > 0 ? (
        <Box key="activity-calls" flexDirection="column">
          {v.earlier > 0 ? <Text dimColor>{`+ ${v.earlier} earlier`}</Text> : null}
          {v.calls.map(call => callRow($, e, v.c, call, cols, { text: `${TAG[call.kind].padEnd(5)} `, color: kindColor(call.kind, v.c) }))}
        </Box>
      ) : null}
      <Text bold>This session</Text>
      <Box key="activity-tiles" flexWrap="wrap" rowGap={1}>
        {v.tiles.map(t => (
          <Box key={`tile-${t.label}`} flexDirection="column" width={tileW}>
            <Text dimColor>
              {t.label.toUpperCase()}
              {t.sub ? <Text color={t.sub.color}>{` ${t.sub.text}`}</Text> : null}
            </Text>
            <Text bold>{t.value.map((sp, i) => span(sp, `v-${t.label}-${i}`))}</Text>
          </Box>
        ))}
      </Box>
      {pct !== undefined ? (
        <Text>
          <Text dimColor>CONTEXT </Text>
          {bar(pct, Math.max(8, Math.min(24, cols - 16))).map((b, i) => (
            <Text key={`ctx-${i}`} color={i === 0 ? levelColor(pct, v.c) : undefined} dimColor={i === 1}>
              {b}
            </Text>
          ))}
          <Text bold>{` ${pct}%`}</Text>
        </Text>
      ) : null}
      {v.bars.length > 0 ? (
        <Text wrap="truncate-end">
          <Text dimColor>TIMELINE </Text>
          {sparkCells(v.bars.slice(-(cols - 8)), v.c, v.pick).map((sp, i) => span(sp, `spark-${i}`))}
        </Text>
      ) : null}
      {turnRows($, e, v, cols)}
    </Box>
  )
}

function activityBack($: EngineInterface, e: PaneInput) {
  const { Button } = $.ui.resolve(e)
  return <Button key="activity-now" plain label="← Back to now" onPress={() => showTurn($, null)} />
}

async function activityPage($: EngineInterface, e: PaneInput, columns: number) {
  const v = await activityInputs($, e)
  return e.surface === 'terminal' ? activityTerminal($, e, v, columns) : activityDesktop($, e, v, pagePx(columns))
}

// Whether the AshPack drawer shows `id`: a page it hides is drawn as its key alone, so the
// drawer never redraws for the turn while another page is up.
async function hostShows($: EngineInterface, id: string): Promise<boolean> {
  const held = await $.state.get(HOST_PAGE as never).catch(() => undefined)
  return held?.value === id
}

// A row compact mode leaves out: dropped on the terminal, empty on the desktop app (which
// draws its own row for a `display: none` answer).
function emptyRow($: EngineInterface, e: RenderInput<'ToolUse'> | RenderInput<'ToolResult'> | RenderInput<'ToolGroup'>) {
  const { Box } = $.ui.resolve(e)
  return e.surface === 'terminal' ? <Box display="none" /> : <Box />
}

// ── the Status page: in the AshPack drawer, or a pane of its own ─────────────

type PaneInput = RenderInput<'Pane'>

// A toggle as a setting: its name and what it does on the left, the switch on the right.
function settingRow($: EngineInterface, e: PaneInput, key: string, label: string, hint: string, isOn: boolean, onPress: () => unknown) {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box key={`setting-${key}`} justifyContent="space-between" columnGap={2}>
      <Box flexDirection="column" flexShrink={1}>
        <Text bold>{label}</Text>
        <Text dimColor>{hint}</Text>
      </Box>
      <Button key={key} plain dimColor={!isOn} label={isOn ? '● ON ' : '○ OFF'} onPress={onPress} />
    </Box>
  )
}

// One chip's row, indented under Status chips, laid out like the setting rows above it:
// ↑ and ↓ first, so they line up down the list whatever the names; then the name over a
// dim sample of what the chip shows, wrapping in a narrow panel; the switch at the right.
function chipRow($: EngineInterface, e: PaneInput, chip: (typeof CHIPS)[number], isOn: boolean, listed: readonly ChipId[]) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const i = listed.indexOf(chip.id)
  return (
    <Box key={`chip-row-${chip.id}`} columnGap={2} paddingLeft={2}>
      <Box columnGap={1} flexShrink={0}>
        <Button key={`chip-up-${chip.id}`} plain dimColor={i === 0} label="↑" onPress={() => moveChipBy($, chip.id, -1, listed)} />
        <Button key={`chip-down-${chip.id}`} plain dimColor={i === listed.length - 1} label="↓" onPress={() => moveChipBy($, chip.id, 1, listed)} />
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text>{chip.label}</Text>
        <Text dimColor>{chip.sample}</Text>
      </Box>
      <Button key={`chip-${chip.id}`} plain dimColor={!isOn} label={isOn ? '● ON ' : '○ OFF'} onPress={() => toggleChip($, chip.id)} />
    </Box>
  )
}

function statusPage($: EngineInterface, e: PaneInput, isCompactOn: boolean, isStatusOn: boolean, order: readonly ChipId[], hidden: readonly ChipId[]) {
  const { Box } = $.ui.resolve(e)
  // The desktop app names the model in its own footer and draws no model chip: no row for it.
  const listed = order.filter(id => e.surface === 'terminal' || id !== 'model')
  const chips = listed.flatMap(id => CHIPS.filter(c => c.id === id))
  return (
    <Box key="ashpack-page:Status" flexDirection="column" rowGap={1}>
      {settingRow($, e, 'compact', 'Compact mode', 'Tool rows fold away; a popup above the prompt shows the work.', isCompactOn, () => toggle($, 'compact'))}
      <Box key="chips" flexDirection="column">
        {settingRow($, e, 'status', 'Status chips', 'Model, branch, context and usage by the prompt.', isStatusOn, () => toggle($, 'statusOn'))}
        {isStatusOn ? chips.map(c => chipRow($, e, c, !hidden.includes(c.id), listed)) : null}
      </Box>
    </Box>
  )
}

// A page of the AshPack drawer (Status or Activity), or this mod's own pane for it without the host.
async function openPage($: EngineInterface, page: 'status' | 'activity'): Promise<void> {
  const settings = await $.settings.read()
  const hasHost = (settings.enabledPlugins as Record<string, unknown> | undefined)?.[HOST] === true
  if (hasHost) {
    // A command hook may not run another command (it would wait on itself): hand off just after.
    $.clock.after(0, () => void $.command.run({ command: 'ashpack', args: page }).catch(err => $.ui.log(`ashpack-status: ${String(err)}`, { to: 'debug' })))
    return
  }
  const [id, title] = page === 'status' ? [PANE, 'Status'] : [ACTIVITY_PANE, 'Activity']
  await $.ui.open({ id, title, focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
}

async function toggle($: EngineInterface, which: 'compact' | 'statusOn'): Promise<boolean> {
  if (which === 'compact') {
    const isOn = !(await read($, compact))
    await update($, compact, () => isOn)
    await $.store.set(COMPACT_KEY, isOn)
    return isOn
  }
  const isOn = !(await read($, statusOn))
  await update($, statusOn, () => isOn)
  await $.store.set(STATUS_KEY, isOn)
  refreshStatus($) // the repo chips fetch nothing while the chips are off
  return isOn
}

async function toggleChip($: EngineInterface, id: ChipId): Promise<void> {
  await update($, hiddenChips, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))
  await $.store.set(CHIPS_KEY, await read($, hiddenChips))
  refreshStatus($) // a repo chip turned on fetches its data now, not at the next tick
}

async function moveChipBy($: EngineInterface, id: ChipId, by: -1 | 1, listed: readonly ChipId[]): Promise<void> {
  await update($, orderedChips, order => moveChip(order, id, by, listed))
  await $.store.set(ORDER_KEY, await read($, orderedChips))
}

export const register: Register = on => {
  // ── shared events ──
  on('session.start', async ($, e, next) => {
    const [storedCompact, storedStatus, storedChips, storedOrder] = await Promise.all([
      $.store.get(COMPACT_KEY),
      $.store.get(STATUS_KEY),
      $.store.get(CHIPS_KEY),
      $.store.get(ORDER_KEY),
    ])
    await update($, compact, () => storedCompact === true)
    await update($, statusOn, () => storedStatus !== false)
    // A chip added since the pick was stored takes its default; both are stored again so it
    // counts as seen from now on.
    const hidden = hiddenChipsOf(storedChips, storedOrder)
    const order = chipOrder(storedOrder)
    await update($, hiddenChips, () => hidden)
    await update($, orderedChips, () => order)
    await Promise.all([$.store.set(CHIPS_KEY, hidden), $.store.set(ORDER_KEY, order)])
    await resetActivity($)
    $.ui.status(undefined) // 0.1.0 pinned a plain-text line; the rows replace it
    await $.command.register({
      name: 'ashstatus',
      description: 'Open the Status settings, or the Activity page; `/ashstatus compact` or `/ashstatus chips` flips one',
      argumentHint: '[activity|compact|chips]',
    })
    const started = await next(e)
    seen = await seenFromSettings($).catch(() => seen)
    refreshStatus($)
    $.clock.every(STATUS_TICK_MS, () => refreshStatus($))
    return started
  })

  on('turn.start', async ($, e, next) => {
    // The session's cost now, so the turn's own is the difference when it ends.
    const [now, h, usage, pick, filter] = await Promise.all([$.clock.now(), read($, history), $.session.usage().catch(() => null), read($, shownTurn), read($, callFilter)])
    const prompt = [...String(e.text ?? '').replace(/\s+/g, ' ').trim()].slice(0, 200).join('')
    const cost = usage?.cost ? { costAtStart: usage.cost.usd } : {}
    await update($, activity, () => ({ n: h.totals.turns + 1, prompt, startedAt: now, label: 'Thinking', calls: [], ...cost }))
    // Following the work, the new turn's calls show whole, not under the last turn's filter.
    if (pick === null && filter !== 'all') await update($, callFilter, () => 'all')
    // A finished task list is the last turn's; a new one starts empty.
    await update($, plan, p => (p.every(s => s.status === 'completed') ? [] : p))
    stopTicker()
    // Only the terminal reads `frame`; the desktop's loader animates itself, and a tick
    // there would only redraw the transcript.
    if (terminalSeen) ticker = $.clock.every(FRAME_MS, () => void update($, frame, n => (n + 1) % 100_000))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      // A failed write costs the record, never the popup closing.
      await recordTurn($, e).catch(err => $.ui.log(`ashpack activity: ${String(err)}`, { to: 'debug' }))
      await resetActivity($)
      refreshStatus($)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await clearHistory($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // ── status rows: when to refresh ──
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    refreshStatus($)
    return result
  })
  on('classic.SessionStart', ($, e, next) => (see(e), refreshStatus($), next(e))).catch(($, e, next) => next(e))
  on('classic.UserPromptSubmit', ($, e, next) => (see(e), refreshStatus($), next(e))).catch(($, e, next) => next(e))
  on('classic.PostToolUse', ($, e, next) => (see(e), next(e))).catch(($, e, next) => next(e))
  on('classic.Stop', ($, e, next) => (see(e), refreshStatus($), next(e))).catch(($, e, next) => next(e))
  // /model, the picker or a fallback: the model chip follows at once, not at the next tick.
  on('classic.PostModelSwitch', ($, e, next) => (refreshStatus($), next(e))).catch(($, e, next) => next(e))

  // ── compact mode: what the popup says, and the task list it splits into sections ──
  on('tool.call', async ($, e, next) => {
    // Only the model's own calls are steps. A plugin's call (Baton lists the sessions every
    // 20 s) is not, and outside a turn there is nothing to show: no write for either.
    if (next.origin.plugin !== 'engine' || (await read($, activity)) === null) return next(e)
    const label = describeTool(String(e.tool), e)
    const isMain = !e.agentId // a subagent's list and calls are its own; its Agent card counts it
    const call = isMain ? callOf(String(e.tool), e, await $.session.cwd().catch(() => '')) : null
    const id = e.tool_use_id
    const startedAt = await $.clock.now()
    await update($, activity, a => a && { ...a, label, calls: call ? [...a.calls, { id, ...call, state: 'running' as const }].slice(-MAX_CALLS) : a.calls })
    if (isMain && e.tool === 'TodoWrite') await update($, plan, () => planFromTodos(e.todos))
    if (isMain && e.tool === 'TaskUpdate') await update($, plan, p => updateTask(p, e))
    const result = await next(e)
    if (isMain && e.tool === 'TaskCreate') {
      const taskId = (result.result as { task?: { id?: unknown } } | undefined)?.task?.id
      if (typeof taskId === 'string') await update($, plan, p => addTask(p, taskId, e.subject))
    }
    // The call settles (failed, or done with an edit's size); the line goes back to thinking
    // unless another call took it.
    const ms = (await $.clock.now()) - startedAt
    const failed = result.deny !== undefined || result.isError === true
    const size = call?.kind === 'edit' && !failed ? editSize(result.result) : undefined
    await update($, activity, a => a && {
      ...a,
      label: a.label === label ? 'Thinking' : a.label,
      calls: a.calls.map(x => (x.id === id ? { ...x, state: failed ? ('failed' as const) : ('ok' as const), ms, ...size } : x)),
    })
    return result
  }).catch(($, e, next) => next(e))

  // ── compact mode: hidden rows (an invisible Box); ctrl+o still shows all ──
  // Compact mode: no tool rows. The terminal drops the row (display none); the desktop
  // app draws its own row for a `display: none` answer, so there it gets an empty one.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await isCompact($))) return next(e)
    return emptyRow($, e)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await isCompact($))) return next(e)
    return emptyRow($, e)
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded || !(await isCompact($))) return next(e)
    return emptyRow($, e)
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) =>
    (await isCompact($)) ? next({ ...e, props: { ...e.props, hint: '' } }) : next(e),
  )

  // ── the band above the prompt: working popup, status rows, then other mods' band ──
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    if (e.surface === 'terminal') terminalSeen = true
    const [[isOn, data, now, colors, shown], isCompactOn, a] = await Promise.all([statusInputs($), isCompact($), read($, activity)])
    const showPopup = isCompactOn && e.props.isWorking
    const showStatus = isOn && data !== null && !isUnderPrompt(e) && !showPopup
    if (!showPopup && !showStatus) return below

    const { Box } = $.ui.resolve(e)
    const popup = showPopup ? await drawPopup($, e, a, now) : null
    const rows = showStatus && data ? drawChips($, e, data, now, e.props.bodyColumns, colors, shown) : null

    return (
      <Box flexDirection="column">
        {popup}
        {rows}
        {below}
      </Box>
    )
  })

  // ── under the prompt (fullscreen): the grid, then the engine's hint line ──
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    if (!isUnderPrompt(e)) return below
    const [isOn, data, now, colors, shown] = await statusInputs($)
    if (!isOn || data === null) return below
    const { Box } = $.ui.resolve(e)
    // Leave the right of the footer to the mode labels and the drawer.
    const total = Math.max(60, Math.min(150, (e.viewport?.columns ?? 120) - 34))
    return (
      <Box flexDirection="column">
        {drawChips($, e, data, now, total, colors, shown)}
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'ashstatus' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'compact' || arg === 'chips') {
      const isOn = await toggle($, arg === 'compact' ? 'compact' : 'statusOn')
      return { text: `${arg === 'compact' ? 'Compact mode' : 'Status chips'} ${isOn ? 'on' : 'off'}.` }
    }
    await openPage($, arg === 'activity' ? 'activity' : 'status')
    return {}
  })

  // The Activity and Status pages: in the AshPack drawer (the host finds them by their keys),
  // and each in a pane of this mod's own when there is no host.
  on('ui.render', { component: 'Pane', requestId: [DRAWER, PANE, ACTIVITY_PANE] }, async ($, e, next) => {
    const { Box } = $.ui.resolve(e)
    if (e.requestId === ACTIVITY_PANE) return <Box paddingX={1}>{await activityPage($, e, e.props.bodyColumns - 2)}</Box>
    const below = e.requestId === DRAWER ? await next(e) : null
    const [isCompactOn, isStatusOn, order, hidden] = await Promise.all([read($, compact), read($, statusOn), read($, orderedChips), read($, hiddenChips)])
    // The drawer pads its pages by a cell each side.
    const activityTab = e.requestId !== DRAWER ? null : (await hostShows($, 'activity')) ? await activityPage($, e, e.props.bodyColumns - 2) : <Box key="ashpack-page:Activity" />
    return (
      <Box flexDirection="column" paddingX={e.requestId === PANE ? 1 : 0}>
        {below}
        {activityTab}
        {statusPage($, e, isCompactOn, isStatusOn, order, hidden)}
      </Box>
    )
  })
}
