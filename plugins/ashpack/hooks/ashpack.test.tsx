import { expect, mock, test } from 'claude-code/testing'

import {
  addTask,
  around,
  bar,
  COLORS,
  effortLabel,
  gridWidths,
  levelColor,
  parseGit,
  packMods,
  planFromTodos,
  popupWidth,
  prettyModel,
  scanner,
  scannerSvg,
  segments,
  statusGrid,
  stepTab,
  tabLabel,
  updateTask,
  windowLabel,
  without,
} from './format'

const SURFACES = ['terminal', 'desktop'] as const
const FULL = { columns: 160, rows: 50, isFullscreen: true } as never
const MAIN = { columns: 160, rows: 50, isFullscreen: false } as never

// A drawn tree's text, children joined in order.
const flatten = (node: unknown): string =>
  typeof node === 'string'
    ? node
    : ((node as { children?: unknown[] })?.children ?? []).map(flatten).join('')
const DRAWER = { component: 'Pane', requestId: 'ashpack-drawer' } as const
const PANE_PROPS = {
  title: 'AshPack',
  isFocused: true,
  bodyColumns: 60,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 12, contentRows: 12 },
  view: {},
} as never

test('helpers: names, bars, colors, git, tabs, loader', () => {
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(windowLabel('five_hour')).toBe('session')
  expect(windowLabel('seven_day')).toBe('week')
  expect(windowLabel('seven_day_fable')).toBe('fable')
  expect(effortLabel('high')).toBe('◕ high')

  expect(bar(42, 8)).toBe('▰▰▰▱▱▱▱▱')
  expect(bar(150, 4)).toBe('▰▰▰▰')
  expect(levelColor(10)).toBe(COLORS.ok)
  expect(levelColor(60)).toBe(COLORS.warn)
  expect(levelColor(90)).toBe(COLORS.hot)

  const git = parseGit('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -2\n1 .M N... a\n? new.txt\n')
  expect(git).toEqual({ branch: 'main', dirty: 2, ahead: 1, behind: 2 })
  expect(parseGit('')).toBeNull()

  expect(stepTab(['AshPack', 'baton'], 'AshPack', 1)).toBe('baton')
  expect(stepTab(['AshPack', 'baton'], 'baton', 1)).toBe('AshPack')
  expect(stepTab(['AshPack', 'baton'], 'AshPack', -1)).toBe('baton')
  expect(stepTab(['AshPack', 'baton'], 'gone', 1)).toBe('baton')

  const now = Date.parse('2026-10-08T10:00:00Z')
  const grid = statusGrid(
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
  )
  const texts = grid.map(row => row.map(cell => cell.map(sp => sp.text).join('')))
  expect(texts).toEqual([
    ['◆ Opus 5.5 1M ◕ high', '⎇ main', 'ashpack · $1.24 · 23m'],
    ['ctx ▰▰▱▱ 42%', 'session ▰▱▱▱ 23% ↻2h14m', 'week ▰▰▱▱ 41%  fable ▱▱▱▱ 12% ↻3d4h'],
  ])
  // Each section as wide as its widest cell + separator + gap.
  expect(gridWidths(grid, 2)).toEqual([22, 27, 39])

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

  const pack = packMods(
    JSON.stringify({ plugins: [{ name: 'ashpack' }, { name: 'hello' }, { name: 'later' }] }),
    JSON.stringify({ plugins: { 'ashpack@ashpack': [{}], 'hello@ashpack': [{}], 'baton@baton-mods': [{}] } }),
    { 'ashpack@ashpack': true, 'hello@ashpack': false },
    'ashpack',
  )
  expect(pack.map(m => `${m.name}:${m.state}`)).toEqual(['ashpack:on', 'hello:off', 'later:missing'])

  // A wrapping mod's tab keeps its own part, not the badges of the mod beneath it.
  const baton = { type: 'Text', props: {}, children: ['baton-badge'] }
  const skins = { type: 'Box', props: {}, children: [baton, { type: 'Button', props: { label: 'Skins' }, children: [] }] }
  expect(flatten(without(skins, baton))).toBe('')
  expect((without(skins, baton) as { children: unknown[] }).children).toHaveLength(1)
  expect(without(baton, undefined)).toEqual(baton)
  expect(tabLabel('ashpack-skins', 'ashpack')).toBe('skins')
  expect(tabLabel('baton', 'ashpack')).toBe('baton')

  // The block enters at the left edge, its trail behind it, and leaves at the right.
  expect(scanner(0, 8)).toBe('█·······')
  expect(scanner(4, 8)).toBe('░▒▓██···')
  expect(scanner(7, 8)).toBe('···░▒▓██')
  expect(scanner(11, 8)).toBe('·······░')
  expect(scanner(13, 8)).toBe(scanner(0, 8))
  // The desktop's loader is one fixed SVG that animates itself.
  expect(scannerSvg('#82aaff', 40)).toBe(scannerSvg('#82aaff', 40))
  expect(scannerSvg('#82aaff', 40)).toMatch(/^<svg .*<animateTransform .*repeatCount="indefinite".*<\/svg>$/)

  // The popup: half the band, never under 48 columns; at most n rows, the running one in view.
  expect(popupWidth(160)).toBe(80)
  expect(popupWidth(70)).toBe(48)
  expect(popupWidth(40)).toBe(40)
  const many = planFromTodos(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((content, i) => ({ content, status: i < 5 ? 'completed' : 'pending' })))
  expect(around(segments(many, 'x', []), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments(many.map(s => ({ ...s, status: 'completed' as const })), 'x', []), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments([], 'x', []), 3).map(s => s.title)).toEqual(['x'])
})

test('the panel toggles compact mode and status rows; compact mode hides tool rows', async ($, on) => {
  mock.store(on)
  for (const surface of SURFACES) {
    const panel = await $.ui.mount({ plugin: 'ashpack', surface, ...DRAWER, props: PANE_PROPS })
    expect((await panel.find({ key: 'compact' }))?.text).toContain('OFF')
    expect((await panel.find({ key: 'status' }))?.text).toContain('ON')
    await panel.press({ key: 'compact' })
    expect((await panel.find({ key: 'compact' }))?.text).toContain('ON')

    const row = await $.ui.mount({
      plugin: 'ashpack',
      surface,
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(JSON.stringify(await row.drawn())).toContain('"display":"none"')

    await panel.press({ key: 'compact' })
    await panel.press({ key: 'status' })
    expect((await panel.find({ key: 'status' }))?.text).toContain('OFF')
    await panel.press({ key: 'status' })
    await row.unmount()
    await panel.unmount()
  }
})

test('the footer drawer folds other mods into tabs of a floating card', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/nowhere' })
  const opened: string[] = []
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  const files: Record<string, string> = {
    '/nowhere/.claude/plugins/known_marketplaces.json': JSON.stringify({ ashpack: { installLocation: '/pack' } }),
    '/nowhere/.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: { 'ashpack@ashpack': [{}], 'hello@ashpack': [{}] } }),
    '/pack/.claude-plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'ashpack' }, { name: 'hello' }] }),
  }
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }))
  on('settings.read', () => ({ value: { enabledPlugins: { 'ashpack@ashpack': true, 'hello@ashpack': false } } }))
  const ran: string[] = []
  on('process.run', ($, e) => (ran.push(e.argv.join(' ')), { value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  const filled: string[] = []
  on('prompt.fill', ($, e) => (filled.push(e.text), { isFilled: true }) as never)
  // Stands in for baton: a hook beneath ashpack that draws its own footer badge.
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>baton-badge</Text>
  })
  for (const surface of SURFACES) {
    const footer = await $.ui.mount({ plugin: 'ashpack', surface, component: 'SessionMode', viewport: FULL, props: { modes: ['focus'] } })
    expect(await footer.find({ text: /baton-badge/ })).toBeUndefined()
    expect(await footer.find({ text: /focus/ })).toBeDefined()
    expect((await footer.find({ key: 'ashpack' }))?.text).toContain('▸')

    // The desktop reports fullscreen (it docks panes) but draws no floating card: a pane opens.
    if (surface === 'desktop') {
      await footer.press({ key: 'ashpack' })
      expect(opened).toEqual(['ashpack-drawer'])
      expect(JSON.stringify(await footer.drawn())).not.toContain('"position":"absolute"')
      expect(await footer.find({ text: /baton-badge/ })).toBeDefined()
      await footer.press({ key: 'ashpack' })
      await footer.unmount()
      opened.length = 0
      continue
    }

    // The fullscreen terminal: a card floats above the footer, AshPack's tab first; no pane opens.
    await footer.press({ key: 'ashpack' })
    expect((await footer.find({ key: 'ashpack' }))?.text).toContain('◂')
    expect(opened).toEqual([])
    expect(JSON.stringify(await footer.drawn())).toContain('"position":"absolute"')
    expect(await footer.find({ text: /2 mods/ })).toBeDefined()
    expect(await footer.find({ text: /baton-badge/ })).toBeUndefined()
    expect((await footer.find({ key: 'compact' }))?.text).toContain('OFF')
    await footer.press({ key: 'compact' })
    expect((await footer.find({ key: 'compact' }))?.text).toContain('ON')
    await footer.press({ key: 'compact' })

    // Mods tab: the pack's mods; a press turns one on and hands over /reload-plugins.
    await footer.press({ key: 'tab-next' })
    expect(await footer.find({ text: /◆ ashpack/ })).toBeDefined()
    expect((await footer.find({ key: 'mod-hello' }))?.text).toContain('○ hello')
    await footer.press({ key: 'mod-hello' })
    expect(ran.at(-1)).toBe('claude plugin enable hello@ashpack')
    expect(filled.at(-1)).toBe('/reload-plugins')
    await footer.press({ key: 'mods-update' })
    expect(ran.slice(-3)).toEqual(['claude plugin marketplace update ashpack', 'claude plugin update ashpack@ashpack', 'claude plugin update hello@ashpack'])

    // The arrow moves on to the stand-in's tab: its badge, drawn by it, and not ours.
    await footer.press({ key: 'tab-next' })
    expect(await footer.find({ text: /baton-badge/ })).toBeDefined()
    expect(await footer.find({ key: 'compact' })).toBeUndefined()
    await footer.press({ key: 'tab-next' })
    expect(await footer.find({ key: 'compact' })).toBeDefined()

    await footer.press({ key: 'ashpack' })
    expect(await footer.find({ text: /baton-badge/ })).toBeUndefined()
    expect(await footer.find({ key: 'compact' })).toBeUndefined()
    await footer.unmount()

    // Outside fullscreen a card would be clipped to the footer row: a small pane opens.
    const main = await $.ui.mount({ plugin: 'ashpack', surface, component: 'SessionMode', viewport: MAIN, props: { modes: [] } })
    await main.press({ key: 'ashpack' })
    expect(opened.at(-1)).toBe('ashpack-drawer')
    expect(await main.find({ key: 'compact' })).toBeUndefined()
    await main.press({ key: 'ashpack' })
    await main.unmount()
    opened.length = 0
  }
})

test('the status rows draw model, branch, context and usage bars above the prompt', async ($, on) => {
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
      plugin: 'ashpack',
      surface,
      component: 'AbovePrompt',
      viewport: MAIN,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    const text = flatten(await band.drawn())
    for (const part of ['Opus 5.5 1M', '◕ high', '⎇ main', '●1', '↑1', 'ashpack', '$1.24', 'ctx', '42%', 'session', '23%', '↻2h14m', 'fable', '91%']) {
      expect(text).toContain(part)
    }
    await band.unmount()

    // Fullscreen: the grid sits under the prompt, above the engine's hint line.
    const hint = await $.ui.mount({
      plugin: 'ashpack',
      surface,
      component: 'PromptHint',
      viewport: FULL,
      props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' },
    })
    const hintText = flatten(await hint.drawn())
    expect(hintText).toContain('◆ Opus 5.5 1M')
    expect(hintText.indexOf('ctx')).toBeLessThan(hintText.indexOf('auto mode on'))
    await hint.unmount()

    const fullBand = await $.ui.mount({
      plugin: 'ashpack',
      surface,
      component: 'AbovePrompt',
      viewport: FULL,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    expect(flatten(await fullBand.drawn())).not.toContain('Opus')
    await fullBand.unmount()
  }
})

test('compact mode: a half-width popup lists the turn\'s sections as rows, the running one with a loader', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2026-10-08T10:00:00Z') })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('tool.call', () => ({ result: {} }) as never)
  on('turn.start', ($, e) => e as never)
  const footer = await $.ui.mount({ plugin: 'ashpack', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  await footer.press({ key: 'compact' })
  await $.turn.start({ prompt: 'go', turnId: 't1' } as never)
  const bandProps = { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never
  // No task list: the finished step, then the running one with the loader beside it.
  await $.tool.call({ tool: 'Skill', skill: 'verify' } as never)
  for (const surface of SURFACES) {
    const trail = await $.ui.mount({ plugin: 'ashpack', surface, component: 'AbovePrompt', viewport: FULL, props: bandProps })
    const drawn = JSON.stringify(await trail.drawn())
    const text = flatten(await trail.drawn())
    expect(drawn).toContain('"width":60') // half of 120
    expect(text).toContain('✓ Running /verify')
    expect(text).toContain('▸ Thinking…')
    // The terminal draws the loader as text per frame; the desktop as an SVG that animates itself.
    if (surface === 'terminal') expect(text).toMatch(/·+|█/)
    else expect(drawn).toContain('animateTransform')
    await trail.unmount()
  }

  await $.tool.call({ tool: 'TodoWrite', todos: [
    { content: 'Read the code', status: 'completed', activeForm: 'Reading' },
    { content: 'Fix the card', status: 'in_progress', activeForm: 'Fixing' },
    { content: 'Run tests', status: 'pending', activeForm: 'Testing' },
  ] } as never)
  const band = await $.ui.mount({ plugin: 'ashpack', surface: 'terminal', component: 'AbovePrompt', viewport: FULL, props: bandProps })
  const text = flatten(await band.drawn())
  for (const part of ['◆ AshPack', '✓ Read the code', '▸ Fix the card', '○ Run tests', '1/3']) expect(text).toContain(part)
  // One row per section: the order reads top to bottom.
  expect(text.indexOf('Read the code')).toBeLessThan(text.indexOf('Fix the card'))
  expect(text.indexOf('Fix the card')).toBeLessThan(text.indexOf('Run tests'))
  await band.unmount()
  await footer.unmount()
})
