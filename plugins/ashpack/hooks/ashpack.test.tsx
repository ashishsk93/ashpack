import { expect, mock, test } from 'claude-code/testing'

import {
  addTask,
  around,
  bar,
  COLORS,
  findPages,
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
  updateTask,
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

test('helpers: names, bars, colors, git, tabs, loader', () => {
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(windowLabel('five_hour')).toBe('session')
  expect(windowLabel('seven_day')).toBe('week')
  expect(windowLabel('seven_day_fable')).toBe('fable')

  expect(bar(42, 8)).toEqual(['━━━', '─────'])
  expect(bar(150, 4)).toEqual(['━━━━', ''])
  expect(levelColor(10)).toBe(COLORS.ok)
  expect(levelColor(60)).toBe(COLORS.warn)
  expect(levelColor(90)).toBe(COLORS.hot)

  const git = parseGit('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -2\n1 .M N... a\n? new.txt\n')
  expect(git).toEqual({ branch: 'main', dirty: 2, ahead: 1, behind: 2 })
  expect(parseGit('')).toBeNull()

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
    ['Opus 5.5 1M · high', 'main', 'ashpack · $1.24 · 23m'],
    ['ctx ━━── 42%', 'session ━─── 23% · resets 2h14m', 'week ━━── 41%  fable ──── 12% · resets 3d4h'],
  ])
  // Each section as wide as its widest cell + separator + gap.
  expect(gridWidths(grid, 2)).toEqual([20, 35, 47])

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

  // The drawer's pages: Boxes keyed `ashpack-page:<Label>` anywhere in the tree, one per id.
  const page = (label: string, text: string) => ({ type: 'Box', props: { key: `ashpack-page:${label}` }, children: [text] })
  const tree = { type: 'Box', props: {}, children: [{ type: 'Box', props: {}, children: [page('Baton', 'b')] }, page('Skins', 's'), page('skins', 'dup'), page('Mods', 'x')] }
  expect(findPages(tree).map(p => `${p.id}:${p.label}:${flatten(p.tree)}`)).toEqual(['baton:Baton:b', 'skins:Skins:s'])
  expect(findPages('engine text')).toEqual([])

  // The pill enters at the left edge of the track and leaves at the right.
  expect(scanner(0, 8)).toBe('╸───────')
  expect(scanner(5, 8)).toBe('╺━━━━╸──')
  expect(scanner(7, 8)).toBe('──╺━━━━╸')
  expect(scanner(13, 8)).toBe('────────')
  expect(scanner(14, 8)).toBe(scanner(0, 8))
  // The desktop's loader is one fixed SVG that animates itself.
  expect(scannerSvg('#2f7bf0', 160)).toBe(scannerSvg('#2f7bf0', 160))
  expect(scannerSvg('#2f7bf0', 160)).toMatch(/^<svg .*<animate attributeName="x" .*repeatCount="indefinite".*<\/svg>$/)

  // The popup: half the band, never under 48 columns; at most n rows, the running one in view.
  expect(popupWidth(160)).toBe(80)
  expect(popupWidth(70)).toBe(48)
  expect(popupWidth(40)).toBe(40)
  const many = planFromTodos(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((content, i) => ({ content, status: i < 5 ? 'completed' : 'pending' })))
  expect(around(segments(many, 'x', []), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments(many.map(s => ({ ...s, status: 'completed' as const })), 'x', []), 3).map(s => s.title)).toEqual(['e', 'f', 'g'])
  expect(around(segments([], 'x', []), 3).map(s => s.title)).toEqual(['x'])
})

test('the drawer\'s Home page toggles compact mode and status rows; compact mode hides tool rows', async ($, on) => {
  mock.store(on)
  // Stands in for the engine's own drawing under the drawer pane.
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  for (const surface of SURFACES) {
    const panel = await $.ui.mount({ plugin: 'ashpack', surface, ...DRAWER, props: PANE_PROPS })
    expect((await panel.find({ key: 'compact' }))?.text).toBe('Off')
    expect((await panel.find({ key: 'status' }))?.text).toBe('On')
    await panel.press({ key: 'compact' })
    expect((await panel.find({ key: 'compact' }))?.text).toBe('On')

    const row = await $.ui.mount({
      plugin: 'ashpack',
      surface,
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(JSON.stringify(await row.drawn())).toContain('"display":"none"')

    await panel.press({ key: 'compact' })
    await panel.press({ key: 'status' })
    expect((await panel.find({ key: 'status' }))?.text).toBe('Off')
    await panel.press({ key: 'status' })
    await row.unmount()
    await panel.unmount()
  }
})

test('the footer opens the drawer: a side pane with a page per mod that draws one, and Mods', async ($, on) => {
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
  // Stands in for a mod with no drawer page: it keeps its footer badge.
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>old-badge</Text>
  })
  // Stands in for a mod that draws a page into the drawer, with a button of its own.
  let pressed = 0
  on('ui.render', DRAWER, ($, e) => {
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box>
        <Box key="ashpack-page:Baton">
          <Button key="baton-ping" plain label="ping" onPress={() => void pressed++} />
        </Box>
      </Box>
    )
  })
  for (const surface of SURFACES) {
    const footer = await $.ui.mount({ plugin: 'ashpack', surface, component: 'SessionMode', viewport: FULL, props: { modes: ['focus'] } })
    expect(await footer.find({ text: /old-badge/ })).toBeDefined()
    expect((await footer.find({ key: 'ashpack' }))?.text).toBe('AshPack')
    // Every surface opens the same side pane; nothing floats over the footer.
    await footer.press({ key: 'ashpack' })
    expect(opened).toEqual(['ashpack'])
    expect((await footer.find({ key: 'ashpack' }))?.text).toBe('AshPack')
    expect(JSON.stringify(await footer.drawn())).not.toContain('"position":"absolute"')

    const pane = await $.ui.mount({ plugin: 'ashpack', surface, ...DRAWER, props: PANE_PROPS })
    for (const id of ['home', 'baton', 'mods']) expect(await pane.find({ key: `page-${id}` })).toBeDefined()
    expect(await pane.find({ key: 'compact' })).toBeDefined()
    expect(await pane.find({ key: 'baton-ping' })).toBeUndefined()

    // The mod's page, drawn by it; its button runs its own handler.
    await pane.press({ key: 'page-baton' })
    expect(await pane.find({ key: 'compact' })).toBeUndefined()
    await pane.press({ key: 'baton-ping', plugin: 'test' })
    expect(pressed).toBeGreaterThan(0)

    // Mods: the pack's mods; a press turns one on and hands over /reload-plugins.
    await pane.press({ key: 'page-mods' })
    expect(await pane.find({ text: /this pack/ })).toBeDefined()
    expect((await pane.find({ key: 'mod-hello' }))?.text).toContain('turn on')
    await pane.press({ key: 'mod-hello' })
    expect(ran.at(-1)).toBe('claude plugin enable hello@ashpack')
    expect(filled.at(-1)).toBe('/reload-plugins')
    await pane.press({ key: 'mods-update' })
    expect(ran.slice(-3)).toEqual(['claude plugin marketplace update ashpack', 'claude plugin update ashpack@ashpack', 'claude plugin update hello@ashpack'])
    await pane.press({ key: 'page-home' })
    await pane.unmount()

    await footer.press({ key: 'ashpack' })
    expect((await footer.find({ key: 'ashpack' }))?.text).toBe('AshPack')
    await footer.unmount()
    opened.length = 0
  }
  // `/ashpack <page>` opens the drawer on that page.
  await $.command.run({ command: 'ashpack', args: 'Baton' } as never)
  const pane = await $.ui.mount({ plugin: 'ashpack', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  expect(await pane.find({ key: 'baton-ping' })).toBeDefined()
  await pane.unmount()
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
    for (const part of ['Opus 5.5 1M', '· high', 'main', '1 changed', '1 ahead', 'ashpack', '$1.24', 'ctx', '42%', 'session', '23%', 'resets 2h14m', 'fable', '91%']) {
      expect(text).toContain(part)
    }
    await band.unmount()

    // The fullscreen terminal: the grid sits under the prompt, above the engine's hint line.
    // The desktop reports fullscreen too, but draws nothing of a mod's under its prompt: the grid stays above.
    const hint = await $.ui.mount({
      plugin: 'ashpack',
      surface,
      component: 'PromptHint',
      viewport: FULL,
      props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' },
    })
    const hintText = flatten(await hint.drawn())
    if (surface === 'terminal') {
      expect(hintText).toContain('Opus 5.5 1M · high')
      expect(hintText.indexOf('ctx')).toBeLessThan(hintText.indexOf('auto mode on'))
    } else expect(hintText).not.toContain('Opus')
    await hint.unmount()

    const fullBand = await $.ui.mount({
      plugin: 'ashpack',
      surface,
      component: 'AbovePrompt',
      viewport: FULL,
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never,
    })
    if (surface === 'terminal') expect(flatten(await fullBand.drawn())).not.toContain('Opus')
    else expect(flatten(await fullBand.drawn())).toContain('Opus 5.5 1M')
    await fullBand.unmount()
  }
})

test('compact mode: a half-width popup lists the turn\'s sections as rows, the running one with a loader', async ($, on) => {
  mock.store(on)
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
    if (surface === 'terminal') expect(text).toMatch(/─+|━/)
    else expect(drawn).toContain('<animate ')
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
