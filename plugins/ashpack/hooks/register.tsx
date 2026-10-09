import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput, Timer } from 'claude-code'

import type { Activity, PackMod, Section, StatusData } from '../types'
import type { Cell, Page, Segment } from './format'
import {
  addTask,
  around,
  COLORS,
  describeTool,
  findPages,
  gridBarWidth,
  gridWidths,
  parseGit,
  packMods,
  planFromTodos,
  popupWidth,
  scanner,
  scannerSvg,
  segments,
  statusGrid,
  TRAIL,
  updateTask,
} from './format'

// AshPack. Everything that touches `$` lives in this one file (the engine
// follows `$` only into functions of the same file):
//   - status grid: 2 rows x 3 sections under the prompt, above the engine's hint
//     line ("auto mode on"); outside fullscreen, where that line is one row,
//     it moves to the band above the prompt
//   - compact mode: tool rows hidden, a working popup above the prompt
//   - drawer: "◆ AshPack" in the footer opens a side pane of pages: Home (the
//     toggles), a page for each mod that draws one into the pane, and Mods
// The drawer needs ashpack outermost: first in enabledPlugins (settings.json),
// so the mods' pages are in the tree its pane hook gets from `next`.

const DRAWER = 'ashpack' // the drawer pane's id; mods hook its render to add a page
const DRAWER_COLUMNS = 64
const STATUS_TICK_MS = 30_000
const FRAME_MS = 120
const GRID_GAP = 2 // columns between a status section's text and the next "│"
const POPUP_ROWS = 5 // sections the working popup shows at most
const LOADER_DOTS = 40 // the desktop loader's width, in dots
const ACCENT = COLORS.accent
const BLUE = COLORS.blue
const PACK = 'ashpack' // the marketplace the pack's mods come from
const CLI_TIMEOUT_MS = 120_000
const COMPACT_KEY = 'compact' // $.store keys: toggles survive sessions
const STATUS_KEY = 'statusOn'

const compact = atom({ plugin: 'ashpack', key: 'compact' } as const, false)
const statusOn = atom({ plugin: 'ashpack', key: 'statusOn' } as const, true)
const activity = atom({ plugin: 'ashpack', key: 'activity' } as const, null as Activity | null)
const frame = atom({ plugin: 'ashpack', key: 'frame' } as const, 0)
const status = atom({ plugin: 'ashpack', key: 'status' } as const, null as StatusData | null)
const drawerOpen = atom({ plugin: 'ashpack', key: 'drawerOpen' } as const, false)
const page = atom({ plugin: 'ashpack', key: 'page' } as const, 'home')
const plan = atom({ plugin: 'ashpack', key: 'plan' } as const, [] as Section[])
const pack = atom({ plugin: 'ashpack', key: 'pack' } as const, [] as PackMod[])
const packBusy = atom({ plugin: 'ashpack', key: 'packBusy' } as const, null as string | null)

// ── status rows: data ────────────────────────────────────────────────────────

type Seen = { effort?: string }

// Effort arrives only on the classic hook inputs, so the grid shows what the
// last one said. (The permission mode is the engine's own hint line, just below.)
let seen: Seen = {}
const see = (e: { effort?: { level: string } }): void => {
  seen = { effort: e.effort?.level ?? seen.effort }
}

async function gitInfo($: EngineInterface) {
  try {
    const { exitCode, stdout } = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 3000 })
    return exitCode === 0 ? parseGit(stdout) : null
  } catch {
    return null
  }
}

async function seenFromSettings($: EngineInterface): Promise<Seen> {
  const s = await $.settings.read()
  return { effort: typeof s.effortLevel === 'string' ? s.effortLevel : undefined }
}

async function loadStatus($: EngineInterface): Promise<void> {
  const [model, usage, git, cwd] = await Promise.all([$.session.model(), $.session.usage(), gitInfo($), $.session.cwd()])
  const data: StatusData = {
    model,
    effort: seen.effort,
    contextPercent: usage.context.percent,
    rateLimits: usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    git,
    folder: cwd.split('/').pop() || cwd,
    costUsd: usage.cost?.usd,
    startedAt: usage.startedAt,
  }
  await update($, status, () => data)
}

// Never lets the status rows break the event they ride on.
function refreshStatus($: EngineInterface): void {
  void loadStatus($).catch(err => $.ui.log(`ashpack status: ${String(err)}`, { to: 'debug' }))
}

// The grid as a tree: each section a fixed-width Box, so the rows line up.
function drawGrid($: EngineInterface, e: RenderInput<'PromptHint'> | RenderInput<'AbovePrompt'>, data: StatusData, now: number, total: number) {
  const { Box, Text } = $.ui.resolve(e)
  const grid = statusGrid(data, now, gridBarWidth(total))
  const widths = gridWidths(grid, GRID_GAP)
  const cell = (spans: Cell, key: string) => (
    <Text key={key} wrap="truncate-end">
      {spans.map((sp, i) => (
        <Text key={`${key}-${i}`} color={sp.color} dimColor={sp.dim} bold={sp.bold}>
          {sp.text}
        </Text>
      ))}
    </Text>
  )
  return (
    <Box flexDirection="column">
      {grid.map((row, r) => (
        <Box key={`row-${r}`}>
          {row.map((spans, c) => (
            // The last section takes what is left, cut at the row's end.
            <Box key={`sec-${r}-${c}`} width={c < row.length - 1 ? widths[c] : undefined} paddingRight={GRID_GAP}>
              {c > 0 ? <Text dimColor>│ </Text> : null}
              {cell(spans, `cell-${r}-${c}`)}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// ── compact mode ─────────────────────────────────────────────────────────────

let ticker: Timer | undefined

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function resetActivity($: EngineInterface): Promise<void> {
  stopTicker()
  await update($, activity, () => null)
}

function isCompact($: EngineInterface): Promise<boolean> {
  return read($, compact)
}

const seconds = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// The running section's loader: redrawn per frame on the terminal; an SVG that
// animates itself elsewhere, so the desktop never redraws for it.
function loader($: EngineInterface, e: RenderInput<'AbovePrompt'>, f: number, cells: number) {
  if (e.surface !== 'terminal') {
    const { Svg } = $.ui.resolve(e)
    return <Svg key="loader" source={scannerSvg(BLUE, LOADER_DOTS)} alt="Working" />
  }
  const { Text } = $.ui.resolve(e)
  const runs = scanner(f, cells).match(/·+|[^·]+/g) ?? []
  return (
    <Text key="loader">
      {runs.map((run, i) => (
        <Text key={`run-${i}`} color={BLUE} dimColor={run.startsWith('·')}>
          {run}
        </Text>
      ))}
    </Text>
  )
}

const MARK: Record<Segment['state'], string> = { done: '✓', now: '▸', todo: '○' }

// The working popup, half the band wide: what it is doing, then a row per section,
// the finished ones ticked and the running one with the loader beside it.
async function drawPopup($: EngineInterface, e: RenderInput<'AbovePrompt'>, a: Activity | null, now: number) {
  const { Box, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  // Reading `frame` redraws per tick: the terminal only.
  const [list, f] = await Promise.all([read($, plan), isTerminal ? read($, frame) : 0])
  const width = popupWidth(e.props.bodyColumns)
  const inner = width - 4 // border and padding
  const titleWidth = Math.floor(inner * 0.55)
  const isTrail = list.length === 0
  const segs = around(segments(list, a?.label ?? 'Thinking', a?.trail ?? []), POPUP_ROWS)
  const done = list.filter(s => s.status === 'completed').length
  const facts = [
    list.length > 0 ? `${done}/${list.length}` : '',
    a && isTerminal ? seconds(now - a.startedAt) : '', // the desktop draws no ticks, so the time would stand still
    a && a.steps > 0 ? `${a.steps} step${a.steps === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1} width={width}>
      <Box justifyContent="space-between" columnGap={2}>
        <Text wrap="truncate-end">
          <Text bold color={ACCENT}>
            ◆ AshPack
          </Text>
          {/* The trail's running section names the step; a task list's sections are the tasks. */}
          {isTrail ? null : <Text> {a?.label ?? 'Working'}…</Text>}
        </Text>
        <Text dimColor>{facts.join(' · ')}</Text>
      </Box>
      {segs.map((s, i) => (
        <Box key={`seg-${i}`} columnGap={1}>
          <Box width={titleWidth}>
            <Text
              wrap="truncate-end"
              bold={s.state === 'now'}
              color={s.state === 'now' ? ACCENT : s.state === 'done' ? COLORS.ok : undefined}
              dimColor={s.state === 'todo'}
            >
              {MARK[s.state]} {s.title}
              {s.state === 'now' && isTrail ? '…' : ''}
            </Text>
          </Box>
          {s.state === 'now' ? loader($, e, f, inner - titleWidth - 1) : null}
        </Box>
      ))}
    </Box>
  )
}

// ── drawer ───────────────────────────────────────────────────────────────────

// The pack's mods: its marketplace's catalog, against what is installed and on.
async function loadPack($: EngineInterface): Promise<void> {
  try {
    const home = await $.env.get('HOME')
    const [known, installed, settings] = await Promise.all([
      $.fs.read(`${home}/.claude/plugins/known_marketplaces.json`),
      $.fs.read(`${home}/.claude/plugins/installed_plugins.json`),
      $.settings.read(),
    ])
    const where = (JSON.parse(known) as Record<string, { installLocation?: string }>)[PACK]?.installLocation
    if (!where) throw new Error(`marketplace "${PACK}" is not added`)
    const catalog = await $.fs.read(`${where}/.claude-plugin/marketplace.json`)
    const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>
    await update($, pack, () => packMods(catalog, installed, enabled, PACK))
  } catch (err) {
    $.ui.log(`ashpack mods: ${String(err)}`, { to: 'debug' })
    await update($, pack, () => [])
  }
}

// A mod's button: on -> disable, off -> enable, missing -> install; null updates the pack.
// A mod cannot reload plugins, so the prompt box is handed "/reload-plugins" to send.
async function packAction($: EngineInterface, mod: PackMod | null): Promise<void> {
  if ((await read($, packBusy)) !== null) return
  const installed = (await read($, pack)).filter(m => m.state !== 'missing')
  const runs: string[][] = mod
    ? [['claude', 'plugin', mod.state === 'on' ? 'disable' : mod.state === 'off' ? 'enable' : 'install', `${mod.name}@${PACK}`]]
    : [['claude', 'plugin', 'marketplace', 'update', PACK], ...installed.map(m => ['claude', 'plugin', 'update', `${m.name}@${PACK}`])]
  await update($, packBusy, () => mod?.name ?? 'update')
  try {
    for (const argv of runs) {
      const { exitCode, stdout, stderr } = await $.process.run(argv, { timeoutMs: CLI_TIMEOUT_MS })
      if (exitCode !== 0) throw new Error((stderr || stdout).trim().split('\n')[0] || `${argv.join(' ')} failed`)
    }
    const done = mod ? `${mod.name} ${mod.state === 'on' ? 'off' : mod.state === 'off' ? 'on' : 'installed'}` : 'Pack updated'
    $.ui.toast(`AshPack: ${done}. Press Enter to reload plugins.`)
    await $.prompt.fill({ text: '/reload-plugins' })
  } catch (err) {
    $.ui.toast(`AshPack: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, packBusy, () => null)
    await loadPack($)
  }
}

// The drawer is a side pane on every surface (docked beside a fullscreen
// transcript, inline above the prompt on the terminal's main screen).
async function openDrawer($: EngineInterface, pageId?: string): Promise<void> {
  if (pageId) await update($, page, () => pageId)
  await loadPack($)
  await update($, drawerOpen, () => true)
  await $.ui.open({ id: DRAWER, title: 'AshPack', focus: true, closeOnEscape: true, columns: DRAWER_COLUMNS })
}

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

function homePage($: EngineInterface, e: PaneInput, isCompactOn: boolean, isStatusOn: boolean, pages: readonly Page[]) {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box key="page-home" flexDirection="column" rowGap={1}>
      {settingRow($, e, 'compact', 'Compact mode', COMPACT_HINT[e.surface === 'terminal' ? 'terminal' : 'app'], isCompactOn, () => toggle($, 'compact'))}
      {settingRow($, e, 'status', 'Status rows', 'Model, branch, context and usage by the prompt.', isStatusOn, () => toggle($, 'statusOn'))}
      <Text dimColor>
        {pages.length > 0
          ? `Pages from your mods: ${pages.map(p => p.label).join(', ')}.`
          : 'Mods that support AshPack show their own page here.'}
      </Text>
    </Box>
  )
}

// The desktop app draws tool calls itself (its "Ran 2 commands" groups) and ignores a mod's
// drawing of them, so there compact mode adds the popup and leaves the groups to the app.
const COMPACT_HINT = {
  terminal: 'Tool rows fold away; a popup above the prompt shows the work.',
  app: 'Adds the work popup above the prompt. The app keeps its own tool groups.',
} as const

const ACTION: Record<PackMod['state'], string> = { on: 'turn off', off: 'turn on', missing: 'install' }
const STATE: Record<PackMod['state'], [string, string | undefined]> = { on: ['●', COLORS.ok], off: ['○', undefined], missing: ['+', undefined] }

// The pack's mods, one row each with what a press does, then the pack's update.
function modsPage($: EngineInterface, e: PaneInput, mods: readonly PackMod[], busy: string | null) {
  const { Box, Button, Text } = $.ui.resolve(e)
  if (mods.length === 0) return <Text dimColor>No "{PACK}" marketplace found.</Text>
  return (
    <Box key="page-mods" flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        {mods.map(m => {
          const [mark, color] = STATE[m.state]
          return (
            <Box key={`mod-row-${m.name}`} justifyContent="space-between" columnGap={2}>
              <Text wrap="truncate-end">
                <Text color={m.name === PACK ? ACCENT : color} dimColor={m.state !== 'on'}>
                  {m.name === PACK ? '◆' : mark}
                </Text>
                <Text dimColor={m.state !== 'on'}> {m.name}</Text>
              </Text>
              {m.name === PACK ? (
                <Text dimColor>this pack</Text>
              ) : (
                <Button key={`mod-${m.name}`} plain dimColor label={busy === m.name ? '…' : ACTION[m.state]} onPress={() => packAction($, m)} />
              )}
            </Box>
          )
        })}
      </Box>
      <Box justifyContent="space-between" columnGap={2}>
        <Text dimColor>Changes apply after /reload-plugins.</Text>
        <Button key="mods-update" plain label={busy === 'update' ? '… updating' : '↻ update all'} onPress={() => packAction($, null)} />
      </Box>
    </Box>
  )
}

// The tab bar: a tab per page, the shown one lit and underlined (the terminal) or bright (elsewhere).
function tabBar($: EngineInterface, e: PaneInput, tabs: readonly { id: string; label: string }[], shown: string) {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box key="tabs" columnGap={2} flexWrap="wrap">
      {tabs.map(t => {
        const isShown = t.id === shown
        return (
          <Box key={`tab-${t.id}`} flexDirection="column">
            <Button key={`page-${t.id}`} plain dimColor={!isShown} label={t.label} onPress={() => update($, page, () => t.id)} />
            {e.surface === 'terminal' ? (
              <Text color={isShown ? ACCENT : undefined} dimColor={!isShown}>
                {(isShown ? '━' : '─').repeat([...t.label].length)}
              </Text>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}

async function closeDrawer($: EngineInterface): Promise<void> {
  await update($, drawerOpen, () => false)
  await $.ui.close({ id: DRAWER })
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
  return isOn
}

// Warns once per session when another plugin sits above ashpack.
async function checkOrder($: EngineInterface): Promise<void> {
  const user = await $.settings.read({ source: 'user' })
  const first = Object.keys((user.enabledPlugins ?? {}) as Record<string, unknown>)[0]
  if (first && !first.startsWith('ashpack@')) {
    $.ui.toast('AshPack: put "ashpack@ashpack" first in enabledPlugins (~/.claude/settings.json) so the drawer can hold other mods.', {
      timeoutMs: 10_000,
    })
  }
}

export const register: Register = on => {
  // ── shared events ──
  on('session.start', async ($, e, next) => {
    const [storedCompact, storedStatus] = await Promise.all([$.store.get(COMPACT_KEY), $.store.get(STATUS_KEY)])
    await update($, compact, () => storedCompact === true)
    await update($, statusOn, () => storedStatus !== false)
    await resetActivity($)
    $.ui.status(undefined) // 0.1.0 pinned a plain-text line; the rows replace it
    await $.command.register({
      name: 'ashpack',
      description: 'Open the AshPack drawer; `/ashpack compact` or `/ashpack status` toggles one',
      argumentHint: '[compact|status]',
    })
    const started = await next(e)
    seen = await seenFromSettings($).catch(() => seen)
    refreshStatus($)
    $.clock.every(STATUS_TICK_MS, () => refreshStatus($))
    void checkOrder($).catch(() => undefined)
    return started
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, activity, () => ({ startedAt: now, label: 'Thinking', steps: 0, trail: [] }))
    // A finished task list is the last turn's; a new one starts empty.
    await update($, plan, p => (p.every(s => s.status === 'completed') ? [] : p))
    stopTicker()
    ticker = $.clock.every(FRAME_MS, () => void update($, frame, n => (n + 1) % 100_000))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      await resetActivity($)
      refreshStatus($)
    }
    return next(e)
  })

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

  // ── compact mode: what the popup says, and the task list it splits into sections ──
  on('tool.call', async ($, e, next) => {
    const label = describeTool(String(e.tool), e)
    await update($, activity, a => a && { ...a, label, steps: a.steps + 1 })
    const isMain = !e.agentId // a subagent's list is its own
    if (isMain && e.tool === 'TodoWrite') await update($, plan, () => planFromTodos(e.todos))
    if (isMain && e.tool === 'TaskUpdate') await update($, plan, p => updateTask(p, e))
    const result = await next(e)
    if (isMain && e.tool === 'TaskCreate') {
      const id = (result.result as { task?: { id?: unknown } } | undefined)?.task?.id
      if (typeof id === 'string') await update($, plan, p => addTask(p, id, e.subject))
    }
    // The step joins the trail; the line goes back to thinking unless another call took it.
    await update($, activity, a => a && { ...a, label: a.label === label ? 'Thinking' : a.label, trail: [...a.trail, label].slice(-TRAIL) })
    return result
  }).catch(($, e, next) => next(e))

  // ── compact mode: hidden rows (an invisible Box); ctrl+o still shows all ──
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await isCompact($))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await isCompact($))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded || !(await isCompact($))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) =>
    (await isCompact($)) ? next({ ...e, props: { ...e.props, hint: '' } }) : next(e),
  )

  // The popup replaces the engine's spinner line.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!(await isCompact($))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  // ── the band above the prompt: working popup, status rows, then other mods' band ──
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const [isOn, data, isCompactOn, a, now] = await Promise.all([
      read($, statusOn),
      read($, status),
      isCompact($),
      read($, activity),
      $.clock.now(),
    ])
    const showPopup = isCompactOn && e.props.isWorking
    // In fullscreen the grid sits under the prompt (PromptHint); here it is the fallback.
    const showStatus = isOn && data !== null && e.viewport?.isFullscreen !== true
    if (!showPopup && !showStatus) return below

    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns

    const popup = showPopup ? await drawPopup($, e, a, now) : null

    const rows = showStatus && data ? drawGrid($, e, data, now, cols) : null

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
    if (e.viewport?.isFullscreen !== true) return below
    const [isOn, data, now] = await Promise.all([read($, statusOn), read($, status), $.clock.now()])
    if (!isOn || data === null) return below
    const { Box } = $.ui.resolve(e)
    // Leave the right of the footer to the mode labels and the drawer.
    const total = Math.max(60, Math.min(150, (e.viewport?.columns ?? 120) - 34))
    return (
      <Box flexDirection="column">
        {drawGrid($, e, data, now, total)}
        {below}
      </Box>
    )
  })

  // ── footer: the mods that draw here (those without a drawer page), then "◆ AshPack" ──
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const isOpen = await read($, drawerOpen)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box columnGap={2}>
        {below}
        <Box>
          <Text color={ACCENT}>◆ </Text>
          <Button key="ashpack" plain label={isOpen ? 'AshPack ◂' : 'AshPack ▸'} onPress={() => (isOpen ? closeDrawer($) : openDrawer($))} />
        </Box>
      </Box>
    )
  })

  // The person closing the panel (Esc, its close mark) folds the drawer too.
  on('ui.close', async ($, e, next) => {
    if (e.id === DRAWER) await update($, drawerOpen, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'ashpack' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'compact' || arg === 'status') {
      const isOn = await toggle($, arg === 'compact' ? 'compact' : 'statusOn')
      return { text: `${arg === 'compact' ? 'Compact mode' : 'Status rows'} ${isOn ? 'on' : 'off'}.` }
    }
    // Any other word names a page (`/ashpack skins`); a page no mod draws shows Home.
    await openDrawer($, arg || undefined)
    return {}
  })

  // ── the drawer: a header, the tab bar, the shown page ──
  // The mods beneath draw their pages into `next(e)`'s tree; each keeps its own buttons.
  on('ui.render', { component: 'Pane', requestId: DRAWER }, async ($, e, next) => {
    // A mod whose page hook fails costs the pages, never the drawer.
    const below = await next(e).catch(err => ($.ui.log(`ashpack drawer pages: ${String(err)}`, { to: 'debug' }), null))
    const pages = findPages(below)
    const [shown, isCompactOn, isStatusOn, mods, busy] = await Promise.all([
      read($, page),
      read($, compact),
      read($, statusOn),
      read($, pack),
      read($, packBusy),
    ])
    const { Box, Text } = $.ui.resolve(e)
    const tabs = [{ id: 'home', label: 'Home' }, ...pages, { id: 'mods', label: 'Mods' }]
    const active = tabs.find(t => t.id === shown)?.id ?? 'home'
    const body =
      active === 'home'
        ? homePage($, e, isCompactOn, isStatusOn, pages)
        : active === 'mods'
          ? modsPage($, e, mods, busy)
          : ((pages.find(p => p.id === active)?.tree ?? null) as RenderElement | null)
    return (
      <Box flexDirection="column" rowGap={1} paddingX={1}>
        <Box justifyContent="space-between" columnGap={2}>
          <Text wrap="truncate-end">
            <Text bold color={ACCENT}>
              ◆ AshPack
            </Text>
            <Text dimColor> · your mods, one place</Text>
          </Text>
          {e.surface === 'terminal' ? <Text dimColor>Esc closes</Text> : null}
        </Box>
        {tabBar($, e, tabs, active)}
        {body}
      </Box>
    )
  })
}
