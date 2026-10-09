import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, Timer } from 'claude-code'

import type { Activity, Section, StatusData } from '../types'
import type { Segment, Span, TextSpan } from './format'
import {
  addTask,
  around,
  COLORS,
  describeTool,
  barPx,
  barSpans,
  barSvg,
  chipBarWidth,
  isBar,
  parseGit,
  planFromTodos,
  popupWidth,
  segments,
  statusChips,
  TRAIL,
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
const DRAWER = 'ashpack' // the AshPack drawer's pane, where Status is a page
const PANE = 'ashpack-status' // the mod's own pane, for sessions without the host
const HOST = 'ashpack@ashpack'
const PANE_COLUMNS = 64
const STATUS_TICK_MS = 30_000
const FRAME_MS = 120
const POPUP_ROWS = 5 // sections the working popup shows at most
const LOADER_PX = 120 // the desktop loader's width, in CSS pixels
const LOADER_CELLS = 12 // the terminal loader's width at most
const ACCENT = COLORS.accent
const BLUE = COLORS.blue
const COMPACT_KEY = 'compact' // $.store keys: toggles survive sessions
const STATUS_KEY = 'statusOn'

// The loader and the model chip wear the skin's accent when one is on.
const loaderColor = async ($: EngineInterface): Promise<string> => (await skinAccent($)) || BLUE
const accentColor = async ($: EngineInterface): Promise<string> => (await skinAccent($)) || ACCENT

const compact = atom({ plugin: 'ashpack-status', key: 'compact' } as const, false)
const statusOn = atom({ plugin: 'ashpack-status', key: 'statusOn' } as const, true)
const activity = atom({ plugin: 'ashpack-status', key: 'activity' } as const, null as Activity | null)
const frame = atom({ plugin: 'ashpack-status', key: 'frame' } as const, 0)
const status = atom({ plugin: 'ashpack-status', key: 'status' } as const, null as StatusData | null)
const plan = atom({ plugin: 'ashpack-status', key: 'plan' } as const, [] as Section[])

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
  // Only a change is written: every write makes the desktop app re-lay out the transcript.
  const held = await read($, status)
  if (JSON.stringify(held) !== JSON.stringify(data)) await update($, status, () => data)
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
const chipLabel = (spans: readonly Span[]): string => {
  const first = spans.find(sp => !isBar(sp))
  return (first && !isBar(first) ? first.text : 'status').replace(/[^a-z]/gi, '').toLowerCase() || 'status'
}

const isUnderPrompt = (e: { surface: string; viewport?: { isFullscreen?: boolean } }): boolean =>
  e.surface === 'terminal' && e.viewport?.isFullscreen === true

type StatusSite = RenderInput<'PromptHint'> | RenderInput<'AbovePrompt'>

// The chips as a tree. The desktop: one strip, the bars as images (its font sets the
// segment glyphs at odd heights), wide gaps between the chips. The terminal: a spaced
// row of text. Both wrap when the row is short.
function drawChips($: EngineInterface, e: StatusSite, data: StatusData, now: number, total: number, accent: string) {
  const { Box, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  const chips = statusChips(data, now, chipBarWidth(total), accent, isTerminal)
  // Svg is not in the terminal's table: resolved only off it.
  const Svg = e.surface === 'terminal' ? null : $.ui.resolve(e).Svg
  const text = (sp: TextSpan, key: string) => (
    <Text key={key} color={sp.color} dimColor={sp.dim} bold={sp.bold}>
      {sp.text}
    </Text>
  )
  return (
    <Box flexWrap="wrap" columnGap={isTerminal ? 2 : 3} rowGap={isTerminal ? 0 : 1}>
      {chips.map((spans, c) => (
        // Keyed for the AshPack host, which lifts each chip into its strip.
        <Box key={`ashpack-chip:${chipLabel(spans)}`} alignItems="center">
          {spans.map((sp, i) => {
            const key = `cell-${c}-${i}`
            if (!isBar(sp)) return text(sp, key)
            if (isTerminal || !Svg) return <Text key={key}>{barSpans(sp).map((t, j) => text(t, `${key}-${j}`))}</Text>
            return <Svg key={key} source={barSvg(sp.bar, sp.width)} alt={`${Math.round(sp.bar)}%`} width={barPx(sp.width)} height={7} />
          })}
        </Box>
      ))}
    </Box>
  )
}

// Everything the chips read, in one go.
async function statusInputs($: EngineInterface): Promise<[boolean, StatusData | null, number, string]> {
  return Promise.all([read($, statusOn), read($, status), $.clock.now(), accentColor($)])
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

function isCompact($: EngineInterface): Promise<boolean> {
  return read($, compact)
}

const seconds = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// The Skins mod's active accent ('' while skins are off), so the loader wears the skin.
const SKIN_ACCENT = { plugin: 'ashpack-skins', key: 'accent' } as const

// The skin's accent, or '' with no Skins mod or skins off. Reading it while drawing
// redraws the site when the skin changes.
async function skinAccent($: EngineInterface): Promise<string> {
  const held = await $.state.get(SKIN_ACCENT as never).catch(() => undefined)
  const value: unknown = held?.value
  return typeof value === 'string' ? value : ''
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

// The working popup, half the band wide: what it is doing, then a row per section,
// the finished ones ticked and the running one with the loader beside it.
async function drawPopup($: EngineInterface, e: RenderInput<'AbovePrompt'>, a: Activity | null, now: number) {
  const { Box, Text } = $.ui.resolve(e)
  const isTerminal = e.surface === 'terminal'
  // Reading `frame` redraws per tick: the terminal only.
  const [list, f, color] = await Promise.all([read($, plan), isTerminal ? read($, frame) : 0, loaderColor($)])
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
          {s.state === 'now' ? loader($, e, f, inner - titleWidth - 1, color) : null}
        </Box>
      ))}
    </Box>
  )
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

function statusPage($: EngineInterface, e: PaneInput, isCompactOn: boolean, isStatusOn: boolean) {
  const { Box } = $.ui.resolve(e)
  return (
    <Box key="ashpack-page:Status" flexDirection="column" rowGap={1}>
      {settingRow($, e, 'compact', 'Compact mode', 'Tool rows fold away; a popup above the prompt shows the work.', isCompactOn, () => toggle($, 'compact'))}
      {settingRow($, e, 'status', 'Status chips', 'Model, branch, context and usage by the prompt.', isStatusOn, () => toggle($, 'statusOn'))}
    </Box>
  )
}

// The settings: the Status page of the AshPack drawer, or this mod's own pane without it.
async function openSettings($: EngineInterface): Promise<void> {
  const settings = await $.settings.read()
  const hasHost = (settings.enabledPlugins as Record<string, unknown> | undefined)?.[HOST] === true
  if (hasHost) {
    // A command hook may not run another command (it would wait on itself): hand off just after.
    $.clock.after(0, () => void $.command.run({ command: 'ashpack', args: 'status' }).catch(err => $.ui.log(`ashpack-status: ${String(err)}`, { to: 'debug' })))
    return
  }
  await $.ui.open({ id: PANE, title: 'Status', focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
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

export const register: Register = on => {
  // ── shared events ──
  on('session.start', async ($, e, next) => {
    const [storedCompact, storedStatus] = await Promise.all([$.store.get(COMPACT_KEY), $.store.get(STATUS_KEY)])
    await update($, compact, () => storedCompact === true)
    await update($, statusOn, () => storedStatus !== false)
    await resetActivity($)
    $.ui.status(undefined) // 0.1.0 pinned a plain-text line; the rows replace it
    await $.command.register({
      name: 'ashstatus',
      description: 'Open the Status settings; `/ashstatus compact` or `/ashstatus chips` flips one',
      argumentHint: '[compact|chips]',
    })
    const started = await next(e)
    seen = await seenFromSettings($).catch(() => seen)
    refreshStatus($)
    $.clock.every(STATUS_TICK_MS, () => refreshStatus($))
    return started
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, activity, () => ({ startedAt: now, label: 'Thinking', steps: 0, trail: [] }))
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
  // /model, the picker or a fallback: the model chip follows at once, not at the next tick.
  on('classic.PostModelSwitch', ($, e, next) => (refreshStatus($), next(e))).catch(($, e, next) => next(e))

  // ── compact mode: what the popup says, and the task list it splits into sections ──
  on('tool.call', async ($, e, next) => {
    // Outside a turn (a plugin's own background call) there is nothing to show: no write.
    if ((await read($, activity)) === null) return next(e)
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
    const [[isOn, data, now, accent], isCompactOn, a] = await Promise.all([statusInputs($), isCompact($), read($, activity)])
    const showPopup = isCompactOn && e.props.isWorking
    const showStatus = isOn && data !== null && !isUnderPrompt(e) && !showPopup
    if (!showPopup && !showStatus) return below

    const { Box } = $.ui.resolve(e)
    const popup = showPopup ? await drawPopup($, e, a, now) : null
    const rows = showStatus && data ? drawChips($, e, data, now, e.props.bodyColumns, accent) : null

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
    const [isOn, data, now, accent] = await statusInputs($)
    if (!isOn || data === null) return below
    const { Box } = $.ui.resolve(e)
    // Leave the right of the footer to the mode labels and the drawer.
    const total = Math.max(60, Math.min(150, (e.viewport?.columns ?? 120) - 34))
    return (
      <Box flexDirection="column">
        {drawChips($, e, data, now, total, accent)}
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
    await openSettings($)
    return {}
  })

  // The Status page: in the AshPack drawer (the host finds it by its key), and the same
  // page in this mod's own pane when there is no host.
  on('ui.render', { component: 'Pane', requestId: [DRAWER, PANE] }, async ($, e, next) => {
    const below = e.requestId === DRAWER ? await next(e) : null
    const [isCompactOn, isStatusOn] = await Promise.all([read($, compact), read($, statusOn)])
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" paddingX={e.requestId === PANE ? 1 : 0}>
        {below}
        {statusPage($, e, isCompactOn, isStatusOn)}
      </Box>
    )
  })
}
