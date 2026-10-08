import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, Timer } from 'claude-code'

import type { Activity, PackMod, Section, StatusData } from '../types'
import type { Cell } from './format'
import {
  addTask,
  bar,
  COLORS,
  describeTool,
  gridBarWidth,
  gridWidths,
  parseGit,
  packMods,
  planFromTodos,
  segments,
  statusGrid,
  stepTab,
  sweep,
  TRAIL,
  updateTask,
} from './format'

// AshPack. Everything that touches `$` lives in this one file (the engine
// follows `$` only into functions of the same file):
//   - status grid: 2 rows x 3 sections under the prompt, above the engine's hint
//     line ("auto mode on"); outside fullscreen, where that line is one row,
//     it moves to the band above the prompt
//   - compact mode: tool rows hidden, a working popup above the prompt
//   - drawer: the footer shows only "◆ AshPack ▸"; opened, a small card floats
//     above it with a tab per mod that draws in the footer (found by next.trace),
//     each tab holding that mod's own badges. Outside fullscreen the badges
//     slide out in the footer and a small pane holds the toggles
// The drawer needs ashpack outermost: first in enabledPlugins (settings.json).

const DRAWER = 'ashpack-drawer'
const STATUS_TICK_MS = 30_000
const FRAME_MS = 120
const GRID_GAP = 2 // columns between a status section's text and the next "│"
const SEG_GAP = 2 // columns between the popup's sections
const ACCENT = COLORS.accent
const BLUE = COLORS.blue
const CARD_WIDTH = 46
const HOME_TAB = 'AshPack'
const MODS_TAB = 'Mods'
const PACK = 'ashpack' // the marketplace the pack's mods come from
const CLI_TIMEOUT_MS = 120_000
const CARD_BG = '#1e1e2e'
const COMPACT_KEY = 'compact' // $.store keys: toggles survive sessions
const STATUS_KEY = 'statusOn'

const compact = atom({ plugin: 'ashpack', key: 'compact' } as const, false)
const statusOn = atom({ plugin: 'ashpack', key: 'statusOn' } as const, true)
const activity = atom({ plugin: 'ashpack', key: 'activity' } as const, null as Activity | null)
const frame = atom({ plugin: 'ashpack', key: 'frame' } as const, 0)
const status = atom({ plugin: 'ashpack', key: 'status' } as const, null as StatusData | null)
const drawerOpen = atom({ plugin: 'ashpack', key: 'drawerOpen' } as const, false)
const tab = atom({ plugin: 'ashpack', key: 'tab' } as const, HOME_TAB)
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

// The working popup, full width: what it is doing now, then the sections, the
// running one swept right to left and the finished ones filled.
async function drawPopup($: EngineInterface, e: RenderInput<'AbovePrompt'>, a: Activity | null, now: number) {
  const { Box, Text } = $.ui.resolve(e)
  const [list, f] = await Promise.all([read($, plan), read($, frame)])
  const cols = e.props.bodyColumns
  const segs = segments(list, a?.label ?? 'Thinking', a?.trail ?? [])
  const segWidth = Math.max(3, Math.floor((cols - 4 - SEG_GAP * (segs.length - 1)) / segs.length))
  const done = list.filter(s => s.status === 'completed').length
  const facts = [
    list.length > 0 ? `${done}/${list.length}` : '',
    a ? seconds(now - a.startedAt) : '',
    a && a.steps > 0 ? `${a.steps} step${a.steps === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1} width={cols}>
      <Box justifyContent="space-between" columnGap={2}>
        <Text wrap="truncate-end">
          <Text bold color={ACCENT}>
            ◆ AshPack
          </Text>
          <Text> {a?.label ?? 'Working'}…</Text>
        </Text>
        <Text dimColor>{facts.join(' · ')}</Text>
      </Box>
      <Box columnGap={SEG_GAP}>
        {segs.map((s, i) => {
          const color = s.state === 'now' ? BLUE : s.state === 'done' ? COLORS.ok : undefined
          return (
            <Box key={`seg-${i}`} flexDirection="column" width={segWidth}>
              <Text wrap="truncate-end" bold={s.state === 'now'} color={s.state === 'now' ? ACCENT : color} dimColor={s.state === 'todo'}>
                {s.state === 'done' ? '✓ ' : ''}
                {s.title}
              </Text>
              <Text color={color} dimColor={s.state === 'todo'}>
                {s.state === 'now' ? sweep(f, segWidth, Math.max(2, Math.floor(segWidth / 4))) : bar(s.state === 'done' ? 100 : 0, segWidth)}
              </Text>
            </Box>
          )
        })}
      </Box>
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

// Fullscreen: the footer draws a card over the transcript. Elsewhere a card
// would be clipped to the footer's one row, so a small pane opens instead.
async function openDrawer($: EngineInterface, isFullscreen: boolean): Promise<void> {
  await loadPack($)
  await update($, drawerOpen, () => true)
  if (!isFullscreen) {
    await $.ui.open({ id: DRAWER, title: 'AshPack', focus: true, closeOnEscape: true, holdToasts: true, rows: 5, columns: 40 })
  }
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

  // ── footer: the drawer. Closed: "◆ AshPack ▸". Open: "◂" and a card with a tab per footer mod. ──
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const isFullscreen = e.viewport?.isFullscreen === true
    const [isOpen, isCompactOn, isStatusOn, picked, mods, busy] = await Promise.all([
      read($, drawerOpen),
      read($, compact),
      read($, statusOn),
      read($, tab),
      read($, pack),
      read($, packBusy),
    ])
    const { Box, Button, Text } = $.ui.resolve(e)
    const modes = e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null
    const handle = (
      <Box>
        <Text color={ACCENT}>◆</Text>
        <Button
          key="ashpack"
          plain
          label={isOpen ? 'AshPack ◂' : 'AshPack ▸'}
          onPress={() => (isOpen ? closeDrawer($) : openDrawer($, isFullscreen))}
        />
      </Box>
    )
    if (!isOpen) {
      return (
        <Box columnGap={2}>
          {modes}
          {handle}
        </Box>
      )
    }
    // The mods beneath draw their own badges (so their buttons work); the modes are drawn once, here.
    const beneath = await next({ ...e, props: { ...e.props, modes: [] } })
    if (!isFullscreen) {
      return (
        <Box columnGap={2}>
          {modes}
          {beneath}
          {handle}
        </Box>
      )
    }
    // A tab per mod that drew something of its own; one that passed next's tree on draws nothing.
    const drawn = next.trace.filter(t => t.plugin !== 'engine' && t.outcome !== 'passed' && t.returned != null)
    const tabs = [
      { name: HOME_TAB, tree: null },
      { name: MODS_TAB, tree: null },
      ...drawn.map(t => ({ name: t.plugin, tree: t.returned ?? null })),
    ]
    const names = tabs.map(t => t.name)
    const active = tabs.find(t => t.name === picked) ?? { name: HOME_TAB, tree: null }
    const go = (delta: number) => () => update($, tab, () => stepTab(names, active.name, delta))
    const toggle1 = (key: string, label: string, isOn: boolean, onPress: () => unknown) => (
      <Box key={`row-${key}`} columnGap={1}>
        <Text>{label}</Text>
        <Button key={key} plain label={isOn ? '● ON ' : '○ OFF'} onPress={onPress} />
      </Box>
    )
    const mark = (m: PackMod) => (busy === m.name ? '…' : m.state === 'on' ? '●' : m.state === 'off' ? '○' : '+')
    // ponytail: one row of mods; past ~5 they need paging (the card has one row to give)
    const modsRow =
      mods.length === 0 ? (
        <Text dimColor>No "{PACK}" marketplace found</Text>
      ) : (
        <Box columnGap={2}>
          {mods.map(m =>
            m.name === PACK ? (
              <Text key={`mod-${m.name}`} color={ACCENT}>
                ◆ {m.name}
              </Text>
            ) : (
              <Button key={`mod-${m.name}`} plain dimColor={m.state !== 'on'} label={`${mark(m)} ${m.name}`} onPress={() => packAction($, m)} />
            ),
          )}
          <Button key="mods-update" plain dimColor label={busy === 'update' ? '… update' : '↻ update'} onPress={() => packAction($, null)} />
        </Box>
      )
    const body =
      active.tree ??
      (active.name === MODS_TAB ? (
        modsRow
      ) : (
        <Box columnGap={3}>
          {toggle1('compact', 'Compact', isCompactOn, () => toggle($, 'compact'))}
          {toggle1('status', 'Status rows', isStatusOn, () => toggle($, 'statusOn'))}
        </Box>
      ))
    // Four rows: it floats over the prompt box and the row above it, and is cut at that region's top.
    const card = (
      <Box
        key="ashpack-card"
        position="absolute"
        bottom={1}
        right={0}
        width={CARD_WIDTH}
        flexDirection="column"
        borderStyle="round"
        borderColor={ACCENT}
        backgroundColor={CARD_BG}
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Box columnGap={1}>
            <Text bold color={ACCENT}>
              ◆
            </Text>
            {tabs.length > 1 && <Button key="tab-prev" plain dimColor label="‹" onPress={go(-1)} />}
            {tabs.map(t => (
              <Button
                key={`tab-${t.name}`}
                plain
                dimColor={t.name !== active.name}
                label={t.name === active.name ? `[${t.name}]` : t.name}
                onPress={() => update($, tab, () => t.name)}
              />
            ))}
            {tabs.length > 1 && <Button key="tab-next" plain dimColor label="›" onPress={go(1)} />}
          </Box>
          <Box columnGap={2}>
            <Text dimColor>
              {drawn.length + 1} {drawn.length === 0 ? 'mod' : 'mods'}
            </Text>
            <Button key="card-close" plain dimColor label="✕" onPress={() => closeDrawer($)} />
          </Box>
        </Box>
        {body}
      </Box>
    )
    return (
      <Box columnGap={2}>
        {modes}
        {handle}
        {card}
      </Box>
    )
  })

  // The person closing the panel (Esc, its close mark) folds the drawer too.
  on('ui.close', async ($, e, next) => {
    if (e.id === DRAWER) await update($, drawerOpen, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'ashpack' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'compact' || arg === 'status') {
      const isOn = await toggle($, arg === 'compact' ? 'compact' : 'statusOn')
      return { text: `${arg === 'compact' ? 'Compact mode' : 'Status rows'} ${isOn ? 'on' : 'off'}.` }
    }
    await openDrawer($, e.presentation.isFullscreen)
    return { text: 'AshPack drawer opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: DRAWER }, async ($, e) => {
    const [isCompactOn, isStatusOn] = await Promise.all([read($, compact), read($, statusOn)])
    const { Box, Button, Text } = $.ui.resolve(e)
    const switchRow = (key: string, hotkey: string, label: string, isOn: boolean, onPress: () => unknown) => (
      <Box key={`row-${key}`} columnGap={2}>
        <Box width={16}>
          <Text>{label}</Text>
        </Box>
        <Button key={key} hotkey={hotkey} label={isOn ? '● ON ' : '○ OFF'} variant={isOn ? 'primary' : 'secondary'} onPress={onPress} />
      </Box>
    )

    return (
      <Box flexDirection="column">
        {switchRow('compact', 'c', 'Compact mode', isCompactOn, () => toggle($, 'compact'))}
        {switchRow('status', 's', 'Status rows', isStatusOn, () => toggle($, 'statusOn'))}
        <Box columnGap={2}>
          <Text dimColor>Esc closes</Text>
          <Button key="close" role="dismiss" plain dimColor label="close" onPress={() => closeDrawer($)} />
        </Box>
      </Box>
    )
  })
}
