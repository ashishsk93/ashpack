import { expect, mock, test } from 'claude-code/testing'

import {
  addTask,
  around,
  bar,
  barSpans,
  barSvg,
  COLORS,
  effortLabel,
  isBar,
  levelColor,
  parseGit,
  planFromTodos,
  popupWidth,
  prettyModel,
  segments,
  statusChips,
  updateTask,
  wave,
  waveSvg,
  windowLabel,
} from './format'

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

  expect(bar(42, 8)).toEqual(['▰▰▰', '▱▱▱▱▱'])
  expect(bar(150, 4)).toEqual(['▰▰▰▰', ''])
  expect(levelColor(10)).toBe(COLORS.ok)
  expect(levelColor(60)).toBe(COLORS.warn)
  expect(levelColor(90)).toBe(COLORS.hot)

  const git = parseGit('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -2\n1 .M N... a\n? new.txt\n')
  expect(git).toEqual({ branch: 'main', dirty: 2, ahead: 1, behind: 2 })
  expect(parseGit('')).toBeNull()

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
      git: { branch: 'main', dirty: 0, ahead: 0, behind: 0 },
      folder: 'ashpack',
      costUsd: 1.24,
      startedAt: Date.parse('2026-10-08T09:37:00Z'),
    },
    now,
    4,
    '#fab387',
  )
  const textOf = (cell: (typeof chips)[number]) => cell.flatMap(sp => (isBar(sp) ? barSpans(sp) : [sp])).map(sp => sp.text).join('')
  expect(chips.map(textOf)).toEqual([
    '◆ Opus 5.5 1M · ◕ high',
    '⎇ main',
    'ctx ▰▰▱▱ 42%',
    'session ▰▱▱▱ 23% ↻2h14m',
    'week ▰▰▱▱ 41%  fable ▱▱▱▱ 12% ↻3d4h',
    'ashpack · $1.24 · 23m',
  ])
  const model = chips[0]?.[0]
  expect(model && !isBar(model) ? model.color : undefined).toBe('#fab387') // the model wears the skin's accent
  // The desktop's bar: one image, lit segments solid and the rest faint.
  expect(barSvg(42, 4)).toMatch(/^<svg .*opacity="1".*opacity="0.25".*<\/svg>$/)
  expect((barSvg(42, 4).match(/<rect/g) ?? []).length).toBe(4)

  // Sections: the phases with no task list, else the list itself.
  // No task list: the latest finished steps, then the running one.
  expect(segments([], 'Thinking', []).map(s => `${s.title}:${s.state}`)).toEqual(['Thinking:now'])
  expect(segments([], 'Running ls', ['a', 'b', 'c', 'd']).map(s => `${s.title}:${s.state}`)).toEqual([
    'b:done',
    'c:done',
    'd:done',
    'Running ls:now',
  ])
  const todos = planFromTodos([
    { content: 'Read', status: 'completed' },
    { content: 'Fix', status: 'in_progress' },
    { content: 'Test', status: 'pending' },
  ])
  expect(segments(todos, 'Think', []).map(s => `${s.title}:${s.state}`)).toEqual(['Read:done', 'Fix:now', 'Test:todo'])
  const tasks = updateTask(addTask(addTask([], '1', 'One'), '2', 'Two'), { taskId: '1', status: 'completed' })
  expect(segments(tasks, 'Think', []).map(s => s.state)).toEqual(['done', 'now'])
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
  expect(around(segments(many, 'x', []), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments(many.map(s => ({ ...s, status: 'completed' as const })), 'x', []), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments([], 'x', []), 3).map(s => s.title)).toEqual(['x'])
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
  on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head main\n# branch.ab +1 -0\n1 .M x\n', stderr: '' } }) as never)

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
    expect(JSON.stringify(await band.drawn())).toContain('"key":"ashpack-chip:ctx"')
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
})

test('compact mode: a half-width popup lists the turn\'s sections as rows, the running one with a loader', async ($, on) => {
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
  on('tool.call', () => ({ result: {} }) as never)
  on('turn.start', ($, e) => e as never)
  const footer = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  await footer.press({ key: 'compact' })
  await $.turn.start({ prompt: 'go', turnId: 't1' } as never)
  const bandProps = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never
  // No task list: the finished step, then the running one with the loader beside it.
  await $.tool.call({ tool: 'Skill', skill: 'verify' } as never)
  for (const surface of SURFACES) {
    const trail = await $.ui.mount({ plugin: 'ashpack-status', surface, component: 'AbovePrompt', viewport: FULL, props: bandProps })
    const drawn = JSON.stringify(await trail.drawn())
    const text = flatten(await trail.drawn())
    expect(drawn).toContain('"width":60') // half of 120
    expect(text).not.toContain('ctx') // the popup takes the chips' place while Claude works
    expect(text).toContain('✓ Running /verify')
    expect(text).toContain('▸ Thinking…')
    // The terminal draws the loader as text per frame; the desktop as an SVG that animates itself.
    if (surface === 'terminal') expect(text).toMatch(/[▁▂▃▄▅▆▇█]{3}/)
    else expect(drawn).toContain('<animate ')
    expect(drawn).toContain('#fab387') // the loader wears the skin
    await trail.unmount()
  }

  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'Read the code', status: 'completed', activeForm: 'Reading' },
    { content: 'Fix the card', status: 'in_progress', activeForm: 'Fixing' },
    { content: 'Run tests', status: 'pending', activeForm: 'Testing' },
  ] } as never)
  const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'AbovePrompt', viewport: FULL, props: bandProps })
  const text = flatten(await band.drawn())
  for (const part of ['◆ AshPack', '✓ Read the code', '▸ Fix the card', '○ Run tests', '1/3']) expect(text).toContain(part)
  // One row per section: the order reads top to bottom.
  expect(text.indexOf('Read the code')).toBeLessThan(text.indexOf('Fix the card'))
  expect(text.indexOf('Fix the card')).toBeLessThan(text.indexOf('Run tests'))
  await band.unmount()
  await footer.unmount()
})
