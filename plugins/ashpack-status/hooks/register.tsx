import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, Timer } from 'claude-code'

import type { Activity, CallKind, ChipId, GitInfo, PullRequest, RepoInfo, Section, StatusData, Turn } from '../types'
import type { ActivityView } from './activity'
import { activityView, CALL_ROWS, callsSvg, chartSvg, contextRow, heroAlt, heroRows, heroSvg, kindColor, NO_HISTORY, pagePx, settleCall, startCall, SVG_ROWS, TAG } from './activity'
import { tilesAlt, tilesSvg, timelineRow, turnLabel, turnOf, withTurn } from './activity'
import type { Colors, Row, TextSpan } from './format'
import { addTask, barPx, barSpans, barSvg, callOf, callRowOf, chipBarWidth, CHIP_IDS, chipOrder, CHIPS, chunks, COLORS, editSize, ellipsis, GIT_CHIPS } from './format'
import { hiddenChipsOf, isBar, isColors, isListed, isUnderPrompt, MARK, moveChip, oneLine, operationOf, parseGit, parsePr, planFromTodos, popupView } from './format'
import { printsStash, repoOf, statusChips, statusData, updateTask, wave, waveSvg } from './format'

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
const HOST = 'ashpack@ashpack'
const PANE_COLUMNS = 64
const STATUS_TICK_MS = 30_000
const PR_TTL_MS = 120_000 // the PR chip asks GitHub at most this often
const GIT_MS = 3000
// Polling takes no optional lock, so it never holds `index.lock` against Claude's own git calls.
const GIT = ['git', '--no-optional-locks'] as const
const GH_MS = 10_000
const FRAME_MS = 120
const SECOND_MS = 1000
const PROMPT_CHARS = 200 // what a turn keeps of its prompt
const LOADER_PX = 120 // the desktop loader's width, in CSS pixels
const LOADER_CELLS = 12 // the terminal loader's width at most
const BLUE = COLORS.blue
const COMPACT_KEY = 'compact' // $.store keys: toggles survive sessions
const STATUS_KEY = 'statusOn'
const CHIPS_KEY = 'hiddenChips'
const ORDER_KEY = 'chipOrder'
const FRAME = { plugin: 'ashpack-status', key: 'frame' } as const
const SECOND = { plugin: 'ashpack-status', key: 'second' } as const
// The Skins mod's active palette (null while skins are off), and its accent alone, which a
// Skins mod before 0.8 shares instead.
const SKIN_PALETTE = { plugin: 'ashpack-skins', key: 'palette' } as const
const SKIN_ACCENT = { plugin: 'ashpack-skins', key: 'accent' } as const

const compact = atom({ plugin: 'ashpack-status', key: 'compact' } as const, false)
const statusOn = atom({ plugin: 'ashpack-status', key: 'statusOn' } as const, true)
const hiddenChips = atom({ plugin: 'ashpack-status', key: 'hiddenChips' } as const, [] as ChipId[])
const orderedChips = atom({ plugin: 'ashpack-status', key: 'orderedChips' } as const, [...CHIP_IDS])
const activity = atom({ plugin: 'ashpack-status', key: 'activity' } as const, null as Activity | null)
const openCard = atom({ plugin: 'ashpack-status', key: 'openCard' } as const, null as CallKind | 'tasks' | null)
const frame = atom(FRAME, 0)
const second = atom(SECOND, 0)
const status = atom({ plugin: 'ashpack-status', key: 'status' } as const, null as StatusData | null)
const plan = atom({ plugin: 'ashpack-status', key: 'plan' } as const, [] as Section[])
const history = atom({ plugin: 'ashpack-status', key: 'history' } as const, NO_HISTORY)
const shownTurn = atom({ plugin: 'ashpack-status', key: 'shownTurn' } as const, null as number | null)
const callFilter = atom({ plugin: 'ashpack-status', key: 'callFilter' } as const, 'all' as CallKind | 'all')
const callLimit = atom({ plugin: 'ashpack-status', key: 'callLimit' } as const, CALL_ROWS)

// ── status rows: data ────────────────────────────────────────────────────────

// Effort arrives only on the classic hook inputs, so the grid shows what the
// last one said. (The permission mode is the engine's own hint line, just below.)
let effort: string | undefined
const see = (e: { effort?: { level: string } }): void => {
  effort = e.effort?.level ?? effort
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

// The last PR answer, per branch, kept as its promise so refreshes that overlap share one
// `gh` call: GitHub is asked again only after PR_TTL_MS.
let prSeen: { branch: string; at: number; pr: Promise<PullRequest | null> } | undefined

function pullRequest($: EngineInterface, branch: string, now: number): Promise<PullRequest | null> {
  if (prSeen?.branch === branch && now - prSeen.at < PR_TTL_MS) return prSeen.pr
  const pr = run($, ['gh', 'pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'], GH_MS).then(out => (out === null ? null : parsePr(out)))
  prSeen = { branch, at: now, pr }
  return pr
}

// The git directory, per folder: it does not move under a session, so it is asked once.
let gitDir: { cwd: string; dir: string } | undefined
// `git status` prints the stashes from git 2.35 on, and no line for none; an older git is
// asked with `git stash list`. Its version is asked once.
let isStashPrinted: Promise<boolean> | undefined

async function stashCount($: EngineInterface, git: GitInfo): Promise<number> {
  if (git.stashes !== undefined) return git.stashes
  isStashPrinted ??= run($, [...GIT, 'version']).then(out => printsStash(out ?? ''))
  if (await isStashPrinted) return 0
  const out = await run($, [...GIT, 'stash', 'list'])
  return out === null ? 0 : out.split('\n').filter(Boolean).length
}

// The working tree's extras: an operation under way (named by what the git directory holds), the stashes.
async function treeExtras($: EngineInterface, cwd: string, git: GitInfo): Promise<Pick<RepoInfo, 'operation' | 'stashes'>> {
  const [dir, stashes] = await Promise.all([gitDir?.cwd === cwd ? gitDir.dir : run($, [...GIT, 'rev-parse', '--absolute-git-dir']).then(out => out?.trim()), stashCount($, git)])
  if (dir) gitDir = { cwd, dir }
  const names = dir ? await $.fs.list(dir).then(list => list.map(f => f.name), () => []) : []
  return { operation: operationOf(names), stashes }
}

// Applies `change` to the chips' data as held by now, so a late answer never undoes a newer
// one; written only on a change, since every write makes the desktop app re-lay out the transcript.
async function writeStatus($: EngineInterface, change: (held: StatusData | null) => StatusData | null): Promise<void> {
  const held = await read($, status)
  if (JSON.stringify(change(held)) !== JSON.stringify(held)) await update($, status, change)
}

async function loadStatus($: EngineInterface): Promise<void> {
  const [isOn, hidden, held] = await Promise.all([read($, statusOn), read($, hiddenChips), read($, status)])
  const wants = isOn ? CHIP_IDS.filter(id => !hidden.includes(id)) : []
  // Git runs only for a chip that shows the repo; the Activity page's tiles read the usage alone.
  const readsGit = wants.some(id => GIT_CHIPS.includes(id))
  const porcelain = readsGit ? run($, [...GIT, 'status', '--porcelain=v2', '--branch', '--show-stash']).then(out => (out === null ? null : parseGit(out))) : (held?.git ?? null)
  const [model, usage, cwd, now, git] = await Promise.all([$.session.model(), $.session.usage(), $.session.cwd(), $.clock.now(), porcelain])
  await writeStatus($, s => statusData({ model, effort, usage, git, cwd, repo: s?.repo ?? {} }))
  if (!readsGit) return
  if (!git) return writeStatus($, s => s && { ...s, repo: {} })
  // The repo chips' data after, so they never hold up the others; the PR's last, when `gh`
  // answers, since it may take seconds.
  const [tree, diff, log] = await Promise.all([
    wants.includes('tree') ? treeExtras($, cwd, git) : {},
    wants.includes('lines') ? run($, [...GIT, 'diff', '--shortstat', 'HEAD']) : null,
    wants.includes('commit') ? run($, [...GIT, 'log', '-1', '--format=%ct%x1f%s']) : null,
  ])
  const repo = repoOf(wants, { tree, diff, log })
  const hasPr = wants.includes('pr')
  await writeStatus($, s => s && { ...s, repo: { ...repo, ...(hasPr && s.repo.pr !== undefined ? { pr: s.repo.pr } : {}) } })
  if (!hasPr) return
  void pullRequest($, git.branch, now)
    .then(pr => writeStatus($, s => (s?.git?.branch === git.branch ? { ...s, repo: { ...s.repo, pr } } : s)))
    .catch(err => $.ui.log(`ashpack status PR: ${String(err)}`, { to: 'debug' }))
}

let isLoading = false // a load runs: a refresh asked meanwhile waits for it
let isAskedAgain = false // one was: one more load once it ends, for what changed since it read
let statusTimer: Timer | undefined // the 30 s refresh

// Never lets the status rows break the event they ride on. One load at a time, so they write
// in order, and the asks of a turn's end (four events) fold into one more load.
function refreshStatus($: EngineInterface): void {
  if (isLoading) {
    isAskedAgain = true
    return
  }
  isLoading = true
  void loadStatus($)
    .catch(err => $.ui.log(`ashpack status: ${String(err)}`, { to: 'debug' }))
    .finally(() => {
      isLoading = false
      if (!isAskedAgain) return
      isAskedAgain = false
      refreshStatus($)
    })
}

type StatusSite = RenderInput<'PromptHint'> | RenderInput<'AbovePrompt'>
type PaneInput = RenderInput<'Pane'>
type Site = StatusSite | PaneInput

// A span of text, as a chip, a row or the Activity page draws it.
function spanText($: EngineInterface, e: Site, sp: TextSpan, key: string) {
  const { Text } = $.ui.resolve(e)
  return <Text key={key} color={sp.color} dimColor={sp.dim} bold={sp.bold}>{sp.text}</Text>
}

// A row: its spans cut to fit (in `width` when given), what sits at its right after them.
function rowView($: EngineInterface, e: Site, row: Row, key: string, width?: number) {
  const { Box, Text } = $.ui.resolve(e)
  const spans = <Text wrap="truncate-end">{row.spans.map((sp, i) => spanText($, e, sp, `${key}-${i}`))}</Text>
  return (
    <Box key={key} justifyContent="space-between" columnGap={1}>
      {width === undefined ? spans : <Box width={width}>{spans}</Box>}
      {row.right ? spanText($, e, row.right, `${key}-right`) : null}
    </Box>
  )
}

// The chips as a tree. The desktop: one strip, the bars as images (its font sets the
// segment glyphs at odd heights), wide gaps between the chips. The terminal: a spaced
// row of text. Both wrap when the row is short.
function drawChips($: EngineInterface, e: StatusSite, data: StatusData, now: number, total: number, colors: Colors, shown: readonly ChipId[]) {
  const { Box, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  const chips = statusChips(data, now, chipBarWidth(total), colors, isTerminal, shown)
  // Svg is not in the terminal's table: resolved only off it.
  const Svg = e.surface === 'terminal' ? null : $.ui.resolve(e).Svg
  return (
    <Box flexWrap="wrap" columnGap={isTerminal ? 2 : 3} rowGap={isTerminal ? 0 : 1}>
      {chips.map(({ id, cell }, c) => (
        // Keyed for the AshPack host, which lifts each chip into its strip.
        <Box key={`ashpack-chip:${id}`} alignItems="center">
          {cell.map((sp, i) => {
            const key = `cell-${c}-${i}`
            if (!isBar(sp)) return spanText($, e, sp, key)
            if (isTerminal || !Svg) return <Text key={key}>{barSpans(sp).map((t, j) => spanText($, e, t, `${key}-${j}`))}</Text>
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

// The skin's colours, or null with no Skins mod or skins off. Reading them while drawing
// redraws the site when the skin changes; a draw reads them once.
async function skinColors($: EngineInterface): Promise<Colors | null> {
  const [palette, accent] = await Promise.all([$.state.get(SKIN_PALETTE as never).catch(() => undefined), $.state.get(SKIN_ACCENT as never).catch(() => undefined)])
  if (isColors(palette?.value)) return palette.value
  const a: unknown = accent?.value
  return typeof a === 'string' && a !== '' ? { ...COLORS, accent: a } : null
}

// The chips, the popup and the Activity page draw in the skin's palette when one is on, else AshPack's own.
const colorsOf = async ($: EngineInterface): Promise<Colors> => (await skinColors($)) ?? COLORS

// ── compact mode ─────────────────────────────────────────────────────────────

let frames: Timer | undefined // the terminal popup's wave
let seconds: Timer | undefined // the terminal Activity page's running time
let terminalSeen = false // a terminal has drawn: the wave has a reader
// The history's turn count, kept here so a turn's start reads no history; read once after a
// load (a hot reload keeps the history, not this).

// A timer that bumps a counter, which draws again whatever reads it. The timer is the
// counter's only writer, so it writes straight, no read first.
function ticking($: EngineInterface, ms: number, write: (n: number) => Promise<unknown>): Timer {
  let n = 0
  return $.clock.every(ms, () => void write((n = (n + 1) % 100_000)))
}

const stop = (timer: Timer | undefined): undefined => void timer?.cancel()

// The popup's wave moves on the terminal alone (the desktop's animates itself), and only
// while compact mode is on and a turn runs: nothing else reads it.
async function syncFrames($: EngineInterface): Promise<void> {
  const isWanted = terminalSeen && (await read($, compact)) && (await read($, activity)) !== null
  frames = isWanted ? (frames ?? ticking($, FRAME_MS, n => $.state.set(FRAME, n))) : stop(frames)
}

// The terminal Activity page ticks a running turn's time once a second while it shows it.
function tickSeconds($: EngineInterface, isWanted: boolean): void {
  seconds = isWanted ? (seconds ?? ticking($, SECOND_MS, n => $.state.set(SECOND, n))) : stop(seconds)
}

async function resetActivity($: EngineInterface): Promise<void> {
  frames = stop(frames)
  tickSeconds($, false)
  if ((await read($, activity)) !== null) await update($, activity, () => null)
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

// A /clear or a resume starts the Activity page over: the process goes on as another
// session, and no session.start fires for it.
async function clearHistory($: EngineInterface): Promise<void> {
  await resetActivity($)
  await Promise.all([update($, history, () => NO_HISTORY), update($, shownTurn, () => null), showCalls($, 'all')])
}

// The running section's loader: redrawn per frame on the terminal; an SVG that
// animates itself elsewhere, so the desktop never redraws for it.
function loader($: EngineInterface, e: RenderInput<'AbovePrompt'>, f: number, cells: number, color: string) {
  if (e.surface !== 'terminal') {
    const { Svg } = $.ui.resolve(e)
    return <Svg key="loader" source={waveSvg(color, LOADER_PX)} alt="Working" />
  }
  const { Text } = $.ui.resolve(e)
  return <Text key="loader" color={color}>{wave(f, Math.min(cells, LOADER_CELLS))}</Text>
}

// The working popup, half the band wide: the running step with the loader beside it, then a
// card per kind of call (`Read 4`, `Command 3`) and one for the task list. A card pressed
// open lists its calls (or the tasks) under the cards; pressed again, it folds.
async function drawPopup($: EngineInterface, e: RenderInput<'AbovePrompt'>) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  // Reading `frame` redraws per tick: the terminal only.
  const [a, list, open, skin, f, now] = await Promise.all([read($, activity), read($, plan), read($, openCard), skinColors($), isTerminal ? read($, frame) : 0, $.clock.now()])
  const c = skin ?? COLORS
  const v = popupView(a, list, open, e.props, isTerminal, now)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={c.accent} paddingX={1} width={v.width}>
      <Box justifyContent="space-between" columnGap={2}>
        <Text wrap="truncate-end">
          <Text bold color={c.accent}>◆ AshPack</Text>
          {v.task ? <Text dimColor> {v.task.title}</Text> : null}
        </Text>
        <Text dimColor>{v.facts.join(' · ')}</Text>
      </Box>
      <Box columnGap={1}>
        <Box width={v.titleWidth}>
          <Text wrap="truncate-end" bold color={c.accent}>▸ {v.line}…</Text>
        </Box>
        {loader($, e, f, v.inner - v.titleWidth - 1, skin?.accent ?? BLUE)}
      </Box>
      {v.cards.length > 0 ? (
        <Box flexWrap="wrap" columnGap={2}>
          {v.cards.map(k => (
            <Button
              key={`card-${k.id}`}
              plain
              {...(isTerminal ? { hotkey: k.hotkey } : {})}
              dimColor={v.shownOpen !== null && v.shownOpen !== k.id}
              label={v.shownOpen === k.id ? `${k.label} ▾` : k.label}
              onPress={() => update($, openCard, o => (o === k.id ? null : k.id))}
            />
          ))}
        </Box>
      ) : null}
      {v.opened && v.opened.earlier > 0 ? <Text dimColor>{`  +${v.opened.earlier} earlier`}</Text> : null}
      {v.opened ? v.opened.shown.map(call => rowView($, e, callRowOf(call, c), `call-${call.id}`, Math.max(10, v.inner - 8))) : null}
      {v.tasks.map((s, i) => (
        <Text key={`task-${i}`} wrap="truncate-end" bold={s.state === 'now'} color={s.state === 'now' ? c.accent : s.state === 'done' ? c.ok : undefined} dimColor={s.state === 'todo'}>
          {MARK[s.state]} {s.title}
        </Text>
      ))}
    </Box>
  )
}

// ── the Activity page ────────────────────────────────────────────────────────

// Everything the page reads, in one go. The terminal ticks a running turn's time once a
// second (`second`); the desktop's wave animates itself, so it never redraws for it.
async function activityInputs($: EngineInterface, e: PaneInput): Promise<ActivityView> {
  const [held, h, picked, filter, limit, data, c, now] = await Promise.all([read($, activity), read($, history), read($, shownTurn), read($, callFilter), read($, callLimit), read($, status), colorsOf($), $.clock.now()])
  const v = activityView({ held, history: h, picked, filter, limit, data, c, now })
  if (e.surface !== 'terminal') return v // only a terminal's drawing starts or stops the terminal's tick
  const isTicking = v.shown?.isLive === true
  tickSeconds($, isTicking)
  if (isTicking) await read($, second)
  return v
}

async function showTurn($: EngineInterface, n: number | null): Promise<void> {
  // Only a change is written: each write redraws.
  if ((await read($, shownTurn)) !== n) await update($, shownTurn, () => n)
  await showCalls($, 'all')
}

// The calls in view under a filter, the latest CALL_ROWS of them again.
async function showCalls($: EngineInterface, filter: CallKind | 'all'): Promise<void> {
  const [held, limit] = await Promise.all([read($, callFilter), read($, callLimit)])
  if (held !== filter) await update($, callFilter, () => filter)
  if (limit !== CALL_ROWS) await update($, callLimit, () => CALL_ROWS)
}

// The kinds of the turn in view as filters for its calls (All first); the one on, bright. On
// the terminal each has a key: its card's letter, `l` for All.
function callFilters($: EngineInterface, e: PaneInput, v: ActivityView) {
  const { Box, Button } = $.ui.resolve(e)
  if (!v.shown || v.kinds.length === 0) return null
  const all = { id: 'all' as const, label: `All ${v.shown.calls.length}`, hotkey: 'l' }
  return (
    <Box key="activity-filters" flexWrap="wrap" columnGap={2}>
      {[all, ...v.kinds.map(k => ({ id: k.kind, label: `${k.label} ${k.count}`, hotkey: k.hotkey }))].map(k => (
        <Button key={`filter-${k.id}`} plain {...(e.surface === 'terminal' ? { hotkey: k.hotkey } : {})} dimColor={k.id !== v.kind} label={k.label} onPress={() => showCalls($, k.id)} />
      ))}
    </Box>
  )
}

// The calls before the ones listed, as a button that lists CALL_ROWS more.
function moreCalls($: EngineInterface, e: PaneInput, v: ActivityView) {
  const { Button } = $.ui.resolve(e)
  const label = `+ ${v.earlier} earlier · show ${Math.min(CALL_ROWS, v.earlier)} more`
  return v.earlier > 0 ? <Button key="activity-more" plain dimColor label={label} onPress={() => update($, callLimit, n => n + CALL_ROWS)} /> : null
}

// Every kept turn, the newest first, each a button that brings it into view.
function turnRows($: EngineInterface, e: PaneInput, v: ActivityView, chars: number) {
  const { Box, Button } = $.ui.resolve(e)
  return (
    <Box key="activity-turns" flexDirection="column">
      {[...v.bars].reverse().map(b => {
        const isLive = 'isLive' in b
        const mark = b.n === v.shown?.n ? '▸' : isLive ? '●' : ' '
        return <Button key={`turn-${b.n}`} plain dimColor={b.n !== v.shown?.n} label={`${mark} ${turnLabel({ ...b, ms: isLive ? undefined : b.ms }, chars - 2)}`} onPress={() => showTurn($, isLive ? null : b.n)} />
      })}
    </Box>
  )
}

function activityBack($: EngineInterface, e: PaneInput) {
  const { Button } = $.ui.resolve(e)
  return <Button key="activity-now" plain {...(e.surface === 'terminal' ? { hotkey: 'b' } : {})} label="← Back to now" onPress={() => showTurn($, null)} />
}

// The desktop: SVG cards (the head, the calls, the tiles, the chart), the filters and the
// turns as buttons between them, since a drawing takes no presses. The cards take no size:
// each is its markup's own, shrunk to fit a narrower pane. A long list of calls is several
// cards, each small enough for the desktop to draw.
function activityDesktop($: EngineInterface, e: PaneInput, v: ActivityView, w: number) {
  if (e.surface === 'terminal') return null
  const { Box, Svg, Text } = $.ui.resolve(e)
  return (
    <Box key="ashpack-page:Activity" flexDirection="column" rowGap={1}>
      {v.pick !== null ? activityBack($, e) : null}
      <Svg key="activity-hero" source={heroSvg(v.shown, v.c, w).source} alt={heroAlt(v.shown)} />
      {callFilters($, e, v)}
      {moreCalls($, e, v)}
      {chunks(v.calls, SVG_ROWS).map((part, i) => (
        <Svg key={`activity-calls-${i}`} source={callsSvg(part, 0, v.c, w).source} alt={part.map(x => `${x.state} ${x.kind} ${ellipsis(x.target, 60)}`).join('; ')} />
      ))}
      <Text key="activity-session-head" bold>This session</Text>
      <Svg key="activity-tiles" source={tilesSvg(v.tiles, v.context, v.c, w).source} alt={tilesAlt(v.tiles)} />
      {v.bars.length > 0 ? <Svg key="activity-chart" source={chartSvg(v.bars, v.c, w, v.pick).source} alt={`${v.bars.length} turns`} /> : null}
      {turnRows($, e, v, Math.floor(w / 7.5))}
    </Box>
  )
}

// The terminal: the same page in text, the head in a rounded box.
function activityTerminal($: EngineInterface, e: PaneInput, v: ActivityView, cols: number) {
  const { Box, Text } = $.ui.resolve(e)
  const hero = heroRows(v.shown, v.now, cols - 4, v.c)
  return (
    <Box key="ashpack-page:Activity" flexDirection="column" rowGap={1}>
      {v.pick !== null ? activityBack($, e) : null}
      <Box key="activity-hero" flexDirection="column" borderStyle="round" borderColor={hero.tone} paddingX={1}>
        {hero.rows.map((row, i) => rowView($, e, row, `hero-${i}`))}
      </Box>
      {callFilters($, e, v)}
      {v.calls.length > 0 ? (
        <Box key="activity-calls" flexDirection="column">
          {moreCalls($, e, v)}
          {v.calls.map(call => rowView($, e, callRowOf(call, v.c, { text: `${TAG[call.kind].padEnd(5)} `, color: kindColor(call.kind, v.c) }), `call-${call.id}`, Math.max(10, cols - 8)))}
        </Box>
      ) : null}
      <Text bold>This session</Text>
      <Box key="activity-tiles" flexWrap="wrap" rowGap={1}>
        {v.tiles.map(t => (
          <Box key={`tile-${t.label}`} flexDirection="column" width={Math.floor(cols / 3)}>
            <Text dimColor>
              {t.label.toUpperCase()}
              {t.sub ? <Text color={t.sub.color}>{` ${t.sub.text}`}</Text> : null}
            </Text>
            <Text bold>{t.value.map((sp, i) => spanText($, e, sp, `v-${t.label}-${i}`))}</Text>
          </Box>
        ))}
      </Box>
      {v.context !== undefined ? rowView($, e, { spans: contextRow(Math.round(v.context), cols, v.c) }, 'activity-context') : null}
      {v.bars.length > 0 ? rowView($, e, { spans: timelineRow(v.bars, cols, v.c, v.pick) }, 'activity-timeline') : null}
      {turnRows($, e, v, cols)}
    </Box>
  )
}

// The Activity page, or its key alone if drawing it fails: one page's fault never costs the
// drawer the others.
async function activityPage($: EngineInterface, e: PaneInput, columns: number) {
  try {
    const v = await activityInputs($, e)
    return e.surface === 'terminal' ? activityTerminal($, e, v, columns) : activityDesktop($, e, v, pagePx(columns))
  } catch (err) {
    $.ui.log(`ashpack activity page: ${String(err)}`, { to: 'debug' })
    const { Box } = $.ui.resolve(e)
    return <Box key="ashpack-page:Activity" />
  }
}

// The drawer's Activity tab: the page while the drawer shows it, else its key alone, so the
// drawer never redraws for the turn while another page is up.
async function activityTab($: EngineInterface, e: PaneInput) {
  const page: unknown = (await $.state.get(HOST_PAGE as never).catch(() => undefined))?.value
  // The drawer pads its pages by a cell each side.
  if (page === 'activity') return activityPage($, e, e.props.bodyColumns - 2)
  if (e.surface === 'terminal') tickSeconds($, false)
  const { Box } = $.ui.resolve(e)
  return <Box key="ashpack-page:Activity" />
}

// ── the Status page: in the AshPack drawer, or a pane of its own ─────────────

// An ON/OFF switch, the same in every row.
function switchButton($: EngineInterface, e: PaneInput, key: string, isOn: boolean, onPress: () => unknown) {
  const { Button } = $.ui.resolve(e)
  return <Button key={key} plain dimColor={!isOn} label={isOn ? '● ON ' : '○ OFF'} onPress={onPress} />
}

// A toggle as a setting: its name and what it does on the left, the switch on the right.
function settingRow($: EngineInterface, e: PaneInput, key: string, label: string, hint: string, isOn: boolean, onPress: () => unknown) {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box key={`setting-${key}`} justifyContent="space-between" columnGap={2}>
      <Box flexDirection="column" flexShrink={1}>
        <Text bold>{label}</Text>
        <Text dimColor>{hint}</Text>
      </Box>
      {switchButton($, e, key, isOn, onPress)}
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
      {switchButton($, e, `chip-${chip.id}`, isOn, () => toggleChip($, chip.id))}
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

// A switch or a pick that survives sessions: the atom's write (spelled out at the call, so
// the engine can list it), then the store.
async function save<T>($: EngineInterface, key: string, write: Promise<T>): Promise<T> {
  const value = await write
  await $.store.set(key, value)
  return value
}

async function toggle($: EngineInterface, which: 'compact' | 'statusOn'): Promise<boolean> {
  if (which === 'compact') {
    const isOn = await save($, COMPACT_KEY, update($, compact, v => !v))
    await syncFrames($) // a turn under way starts or stops its wave
    return isOn
  }
  const isOn = await save($, STATUS_KEY, update($, statusOn, v => !v))
  refreshStatus($) // the repo chips fetch nothing while the chips are off
  return isOn
}

async function toggleChip($: EngineInterface, id: ChipId): Promise<void> {
  await save($, CHIPS_KEY, update($, hiddenChips, list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])))
  refreshStatus($) // a repo chip turned on fetches its data now, not at the next tick
}

async function moveChipBy($: EngineInterface, id: ChipId, by: -1 | 1, listed: readonly ChipId[]): Promise<void> {
  await save($, ORDER_KEY, update($, orderedChips, order => moveChip(order, id, by, listed)))
}

// A row compact mode leaves out: dropped on the terminal, empty on the desktop app (which
// draws its own row for a `display: none` answer).
function emptyRow($: EngineInterface, e: RenderInput<'ToolUse'> | RenderInput<'ToolResult'> | RenderInput<'ToolGroup'>) {
  const { Box } = $.ui.resolve(e)
  return e.surface === 'terminal' ? <Box display="none" /> : <Box />
}

export const register: Register = on => {
  // ── shared events ──
  on('session.start', async ($, e, next) => {
    const [storedCompact, storedStatus, storedChips, storedOrder] = await Promise.all([$.store.get(COMPACT_KEY), $.store.get(STATUS_KEY), $.store.get(CHIPS_KEY), $.store.get(ORDER_KEY)])
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
    const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
    effort = typeof settings.effortLevel === 'string' ? settings.effortLevel : effort
    refreshStatus($)
    statusTimer?.cancel()
    statusTimer = $.clock.every(STATUS_TICK_MS, () => refreshStatus($))
    return started
  })

  on('turn.start', async ($, e, next) => {
    // The session's cost now, so the turn's own is the difference when it ends.
    const [now, usage, pick, list] = await Promise.all([$.clock.now(), $.session.usage().catch(() => null), read($, shownTurn), read($, plan)])
    const turns = (await read($, history)).totals.turns
    const cost = usage?.cost ? { costAtStart: usage.cost.usd } : {}
    await update($, activity, () => ({ n: turns + 1, prompt: ellipsis(oneLine(String(e.text ?? '')), PROMPT_CHARS), startedAt: now, steps: [], calls: [], ...cost }))
    // Following the work, the new turn's calls show whole, not under the last turn's filter.
    if (pick === null) await showCalls($, 'all')
    // A finished task list is the last turn's; a new one starts empty.
    if (list.length > 0 && list.every(s => s.status === 'completed')) await update($, plan, () => [])
    await syncFrames($)
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
    if (e.reason === 'clear' || e.reason === 'resume') await clearHistory($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The drawer or the Activity pane closing stops the page's ticks.
  on('ui.close', ($, e, next) => ((e.id === DRAWER || e.id === ACTIVITY_PANE) && tickSeconds($, false), next(e))).catch(($, e, next) => next(e))

  // ── status rows: when to refresh ──
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    refreshStatus($)
    return result
  })
  on('classic.SessionStart', ($, e, next) => (see(e), refreshStatus($), next(e))).catch(($, e, next) => next(e))
  on('classic.UserPromptSubmit', ($, e, next) => (see(e), refreshStatus($), next(e))).catch(($, e, next) => next(e))
  // Effort holds for a turn; the prompt's hook may not carry it, so a call's says it before the turn ends.
  on('classic.PostToolUse', ($, e, next) => (see(e), next(e))).catch(($, e, next) => next(e))
  on('classic.Stop', ($, e, next) => (see(e), refreshStatus($), next(e))).catch(($, e, next) => next(e))
  // /model, the picker or a fallback: the model chip follows at once, not at the next tick.
  on('classic.PostModelSwitch', ($, e, next) => (refreshStatus($), next(e))).catch(($, e, next) => next(e))

  // ── compact mode: what the popup says, and the task list it splits into sections ──
  on('tool.call', async ($, e, next) => {
    // Only the model's own calls are steps. A plugin's call (Baton lists the sessions every
    // 20 s) is not, and outside a turn there is nothing to show: no write for either. A
    // subagent's call is the popup's line alone: no write while compact mode is off.
    const isMain = !e.agentId
    if (next.origin.plugin !== 'engine' || (await read($, activity)) === null || (!isMain && !(await read($, compact)))) return next(e)
    const tool = String(e.tool)
    const line = callOf(tool, e, isMain ? await $.session.cwd().catch(() => '') : '')
    const call = isMain && isListed(tool) ? line : null // a subagent's calls are its own; its Agent card counts it
    const id = e.tool_use_id
    const startedAt = await $.clock.now()
    await update($, activity, a => a && startCall(a, id, line.label, call))
    if (isMain && e.tool === 'TodoWrite') await update($, plan, () => planFromTodos(e.todos))
    if (isMain && e.tool === 'TaskUpdate') await update($, plan, p => updateTask(p, e))
    const result = await next(e)
    if (isMain && e.tool === 'TaskCreate') {
      const taskId = (result.result as { task?: { id?: unknown } } | undefined)?.task?.id
      if (typeof taskId === 'string') await update($, plan, p => addTask(p, taskId, e.subject))
    }
    // The call settles: failed, or done with an edit's size; the line goes to the latest call
    // still running.
    const ms = (await $.clock.now()) - startedAt
    const isFailed = result.deny !== undefined || result.isError === true
    const size = call?.kind === 'edit' && !isFailed ? editSize(result.result) : undefined
    await update($, activity, a => a && settleCall(a, id, { isFailed, ms, size }))
    return result
  }).catch(($, e, next) => next(e))

  // ── compact mode: no tool rows, in the ctrl+o transcript too ──
  // Its rows are ToolUse rows (an expanded group unfolds into them), and a ToolUse hook
  // cannot tell them apart: turn compact mode off to read every call. The terminal drops the
  // row (display none); the desktop app draws its own row for a `display: none` answer, so
  // there it gets an empty one.
  on('ui.render', { component: ['ToolUse', 'ToolResult'] }, async ($, e, next) => ((await read($, compact)) ? emptyRow($, e) : next(e)))
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => (e.props.isExpanded || !(await read($, compact)) ? next(e) : emptyRow($, e)))
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => ((await read($, compact)) ? next({ ...e, props: { ...e.props, hint: '' } }) : next(e)))

  // ── the band above the prompt: the working popup or the status rows, then other mods' band ──
  // Compact mode is read first, and only while Claude works: off, the band reads nothing of
  // the turn and never draws again for a call. The popup reads the turn; the chips, their data.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    if (e.surface === 'terminal') terminalSeen = true
    const { Box } = $.ui.resolve(e)
    if (e.props.isWorking && (await read($, compact))) {
      return (
        <Box flexDirection="column">
          {await drawPopup($, e)}
          {below}
        </Box>
      )
    }
    if (isUnderPrompt(e)) return below
    const [isOn, data, now, colors, shown] = await statusInputs($)
    if (!isOn || data === null) return below
    return (
      <Box flexDirection="column">
        {drawChips($, e, data, now, e.props.bodyColumns, colors, shown)}
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
    return (
      <Box flexDirection="column" paddingX={e.requestId === PANE ? 1 : 0}>
        {below}
        {statusPage($, e, isCompactOn, isStatusOn, order, hidden)}
        {e.requestId === DRAWER ? await activityTab($, e) : null}
      </Box>
    )
  })
}
