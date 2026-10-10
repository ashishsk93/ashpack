import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Plugin } from 'claude-code/testing'

import type { Activity, Call, History, Turn } from '../types'
import { activityView, callsSvg, chartSvg, heroSvg, MAX_CALLS, NO_HISTORY, sessionTiles, settleCall, shownOf, startCall, tilesSvg, withTurn } from './activity'
import { COLORS, ellipsis, lineOf, moveChip, parseGit, printsStash, promptTitle, TARGET_CHARS } from './format'

// The Activity page's list and lifecycle, the popup's task list, the command, and the pure
// helpers under them.

const T0 = Date.parse('2026-10-08T10:00:00Z')
const DRAWER = { component: 'Pane', requestId: 'ashpack' } as const
const PANE_PROPS = { title: 'AshPack', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 12, contentRows: 12 }, view: {} } as never
const FULL = { columns: 160, rows: 50, isFullscreen: true } as never
const BAND = { hasSurvey: false, isWorking: true, maxRows: 14, bodyColumns: 120, scroll: { offset: 0, bodyRows: 14, contentRows: 0 }, view: {} } as never
const END = { answer: '', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer' } as const

const flatten = (node: unknown): string => (typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(flatten).join(''))

// A session with the AshPack drawer on the Activity page (and any other value held as
// `values` says, by `plugin.key`), and tools that answer `results` (by tool, read at each
// call). Answers what was logged.
function session(on: On, results: Record<string, unknown> = {}, values: Record<string, unknown> = {}): string[] {
  const logs: string[] = []
  const held: Record<string, unknown> = { 'ashpack.page': 'activity', ...values }
  on('state.get', ($, e, next) => {
    const { plugin, key } = e as { plugin: string; key: string }
    return `${plugin}.${key}` in held ? ({ value: { value: held[`${plugin}.${key}`], version: 1 } } as never) : next(e)
  })
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1, tokens: 1, percent: 41 }, rateLimits: [] } }) as never)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head main\n', stderr: '' } }) as never)
  on('ui.log', ($, e) => (logs.push(e.text), { value: undefined }))
  on('tool.call', ($, e) => ({ result: results[String(e.tool)] ?? {} }) as never)
  on('turn.start', ($, e) => e as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  return logs
}

const call = (id: string, state: Call['state'] = 'running'): Call => ({ id, kind: 'command', target: 'npm test', state })
const live = (n: number, calls: Call[] = []): Activity => ({ n, prompt: 'go', startedAt: T0, steps: [], calls })

test('pure: the popup\'s line, the calls kept, the live turn counted once, chips moved, git read', () => {
  // Two calls share a line: the first ending leaves it, since the other still runs.
  const a = startCall(startCall(live(1), 'c1', 'Running npm test', call('c1')), 'c2', 'Running npm test', call('c2'))
  expect(lineOf(settleCall(a, 'c1', { isFailed: false, ms: 10 }))).toBe('Running npm test')
  expect(lineOf(settleCall(settleCall(a, 'c1', { isFailed: false, ms: 10 }), 'c2', { isFailed: true, ms: 10 }))).toBe('Thinking')
  // The latest still running heads it; a subagent's call is a line alone.
  const b = startCall(startCall(live(1), 'r1', 'Reading a.ts', { kind: 'read', target: 'a.ts' }), 's1', 'Searching x', null)
  expect(b.calls.map(x => x.id)).toEqual(['r1'])
  expect(lineOf(b)).toBe('Searching x')
  expect(lineOf(settleCall(b, 's1', { isFailed: false, ms: 5 }))).toBe('Reading a.ts')
  expect(settleCall(b, 'r1', { isFailed: false, ms: 5, size: { added: 2, removed: 1 } }).calls[0]).toEqual({ id: 'r1', kind: 'read', target: 'a.ts', state: 'ok', ms: 5, added: 2, removed: 1 })
  // A turn keeps its latest MAX_CALLS calls.
  const many = Array.from({ length: MAX_CALLS + 1 }, (_, i) => `c${i}`).reduce((t, id) => startCall(t, id, 'Running', call(id)), live(1))
  expect(many.calls).toHaveLength(MAX_CALLS)
  expect(many.calls[0]?.id).toBe('c1')

  // The ended turn joins the history a write before the live one clears: counted once.
  const done: History = withTurn(NO_HISTORY, { n: 1, prompt: 'go', startedAt: T0, ms: 1000, calls: [], outcome: 'answer' })
  const view = (held: Activity) => activityView({ held, history: done, picked: null, filter: 'all', limit: 12, data: null, c: COLORS, now: T0 + 5000 })
  expect(view(live(1)).bars).toHaveLength(1)
  expect(view(live(1)).shown?.isLive).toBe(false)
  expect(view(live(2)).bars).toHaveLength(2)
  expect(view(live(2)).tiles.find(t => t.label === 'Turns')?.value[0]?.text).toBe('2')
  // The session's time runs from its first turn; before any, it is not known.
  expect(sessionTiles(done.totals, null, T0 + 65_000, COLORS)[0]?.value[0]?.text).toBe('1m 5s')
  expect(sessionTiles(NO_HISTORY.totals, null, T0, COLORS)[0]?.value[0]?.text).toBe('—')

  // ↑ and ↓ swap with the neighbour among the rows shown; at an end, or not shown, nothing moves.
  const order = ['model', 'branch', 'context', 'session'] as const
  expect(moveChip(order, 'context', -1, order)).toEqual(['model', 'context', 'branch', 'session'])
  expect(moveChip(order, 'model', -1, order)).toEqual([...order])
  expect(moveChip(order, 'session', 1, order)).toEqual([...order])
  expect(moveChip(order, 'context', -1, ['model', 'context', 'session'])).toEqual(['context', 'branch', 'model', 'session'])
  expect(moveChip(order, 'branch', 1, ['model', 'context'])).toEqual([...order])

  // Git: a detached HEAD, a branch with no upstream, the stashes when git prints them.
  expect(parseGit('# branch.oid abc\n# branch.head (detached)\n')).toEqual({ branch: 'detached', dirty: 0, ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0 })
  expect(parseGit('# branch.head feat\n# stash 3\n? a\n')).toMatchObject({ branch: 'feat', ahead: 0, behind: 0, dirty: 1, untracked: 1, stashes: 3 })
  expect([printsStash('git version 2.35.0'), printsStash('git version 2.34.9'), printsStash('git version 3.0'), printsStash('')]).toEqual([true, false, true, false])

  // Text is cut by code points, never through a pair.
  expect(ellipsis('abc', 5)).toBe('abc')
  expect(ellipsis('abcdef', 4)).toBe('abc…')
  expect(ellipsis('😀😀😀', 3)).toBe('😀😀😀')
  expect(ellipsis('😀😀😀😀', 3)).toBe('😀😀…')
  expect(ellipsis('a'.repeat(100_000), 10)).toHaveLength(10)
})

test('pure: a turn Claude Code started itself is titled by what started it, never its markup', () => {
  expect(promptTitle('<bash-input>claude plugin update ashpack-status@ashpack</bash-input>')).toBe('$ claude plugin update ashpack-status@ashpack')
  expect(promptTitle('<agent-message from="a0ce13">\n[Subagent hand-back] The text below')).toBe('Subagent report')
  const task = '<task-notification>\n<task-id>ae4a</task-id>\n<status>completed</status>\n<summary>Agent "Review" finished</summary>\n</task-notification>'
  expect(promptTitle(task)).toBe('Agent "Review" finished')
  expect(promptTitle('<task-notification>\n<task-id>ae4a</task-id>')).toBe('Background task finished') // cut before its summary
  expect(promptTitle('<command-name>/skin</command-name>\n<command-message>skin</command-message>\n<command-args>nord</command-args>')).toBe('/skin nord')
  // The person's own words win over the markup round them; their own tags stay.
  expect(promptTitle('<local-command-caveat>ran directly</local-command-caveat>\n<command-name>/reload-plugins</command-name>\n<local-command-stdout>Reloaded</local-command-stdout>\ngo')).toBe('go')
  expect(promptTitle('<system-reminder>be careful</system-reminder>\nfix the <div> layout')).toBe('fix the <div> layout')
  // A title comes back the same.
  for (const t of ['yes ship it', '$ ls', '/skin nord', 'Agent "Review" finished']) expect(promptTitle(t)).toBe(t)
})

test('pure: the desktop\'s drawings stay under its 131072-character limit, with no NaN', () => {
  const target = '"&<>'.repeat(TARGET_CHARS).slice(0, TARGET_CHARS)
  const calls: Call[] = Array.from({ length: MAX_CALLS }, (_, i) => ({ id: `c${i}`, kind: i % 2 ? 'edit' : 'command', target, state: i % 3 ? 'ok' : 'running', ms: 9_999_999, added: 99_999, removed: 99_999 }))
  const turn: Turn = { n: 999, prompt: target, startedAt: T0, ms: 99_999_999, calls, outcome: 'refusal', costUsd: 9999.99, tokensIn: 99_999_999, tokensOut: 99_999_999 }
  const turns = Array.from({ length: 30 }, (_, i) => ({ ...turn, n: i + 1, ms: i * 1000 }))
  const skin = { ...COLORS, bg: '#101010', text: '#fafafa', cyan: '#00ffff', pink: '#ff00ff', purple: '#800080' }
  const history = turns.reduce(withTurn, NO_HISTORY)
  const tiles = sessionTiles(history.totals, { n: 31, prompt: target, startedAt: T0, steps: [], calls }, T0 + 99_999_999, skin, 9999.99)
  for (const w of [300, 760]) {
    for (const c of [COLORS, skin]) {
      const drawn = [
        heroSvg(shownOf(null, turns, 30), c, w).source,
        heroSvg(shownOf({ n: 31, prompt: target, startedAt: T0, steps: [{ id: 'x', label: target }], calls }, turns, null), c, w).source,
        heroSvg(null, c, w).source,
        callsSvg(calls, 999, c, w).source,
        callsSvg([], 0, c, w).source,
        tilesSvg(tiles, 100, c, w).source,
        chartSvg([...turns, { n: 31, ms: 0, calls: [], isLive: true }], c, w, 3).source,
      ]
      for (const source of drawn) {
        expect(source.length).toBeLessThan(120_000)
        expect(source).not.toContain('NaN')
      }
    }
  }
})

test('the Activity page lists the latest 12 calls, Show more adds 12, and a filter or a turn starts over', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  session(on)
  await $.turn.start({ text: 'one', turnId: 't1' } as never)
  for (let i = 1; i <= 70; i++) await $.tool.call({ tool: 'Read', file_path: `/repo/f${i}.ts`, tool_use_id: `r${i}` } as never)
  for (let i = 1; i <= 5; i++) await $.tool.call({ tool: 'Bash', command: `echo ${i}`, tool_use_id: `c${i}` } as never)
  const desk = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', ...DRAWER, props: PANE_PROPS })
  const more = async () => (await desk.find({ key: 'activity-more' }))?.props.label
  expect(await more()).toBe('+ 63 earlier · show 12 more')
  await desk.press({ key: 'activity-more' })
  expect(await more()).toBe('+ 51 earlier · show 12 more')
  // A filter starts the list over; so does All again.
  await desk.press({ key: 'filter-command' })
  expect(await more()).toBeUndefined()
  await desk.press({ key: 'filter-all' })
  expect(await more()).toBe('+ 63 earlier · show 12 more')
  // Shown whole, the list is two drawings: one would pass what the desktop draws.
  for (let i = 0; i < 6; i++) await desk.press({ key: 'activity-more' })
  expect(await more()).toBeUndefined()
  const lists = (await desk.findAll({ type: 'Svg' })).filter(x => String(x.props.alt).startsWith('ok read'))
  expect(lists.map(x => String(x.props.alt).split('; ').length)).toEqual([64, 11])

  // The terminal: each filter has its key, `l` for All; Back to now has `b`.
  await $.turn.complete({ ...END, turnId: 't1' } as never)
  await $.turn.start({ text: 'two', turnId: 't2' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'x', tool_use_id: 'g1' } as never)
  const term = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  expect((await term.find({ key: 'filter-all' }))?.props.hotkey).toBe('l')
  expect((await term.find({ key: 'filter-search' }))?.props.hotkey).toBe('s')
  expect(await term.find({ key: 'activity-now' })).toBeUndefined()
  await term.press({ key: 'turn-1' })
  expect((await term.find({ key: 'activity-now' }))?.props.hotkey).toBe('b')
  expect((await term.find({ key: 'filter-read' }))?.props.hotkey).toBe('r')
  expect((await term.find({ key: 'activity-more' }))?.props.label).toBe('+ 63 earlier · show 12 more') // another turn starts over
  // The desktop's buttons take no keys.
  expect((await desk.find({ key: 'filter-all' }))?.props.hotkey).toBeUndefined()
  await term.unmount()
  await desk.unmount()
  await clock.advance(0)
})

// Stands in for the person closing the drawer (Esc reaches the mods the same way).
const closer: Plugin = {
  name: 'closer',
  register(on) {
    on('command.run', { command: 'close-drawer' }, async $ => {
      await $.ui.close({ id: 'ashpack' })
      return {}
    })
  },
}

test('no control character reaches a label or an alt; the terminal ticks the running turn each second until closed', { plugins: [closer] }, async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  let ticks = 0
  on('state.set', ($, e, next) => ((e as { key?: string }).key === 'second' && ticks++, next(e)))
  on('ui.close', () => ({ value: undefined }))
  session(on)
  // A pasted escape code in the prompt, a BEL in a pattern.
  await $.turn.start({ text: 'why \u001b[31mred\u001b[0m\u0007', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'a\u0007b', tool_use_id: 'g1' } as never)
  await $.turn.complete({ ...END, turnId: 't1' } as never)
  await $.turn.start({ text: 'two', turnId: 't2' } as never)
  const desk = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', ...DRAWER, props: PANE_PROPS })
  await desk.press({ key: 'turn-1' })
  const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/
  const svgs = await desk.findAll({ type: 'Svg' })
  expect(svgs.length).toBeGreaterThan(0)
  for (const x of svgs) expect(String(x.props.alt)).not.toMatch(CONTROL)
  for (const x of await desk.findAll({ type: 'Button' })) expect(String(x.props.label)).not.toMatch(CONTROL)
  await desk.press({ key: 'activity-now' })
  await desk.unmount()

  // The terminal: the running turn's time moves each second while the page shows it.
  const term = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  await clock.advance(3000)
  expect(ticks).toBeGreaterThan(0)
  expect(flatten(await term.drawn())).toContain('3s')
  // Closed, it stops.
  await $.command.run({ command: 'close-drawer', args: '' } as never)
  const stopped = ticks
  await clock.advance(5000)
  expect(ticks).toBe(stopped)
  await term.unmount()
})

test('a fault in the Activity page costs the drawer nothing', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  // A history the page cannot read.
  const logs = session(on, {}, { 'ashpack-status.history': { turns: 'bogus', totals: {} } })
  const pane = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('"key":"ashpack-page:Activity"')
  expect(drawn).toContain('"key":"ashpack-page:Status"')
  expect(logs.join(' ')).toContain('ashpack activity page')
  await pane.unmount()
})

test('a turn\'s end: a subagent\'s keeps the popup; an interrupt and a refusal say so; 30 turns kept; a resume starts over', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  session(on)
  await $.command.run({ command: 'ashstatus', args: 'compact' } as never)
  await $.turn.start({ text: 'one', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts', tool_use_id: 'r1' } as never)
  // A subagent's turn ends: the main turn runs on, its popup and its calls with it.
  await $.turn.complete({ ...END, turnId: 's1', agentId: 'a1' } as never)
  const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'AbovePrompt', viewport: FULL, props: BAND })
  expect(JSON.stringify(await band.drawn())).toContain('"label":"Read 1"')
  await band.unmount()
  const term = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  expect(flatten(await term.drawn())).toContain('TURN 1 · WORKING')

  // Interrupted: stopped. Refused: refused.
  await $.turn.complete({ ...END, turnId: 't1', reason: 'aborted', isAborted: true } as never)
  let text = flatten(await term.drawn())
  expect(text).toContain('✗ TURN 1 · STOPPED')
  await $.turn.start({ text: 'two', turnId: 't2' } as never)
  await $.turn.complete({ ...END, turnId: 't2', reason: 'refusal', refusal: { category: null, explanation: null } } as never)
  expect(flatten(await term.drawn())).toContain('✗ TURN 2 · REFUSED')

  // The page keeps the latest 30 turns; the totals count them all.
  for (let n = 3; n <= 31; n++) {
    await $.turn.start({ text: `turn ${n}`, turnId: `t${n}` } as never)
    await $.turn.complete({ ...END, turnId: `t${n}` } as never)
  }
  const drawn = JSON.stringify(await term.drawn())
  expect(drawn).not.toContain('"key":"turn-1"')
  expect(drawn).toContain('"key":"turn-2"')
  expect(drawn).toContain('"key":"turn-31"')
  expect(flatten(await term.drawn())).toContain('TURNS31')

  // Another session takes this one's place (a resume): the page starts over.
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: {} } as never)
  text = flatten(await term.drawn())
  expect(text).toContain('Ready when you are')
  expect(text).toContain('TURNS0')
  await term.unmount()
})

test('the popup\'s task list: a task TaskCreate made, by the id its result names', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: T0 })
  const results: Record<string, unknown> = { TaskCreate: { task: { id: '7', subject: 'Write the tests' } } }
  session(on, results)
  await $.command.run({ command: 'ashstatus', args: 'compact' } as never)
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the tests', description: 'all of them', tool_use_id: 'k1' } as never)
  results.TaskCreate = {} // a result with no task adds none
  await $.tool.call({ tool: 'TaskCreate', subject: 'Lost', description: '', tool_use_id: 'k2' } as never)
  const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'AbovePrompt', viewport: FULL, props: BAND })
  expect(JSON.stringify(await band.drawn())).toContain('"label":"Tasks 0/1"')
  await band.press({ key: 'card-tasks' })
  expect(flatten(await band.drawn())).toContain('▸ Write the tests')
  expect(flatten(await band.drawn())).not.toContain('Lost')
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'completed', tool_use_id: 'u1' } as never)
  expect(JSON.stringify(await band.drawn())).toContain('"label":"Tasks 1/1 ▾"')
  await band.unmount()
})

test('/ashstatus: compact and chips flip; activity and the page open in the drawer, or in panes of their own', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  session(on)
  let hasHost = true
  on('settings.read', () => ({ value: { enabledPlugins: hasHost ? { 'ashpack@ashpack': true } : {} } }))
  const handed: string[] = []
  on('command.run', { command: 'ashpack' }, ($, e) => (handed.push(e.args), {}) as never)
  const opened: string[] = []
  on('ui.open', ($, e) => (opened.push(`${e.id}:${e.title}`), { value: { isPlaced: true } }) as never)
  const say = async (args: string) => ((await $.command.run({ command: 'ashstatus', args } as never)) as { text?: string }).text
  expect(await say('compact')).toBe('Compact mode on.')
  expect(await say(' COMPACT ')).toBe('Compact mode off.')
  expect(await say('chips')).toBe('Status chips off.')
  // With the host, its drawer: handed on just after, since a command may not run another.
  await say('activity')
  await say('')
  expect(handed).toEqual([])
  await clock.advance(0)
  expect(handed).toEqual(['activity', 'status'])
  // Without it, a pane each.
  hasHost = false
  await say('activity')
  await say('anything')
  expect(opened).toEqual(['ashpack-activity:Activity', 'ashpack-status:Status'])
})
