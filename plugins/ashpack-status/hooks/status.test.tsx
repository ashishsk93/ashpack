import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

import {
  addTask,
  around,
  bar,
  barSpans,
  chipIds,
  chipOrder,
  barSvg,
  callOf,
  cardCounts,
  COLORS,
  editSize,
  effortLabel,
  hiddenChipsOf,
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
  prettyModel,
  segments,
  statusChips,
  took,
  updateTask,
  wave,
  waveSvg,
  windowLabel,
} from './format'
import { addTurn, heroSvg, lasted, NO_TOTALS, shownOf, tokens, turnLabel, turnOf } from './activity'

const SURFACES = ['terminal', 'desktop'] as const
const FULL = { columns: 160, rows: 50, isFullscreen: true } as never
const MAIN = { columns: 160, rows: 50, isFullscreen: false } as never

// A drawn tree's text, children joined in order.
const flatten = (node: unknown): string =>
  typeof node === 'string'
    ? node
    : ((node as { children?: unknown[] })?.children ?? []).map(flatten).join('')
const DRAWER = { component: 'Pane', requestId: 'ashpack' } as const
const PANE_PROPS = {
  title: 'AshPack',
  isFocused: true,
  bodyColumns: 60,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 12, contentRows: 12 },
  view: {},
} as never

test('helpers: names, bars, colors, git, loader', () => {
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(windowLabel('five_hour')).toBe('session')
  expect(windowLabel('seven_day')).toBe('week')
  expect(windowLabel('seven_day_fable')).toBe('fable')
  expect(effortLabel('high')).toBe('◕ high')
  // A stored pick keeps known chips only, in chip order.
  expect(chipIds(['week', 'bogus', 'model'])).toEqual(['model', 'week'])
  expect(chipIds('week')).toEqual([])
  // A stored order keeps known chips in their stored place, then any it lacks.
  expect(chipOrder(['spend', 'bogus', 'model'])).toEqual(['spend', 'model', 'branch', 'context', 'session', 'week', 'tree', 'lines', 'commit', 'pr'])
  expect(chipOrder(null)).toEqual(['model', 'branch', 'context', 'session', 'week', 'spend', 'tree', 'lines', 'commit', 'pr'])
  // The repo chips start off for anyone whose stored order has not listed them yet,
  // and keep the stored pick once it has.
  expect(hiddenChipsOf(undefined, undefined)).toEqual(['tree', 'lines', 'commit', 'pr'])
  expect(hiddenChipsOf(['week'], ['model', 'branch', 'context', 'session', 'week', 'spend'])).toEqual(['week', 'tree', 'lines', 'commit', 'pr'])
  expect(hiddenChipsOf(['pr'], chipOrder(null))).toEqual(['pr'])

  expect(bar(42, 8)).toEqual(['▰▰▰', '▱▱▱▱▱'])
  expect(bar(150, 4)).toEqual(['▰▰▰▰', ''])
  expect(levelColor(10)).toBe(COLORS.ok)
  expect(levelColor(60)).toBe(COLORS.warn)
  expect(levelColor(90)).toBe(COLORS.hot)

  const git = parseGit('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -2\n1 .M N... a\n1 MM N... b\n1 A. N... c\nu UU N... d\n? new.txt\n')
  expect(git).toEqual({ branch: 'main', dirty: 5, ahead: 1, behind: 2, staged: 2, changed: 2, untracked: 1, conflicts: 1 })
  expect(parseGit('')).toBeNull()

  // The repo chips' readers.
  expect(parseShortstat(' 3 files changed, 120 insertions(+), 34 deletions(-)\n')).toEqual({ added: 120, removed: 34 })
  expect(parseShortstat(' 1 file changed, 1 deletion(-)\n')).toEqual({ added: 0, removed: 1 })
  expect(parseShortstat('')).toEqual({ added: 0, removed: 0 })
  expect(parseCommit('1728540000\x1ffix: a thing\n')).toEqual({ at: 1728540000000, subject: 'fix: a thing' })
  expect(parseCommit('')).toBeNull()
  expect(operationOf(['HEAD', 'rebase-merge', 'index'])).toBe('rebasing')
  expect(operationOf(['HEAD', 'index'])).toBeUndefined()
  const pr = parsePr(
    JSON.stringify({
      number: 12,
      state: 'OPEN',
      isDraft: false,
      reviewDecision: 'APPROVED',
      statusCheckRollup: [
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
        { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
        { __typename: 'StatusContext', state: 'SUCCESS' },
        { __typename: 'StatusContext', state: 'PENDING' },
      ],
    }),
  )
  expect(pr).toEqual({ number: 12, state: 'OPEN', isDraft: false, review: 'APPROVED', checks: { passed: 2, failed: 1, pending: 2 } })
  expect(parsePr('no pull requests found')).toBeNull()

  const now = Date.parse('2026-10-08T10:00:00Z')
  const chips = statusChips(
    {
      model: 'claude-opus-5-5[1m]',
      effort: 'high',
      contextPercent: 42,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-08T12:14:00Z' },
        { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-11T14:00:00Z' },
        { kind: 'seven_day_fable', percentUsed: 12, resetsAt: '2026-10-11T14:00:00Z' },
      ],
      git: { branch: 'main', dirty: 3, ahead: 0, behind: 0, staged: 1, changed: 2, untracked: 0, conflicts: 0 },
      folder: 'ashpack',
      costUsd: 1.24,
      startedAt: Date.parse('2026-10-08T09:37:00Z'),
      repo: {
        operation: 'rebasing',
        stashes: 1,
        lines: { added: 120, removed: 34 },
        commit: { at: Date.parse('2026-10-08T08:00:00Z'), subject: 'fix: a subject long enough that its chip has to clip it' },
        pr: { number: 12, state: 'OPEN', isDraft: false, review: 'APPROVED', checks: { passed: 5, failed: 0, pending: 0 } },
      },
    },
    now,
    4,
    { ...COLORS, accent: '#fab387' },
  )
  const textOf = ({ cell }: (typeof chips)[number]) => cell.flatMap(sp => (isBar(sp) ? barSpans(sp) : [sp])).map(sp => sp.text).join('')
  expect(chips.map(textOf)).toEqual([
    '◆ Opus 5.5 1M · ◕ high',
    '⎇ main ●3',
    'ctx ▰▰▱▱ 42%',
    'session ▰▱▱▱ 23% ↻2h14m',
    'week ▰▰▱▱ 41%  fable ▱▱▱▱ 12% ↻3d4h',
    'ashpack · $1.24 · 23m',
    'rebasing · 1 staged · 2 changed · 1 stash',
    'diff +120 −34',
    'commit 2h0m ago · fix: a subject long enough that its chi…',
    'PR #12 ✓ 5 checks · approved',
  ])
  const model = chips[0]?.cell[0]
  expect(model && !isBar(model) ? model.color : undefined).toBe('#fab387') // the model wears the skin's accent
  // The desktop's bar: one image, lit segments solid and the rest faint.
  expect(barSvg(42, 4)).toMatch(/^<svg .*opacity="1".*opacity="0.25".*<\/svg>$/)
  expect((barSvg(42, 4).match(/<rect/g) ?? []).length).toBe(4)

  // The popup's cards: a call's kind and target, counts per kind, an edit's size.
  expect(callOf('Read', { file_path: '/repo/src/a.ts' }, '/repo')).toEqual({ kind: 'read', target: 'src/a.ts' })
  expect(callOf('Bash', { command: 'npm\n  test' }, '/repo')).toEqual({ kind: 'command', target: 'npm test' })
  expect(callOf('Grep', { pattern: 'TODO', path: '/repo/src' }, '/repo')).toEqual({ kind: 'search', target: 'TODO in src' })
  expect(callOf('mcp__github__search_code', {}, '/repo')).toEqual({ kind: 'tool', target: 'github search_code' })
  expect(callOf('TodoWrite', {}, '/repo')).toBeNull() // the Tasks card's
  const calls = [
    { id: '1', kind: 'read' as const, target: 'a', state: 'ok' as const },
    { id: '2', kind: 'command' as const, target: 'ls', state: 'ok' as const },
    { id: '3', kind: 'read' as const, target: 'b', state: 'running' as const },
  ]
  expect(cardCounts(calls).map(k => `${k.label} ${k.count}`)).toEqual(['Read 2', 'Command 1'])
  expect(latest([1, 2, 3, 4], 3)).toEqual({ shown: [2, 3, 4], earlier: 1 })
  expect(editSize({ structuredPatch: [{ lines: [' a', '-b', '+c', '+d'] }] })).toEqual({ added: 2, removed: 1 })
  expect(editSize({ type: 'create', content: 'x\ny\n' })).toEqual({ added: 2, removed: 0 })
  expect(took(400)).toBe('0.4s')
  expect(took(64_000)).toBe('1m 4s')

  // The task list as rows.
  const todos = planFromTodos([
    { content: 'Read', status: 'completed' },
    { content: 'Fix', status: 'in_progress' },
    { content: 'Test', status: 'pending' },
  ])
  expect(segments(todos).map(s => `${s.title}:${s.state}`)).toEqual(['Read:done', 'Fix:now', 'Test:todo'])
  const tasks = updateTask(addTask(addTask([], '1', 'One'), '2', 'Two'), { taskId: '1', status: 'completed' })
  expect(segments(tasks).map(s => s.state)).toEqual(['done', 'now'])
  expect(updateTask(tasks, { taskId: '2', status: 'deleted' }).map(s => s.id)).toEqual(['1'])

  // The wave: one bar per cell, moving right a step per frame.
  expect(wave(0, 4)).toBe('▅▇█▇')
  expect(wave(1, 4)).toBe('▃▆██')
  expect(wave(0, 8)).toMatch(/^[▁▂▃▄▅▆▇█]{8}$/)
  // The desktop's loader is one fixed SVG that animates itself, each bar a beat behind.
  expect(waveSvg('#2f7bf0', 120)).toBe(waveSvg('#2f7bf0', 120))
  expect(waveSvg('#2f7bf0', 120)).toMatch(/^<svg .*width="116".*<animate attributeName="height" .*begin="-0.1s".*<\/svg>$/)

  // The popup: half the band, never under 48 columns; at most n rows, the running one in view.
  expect(popupWidth(160)).toBe(80)
  expect(popupWidth(70)).toBe(48)
  expect(popupWidth(40)).toBe(40)
  const many = planFromTodos(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((content, i) => ({ content, status: i < 5 ? 'completed' : 'pending' })))
  expect(around(segments(many), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments(many.map(s => ({ ...s, status: 'completed' as const }))), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments([]), 3)).toEqual([])
})

test('the Status page toggles compact mode and the chips; compact mode hides tool rows', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine-row</Text>
  })
  // Stands in for the AshPack host's drawing under its drawer pane.
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  for (const surface of SURFACES) {
    const panel = await $.ui.mount({ plugin: 'ashpack-status', surface, ...DRAWER, props: PANE_PROPS })
    // The page is keyed for the host to find.
    expect(JSON.stringify(await panel.drawn())).toContain('"key":"ashpack-page:Status"')
    expect((await panel.find({ key: 'compact' }))?.text).toContain('OFF')
    expect((await panel.find({ key: 'status' }))?.text).toContain('ON')
    await panel.press({ key: 'compact' })
    expect((await panel.find({ key: 'compact' }))?.text).toContain('ON')

    const row = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    // Compact mode leaves the row out: dropped on the terminal, an empty row on the desktop.
    const hidden = JSON.stringify(await row.drawn())
    expect(hidden).not.toContain('engine-row')
    if (surface === 'terminal') expect(hidden).toContain('"display":"none"')
    else expect(hidden).not.toContain('display')

    await panel.press({ key: 'compact' })
    await panel.press({ key: 'status' })
    expect((await panel.find({ key: 'status' }))?.text).toContain('OFF')
    await panel.press({ key: 'status' })
    await row.unmount()
    await panel.unmount()
  }
  // Without the host, the same page in the mod's own pane.
  const own = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'Pane', requestId: 'ashpack-status', props: PANE_PROPS })
  expect(await own.find({ key: 'compact' })).toBeDefined()
  await own.unmount()
})

test('the status chips draw model, branch, context and usage above the prompt', async ($, on) => {
  mock.store(on)
  // Stands in for the AshPack host's drawing under its drawer pane.
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const clock = mock.clock(on, { now: Date.parse('2026-10-08T10:00:00Z') })
  on('settings.read', () => ({ value: { effortLevel: 'high', permissions: { defaultMode: 'auto' } } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => e as never)
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.cwd', () => ({ value: '/Users/ashish/Documents/Code/Mods/ashpack' }))
  on('session.usage', () => ({
    value: {
      startedAt: Date.parse('2026-10-08T09:37:00Z'),
      context: { window: 1_000_000, tokens: 420_000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-08T12:14:00Z' },
        { kind: 'seven_day_fable', percentUsed: 91, resetsAt: '2026-10-11T14:00:00Z' },
      ],
      cost: { usd: 1.24 },
    },
  }))
  // What each command prints, by its first two words; a merge is under way.
  const prints: Record<string, string> = {
    'git status': '# branch.head main\n# branch.ab +1 -0\n1 .M x\n',
    'git rev-parse': '/repo/.git\n',
    'git stash': 'stash@{0}: WIP on main\n',
    'git diff': ' 1 file changed, 3 insertions(+), 1 deletion(-)\n',
    'git log': '1791387600\x1ffix: a thing\n',
    'gh pr': JSON.stringify({ number: 7, state: 'OPEN', isDraft: true, reviewDecision: '', statusCheckRollup: [] }),
  }
  const ran: string[][] = []
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    const words = e.argv.filter(a => a !== '--no-optional-locks').slice(0, 2).join(' ')
    return { value: { exitCode: 0, stdout: prints[words] ?? '', stderr: '' } } as never
  })
  on('fs.list', () => ({ value: [{ name: 'MERGE_HEAD', kind: 'file', size: 0, mtimeMs: 0, isLink: false }] }) as never)

  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint}</Text>
  })

  await $.session.start({ source: 'startup', cwd: '/Users/ashish/Documents/Code/Mods/ashpack' } as never)
  await clock.advance(0) // refreshStatus runs unawaited
  for (const surface of SURFACES) {
    const band = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'AbovePrompt',
      viewport: MAIN,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    // The chips in the band: outlined pills on the desktop, a spaced row on the terminal.
    const text = flatten(await band.drawn())
    for (const part of ['⎇ main', '●1', '↑1', 'ashpack', '$1.24', 'ctx', '42%', 'session', '23%', '↻2h14m', 'fable', '91%']) {
      expect(text).toContain(part)
    }
    // The desktop app names the model and effort in its own footer: no model chip there.
    if (surface === 'terminal') expect(text).toContain('Opus 5.5 1M · ◕ high')
    else expect(text).not.toContain('Opus')
    // Each chip keyed for the AshPack host's strip.
    expect(JSON.stringify(await band.drawn())).toContain('"key":"ashpack-chip:context"')
    // The repo chips start off.
    expect(text).not.toContain('diff')
    expect(text).not.toContain('PR #')
    // The desktop draws the bars as images; the terminal as text.
    const hasSvg = JSON.stringify(await band.drawn()).includes('"type":"Svg"')
    expect(hasSvg).toBe(surface !== 'terminal')
    if (surface === 'terminal') expect(text).toContain('▰')
    await band.unmount()

    // The fullscreen terminal: the grid sits under the prompt, above the engine's hint line.
    // The desktop reports fullscreen too, but draws nothing of a mod's under its prompt: the grid stays above.
    const hint = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'PromptHint',
      viewport: FULL,
      props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' },
    })
    const hintText = flatten(await hint.drawn())
    if (surface === 'terminal') {
      expect(hintText).toContain('◆ Opus 5.5 1M')
      expect(hintText.indexOf('ctx')).toBeLessThan(hintText.indexOf('auto mode on'))
    } else expect(hintText).not.toContain('Opus')
    await hint.unmount()

    const fullBand = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'AbovePrompt',
      viewport: FULL,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    if (surface === 'terminal') expect(flatten(await fullBand.drawn())).not.toContain('ctx')
    else expect(flatten(await fullBand.drawn())).toContain('ctx')
    await fullBand.unmount()
  }

  // The Status page picks which chips show, a row each under the Status chips switch.
  const page = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  for (const key of ['chip-model', 'chip-branch', 'chip-context', 'chip-session', 'chip-week', 'chip-spend']) {
    expect((await page.find({ key }))?.text).toContain('ON')
  }
  for (const key of ['chip-tree', 'chip-lines', 'chip-commit', 'chip-pr']) {
    expect((await page.find({ key }))?.text).toContain('OFF')
  }
  await page.press({ key: 'chip-branch' })
  await page.press({ key: 'chip-week' })
  expect((await page.find({ key: 'chip-branch' }))?.text).toContain('OFF')
  await page.unmount()
  // The desktop app names the model in its own footer: its page has no Model row.
  const deskPage = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', ...DRAWER, props: PANE_PROPS })
  expect(await deskPage.find({ key: 'chip-model' })).toBeUndefined()
  expect(await deskPage.find({ key: 'chip-context' })).toBeDefined()
  await deskPage.unmount()

  // The pick survives a new session, and the band leaves those chips out.
  await $.session.start({ source: 'startup', cwd: '/Users/ashish/Documents/Code/Mods/ashpack' } as never)
  await clock.advance(0)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'AbovePrompt',
      viewport: MAIN,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    const text = flatten(await band.drawn())
    expect(text).not.toContain('⎇ main')
    expect(text).not.toContain('fable')
    expect(text).toContain('ctx')
    expect(text).toContain('session')
    await band.unmount()
  }

  // ↑ and ↓ move a chip among the rows; the band follows, and so does a new session.
  const order = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  await order.press({ key: 'chip-up-spend' }) // past the weekly limits, hidden or not
  await order.press({ key: 'chip-up-spend' }) // past the session limit
  await order.press({ key: 'chip-down-model' })
  await order.press({ key: 'chip-up-branch' }) // already first: nothing moves
  const rows = JSON.stringify(await order.drawn())
  const at = (id: string) => rows.indexOf(`"key":"chip-${id}"`)
  expect(at('branch')).toBeLessThan(at('model'))
  expect(at('model')).toBeLessThan(at('context'))
  expect(at('spend')).toBeLessThan(at('session'))
  expect(at('session')).toBeLessThan(at('week'))
  await order.unmount()
  await $.session.start({ source: 'startup', cwd: '/Users/ashish/Documents/Code/Mods/ashpack' } as never)
  await clock.advance(0)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'AbovePrompt',
      viewport: MAIN,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    const text = flatten(await band.drawn())
    if (surface === 'terminal') expect(text.indexOf('Opus')).toBeLessThan(text.indexOf('ctx'))
    expect(text.indexOf('ctx')).toBeLessThan(text.indexOf('$1.24'))
    expect(text.indexOf('$1.24')).toBeLessThan(text.indexOf('session'))
    await band.unmount()
  }

  // Turned on, the repo chips fetch their data at once and draw it.
  const repoPage = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  for (const key of ['chip-tree', 'chip-lines', 'chip-commit', 'chip-pr']) await repoPage.press({ key })
  await repoPage.unmount()
  await clock.advance(0)
  const band = await $.ui.mount({
    plugin: 'ashpack-status',
    surface: 'desktop',
    component: 'AbovePrompt',
    viewport: MAIN,
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
  })
  const text = flatten(await band.drawn())
  for (const part of ['merging · 1 changed · 1 stash', 'diff +3 −1', 'commit 18h20m ago · fix: a thing', 'PR #7 draft']) expect(text).toContain(part)
  expect(JSON.stringify(await band.drawn())).toContain('"key":"ashpack-chip:pr"')
  await band.unmount()
  // Polling git takes no optional lock; GitHub is asked once, not on every refresh.
  expect(ran.filter(a => a[0] === 'git').every(a => a[1] === '--no-optional-locks')).toBe(true)
  await $.session.start({ source: 'startup', cwd: '/Users/ashish/Documents/Code/Mods/ashpack' } as never)
  await clock.advance(0)
  expect(ran.filter(a => a[0] === 'gh')).toHaveLength(1)
})

test('compact mode: the popup shows the running step with a wave, a card per kind of call, each opening onto its calls', async ($, on) => {
  mock.store(on)
  // Stands in for the Skins mod, which shares the active skin's accent.
  on('state.get', ($, e, next) => {
    const { plugin, key } = e as { plugin: string; key: string } // another plugin's value: not in AshPack's contract
    return plugin === 'ashpack-skins' && key === 'accent' ? ({ value: { value: '#fab387', version: 1 } } as never) : next(e)
  })
  // Stands in for the engine's own drawing under the drawer pane.
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  mock.clock(on, { now: Date.parse('2026-10-08T10:00:00Z') })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.cwd', () => ({ value: '/repo' }))
  // The engine's tools: an edit answers its patch, `false` fails.
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') return { result: { filePath: '/repo/a.ts', structuredPatch: [{ lines: ['-x', '+y', '+z'] }] } } as never
    if (e.tool === 'Bash' && (e as { command?: string }).command === 'false') return { result: { stdout: '', stderr: 'no' }, isError: true } as never
    return { result: {} } as never
  })
  on('turn.start', ($, e) => e as never)
  const footer = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  await footer.press({ key: 'compact' })
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  const bandProps = { hasSurvey: false, isWorking: true, maxRows: 14, bodyColumns: 120, scroll: { offset: 0, bodyRows: 14, contentRows: 0 }, view: {} } as never
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/a.ts', tool_use_id: 'r1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/b.ts', tool_use_id: 'r2' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'c1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'c2' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'x', new_string: 'y', tool_use_id: 'e1' } as never)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ plugin: 'ashpack-status', surface, component: 'AbovePrompt', viewport: FULL, props: bandProps })
    const drawn = JSON.stringify(await band.drawn())
    const text = flatten(await band.drawn())
    expect(drawn).toContain('"width":60') // half of 120
    expect(text).not.toContain('ctx') // the popup takes the chips' place while Claude works
    expect(text).toContain('▸ Thinking…')
    // One card per kind, with its count; nothing listed until one is opened.
    for (const card of ['Read 2', 'Command 2', 'Edit 1']) expect(drawn).toContain(`"label":"${card}"`)
    expect(text).not.toContain('npm test')
    // The terminal draws the loader as text per frame; the desktop as an SVG that animates itself.
    if (surface === 'terminal') expect(text).toMatch(/[▁▂▃▄▅▆▇█]{3}/)
    else expect(drawn).toContain('<animate ')
    expect(drawn).toContain('#fab387') // the loader wears the skin
    // Opened, the Command card lists its commands, how each went; again, it folds.
    await band.press({ key: 'card-command' })
    const open = flatten(await band.drawn())
    expect(open).toContain('✓ $ npm test')
    expect(open).toContain('✗ $ false')
    expect(JSON.stringify(await band.drawn())).toContain('"label":"Command 2 ▾"')
    await band.press({ key: 'card-edit' })
    expect(flatten(await band.drawn())).toContain('✓ a.ts  +2 −1')
    await band.press({ key: 'card-edit' })
    expect(flatten(await band.drawn())).not.toContain('a.ts')
    await band.unmount()
  }

  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'Read the code', status: 'completed', activeForm: 'Reading' },
    { content: 'Fix the card', status: 'in_progress', activeForm: 'Fixing' },
    { content: 'Run tests', status: 'pending', activeForm: 'Testing' },
  ] } as never)
  const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'AbovePrompt', viewport: FULL, props: bandProps })
  const text = flatten(await band.drawn())
  // The task in hand heads the popup; the list is a card of its own, counted.
  for (const part of ['◆ AshPack', 'Fix the card', '1/3']) expect(text).toContain(part)
  expect(JSON.stringify(await band.drawn())).toContain('"label":"Tasks 1/3"')
  expect(text).not.toContain('Run tests')
  await band.press({ key: 'card-tasks' })
  const tasks = flatten(await band.drawn())
  for (const part of ['✓ Read the code', '▸ Fix the card', '○ Run tests']) expect(tasks).toContain(part)
  expect(tasks.indexOf('Read the code')).toBeLessThan(tasks.indexOf('Run tests'))
  await band.unmount()
  await footer.unmount()
})

// Stands in for another mod's background call: Baton lists the sessions every 20 s.
const poller: Plugin = {
  name: 'baton',
  register(on) {
    on('command.run', { command: 'poll' }, async ($, e) => {
      await $.tool.call({ tool: 'ListAgents' } as never)
      return {}
    })
  },
}

test('a plugin\'s own tool call is no step of the turn', { plugins: [poller] }, async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2026-10-08T10:00:00Z') })
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('tool.call', () => ({ result: {} }) as never)
  on('turn.start', ($, e) => e as never)
  const footer = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', ...DRAWER, props: PANE_PROPS })
  await footer.press({ key: 'compact' })
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  const bandProps = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never
  const popup = async () => {
    const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', component: 'AbovePrompt', viewport: FULL, props: bandProps })
    const drawn = await band.drawn()
    await band.unmount()
    return `${flatten(drawn)} ${JSON.stringify(drawn)}` // the cards are Buttons: their labels are props
  }
  await $.command.run({ command: 'poll', args: '' } as never) // the other mod's poll
  const quiet = await popup()
  expect(quiet).not.toContain('ListAgents')
  expect(quiet).not.toContain('Tool 1')
  await $.tool.call({ tool: 'Skill', skill: 'verify', tool_use_id: 's1' } as never)
  const busy = await popup()
  expect(busy).toContain('Skill 1')
  await footer.unmount()
})

test('with a skin on, the chips and the popup draw in its palette', async ($, on) => {
  mock.store(on)
  const palette = { ok: '#a3be8c', warn: '#ebcb8b', hot: '#bf616a', accent: '#88c0d0', blue: '#81a1c1', muted: '#7b88a1' }
  // Stands in for the Skins mod, which shares the active skin's palette.
  on('state.get', ($, e, next) => {
    const { plugin, key } = e as { plugin: string; key: string }
    return plugin === 'ashpack-skins' && key === 'palette' ? ({ value: { value: palette, version: 1 } } as never) : next(e)
  })
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const clock = mock.clock(on, { now: Date.parse('2026-10-08T10:00:00Z') })
  on('settings.read', () => ({ value: {} }))
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', ($, e) => e as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, tokens: 1, percent: 30 }, rateLimits: [] } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head main\n', stderr: '' } }) as never)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  await clock.advance(0)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({
      plugin: 'ashpack-status',
      surface,
      component: 'AbovePrompt',
      viewport: MAIN,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    const drawn = JSON.stringify(await band.drawn())
    expect(drawn).toContain(palette.ok) // the branch, and the context bar under 60%
    expect(drawn).not.toContain(COLORS.ok)
    if (surface === 'terminal') expect(drawn).toContain(palette.accent) // the model chip
    await band.unmount()
  }
})

test('activity helpers: durations, tokens, turn labels, totals', () => {
  expect(lasted(45_000)).toBe('45s')
  expect(lasted(130_000)).toBe('2m 10s')
  expect(lasted(3_840_000)).toBe('1h 04m')
  expect(tokens(820)).toBe('820')
  expect(tokens(12_400)).toBe('12k')
  expect(tokens(1_500)).toBe('1.5k')
  const live = { n: 3, prompt: 'fix it', startedAt: 0, label: 'Reading a.ts', calls: [{ id: 'x', kind: 'read' as const, target: 'a.ts', state: 'running' as const }] }
  // A call still running when the turn ends counts as failed.
  const turn = turnOf(live, { ms: 5000, outcome: 'aborted' })
  expect(turn.calls[0]?.state).toBe('failed')
  const t = addTurn(NO_TOTALS, { ...turn, calls: [{ id: 'e', kind: 'edit', target: 'b.ts', state: 'ok', added: 3, removed: 1 }] })
  expect(t).toEqual({ turns: 1, workMs: 5000, calls: 1, failed: 0, added: 3, removed: 1, files: ['b.ts'] })
  expect(turnLabel({ n: 12, prompt: 'make the popup smaller please', ms: 130_000, calls: [] }, 30)).toBe('#12  make the po… · 2m 10s · 0')
  // The page shows the turn picked, else the running one, else the last.
  expect(shownOf(live, [turn], null)?.isLive).toBe(true)
  expect(shownOf(live, [turn], 3)?.isLive).toBe(false)
  expect(shownOf(null, [turn], null)?.n).toBe(3)
  expect(shownOf(null, [], null)).toBeNull()
  // A pasted escape code would make the card's markup invalid: it is dropped.
  const pasted = turnOf({ ...live, prompt: 'why \u001b[31mred\u001b[0m <b>' }, { ms: 1000, outcome: 'answer' })
  const hero = heroSvg(shownOf(null, [pasted], null), COLORS, 400).source
  expect(hero).not.toContain('\u001b')
  expect(hero).toContain('why [31mred[0m &lt;b&gt;')
})

test('the Activity page keeps each turn: the one in view, its calls, the session, every turn', async ($, on) => {
  mock.store(on)
  let hostPage = 'activity'
  // Stands in for the AshPack host, whose drawer shows one page at a time.
  on('state.get', ($, e, next) => {
    const { plugin, key } = e as { plugin: string; key: string }
    return plugin === 'ashpack' && key === 'page' ? ({ value: { value: hostPage, version: 1 } } as never) : next(e)
  })
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const clock = mock.clock(on, { now: Date.parse('2026-10-08T10:00:00Z') })
  let cost = 1
  on('session.usage', () => ({ value: { startedAt: Date.parse('2026-10-08T09:00:00Z'), context: { window: 1, tokens: 1, percent: 41 }, rateLimits: [], cost: { usd: cost } } }) as never)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head main\n', stderr: '' } }) as never)
  on('tool.call', ($, e) => {
    if (e.tool === 'Edit') return { result: { filePath: '/repo/a.ts', structuredPatch: [{ lines: ['-x', '+y', '+z'] }] } } as never
    if (e.tool === 'Bash' && (e as { command?: string }).command === 'false') return { result: {}, isError: true } as never
    return { result: {} } as never
  })
  on('turn.start', ($, e) => e as never)
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)

  await $.turn.start({ text: 'fix the login bug', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/auth.ts', tool_use_id: 'r1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'x', new_string: 'y', tool_use_id: 'e1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'c1' } as never)
  cost = 1.21
  await clock.advance(130_000)
  const usage = { input_tokens: 1000, output_tokens: 2100, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 7000, model: 'claude-opus-5-5' }
  await $.turn.complete({ answer: 'done', durationMs: 130_000, isAborted: false, turnId: 't1', reason: 'answer', usage } as never)
  await clock.advance(0) // the chips' refresh, which the tiles read

  // Desktop, between turns: the last turn heads the page, its calls listed, and the session's numbers.
  const panel = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', ...DRAWER, props: PANE_PROPS })
  const drawn = async () => JSON.stringify(await panel.drawn())
  let page = await drawn()
  expect(page).toContain('"key":"ashpack-page:Activity"')
  for (const part of ['TURN 1', 'DONE', 'fix the login bug', '2m 10s', '$0.21', '38k in · 2.1k out']) expect(page).toContain(part)
  for (const part of ['src/auth.ts', 'a.ts', '+2', 'false']) expect(page).toContain(part) // the calls
  for (const part of ['SESSION', '1h 02m', 'TOOL CALLS', '1 failed', '1 file', '$1.21', '41%', 'TIMELINE']) expect(page).toContain(part) // the tiles and chart
  expect(page).toContain('"label":"▸ #1  fix the login bug · 2m 10s · 3"')
  // A filter narrows the calls to one kind.
  await panel.press({ key: 'filter-command' })
  page = await drawn()
  expect(page).not.toContain('src/auth.ts')
  expect(page).toContain('"label":"Command 1"')

  // The next turn runs: it takes the head, working; the first stays a row to bring back.
  await $.turn.start({ text: 'now add a test', turnId: 't2' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'login', tool_use_id: 'g1' } as never)
  page = await drawn()
  for (const part of ['TURN 2', 'WORKING', 'now add a test', '<animate']) expect(page).toContain(part)
  expect(page).toContain('"label":"  #1  fix the login bug · 2m 10s · 3"')
  await panel.press({ key: 'turn-1' })
  page = await drawn()
  expect(page).toContain('TURN 1')
  expect(page).toContain('"label":"← Back to now"')
  await panel.press({ key: 'activity-now' })
  expect(await drawn()).toContain('TURN 2')

  // The terminal: the same page in text.
  const term = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  const text = flatten(await term.drawn())
  for (const part of ['TURN 2 · WORKING', 'Thinking…', '“now add a test”', '✓ FIND  login', 'This session', 'TOOL CALLS', 'CONTEXT', '41%', 'TIMELINE ']) expect(text).toContain(part)
  await term.unmount()

  await panel.unmount()
  // Another page up: the Activity tab is its key alone, drawn for nothing.
  hostPage = 'status'
  const other = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', ...DRAWER, props: PANE_PROPS })
  const hidden = JSON.stringify(await other.drawn())
  expect(hidden).toContain('"key":"ashpack-page:Activity"')
  expect(hidden).not.toContain('TURN 2')
  await other.unmount()

  // Without the host, the page has a pane of its own.
  const own = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'Pane', requestId: 'ashpack-activity', props: PANE_PROPS })
  expect(flatten(await own.drawn())).toContain('TURN 2')

  // A /clear starts the page over.
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: {} } as never)
  const cleared = flatten(await own.drawn())
  expect(cleared).toContain('Ready when you are')
  expect(cleared).not.toContain('TURN 2')
  expect(cleared).toContain('TURNS0')
  await own.unmount()
})
