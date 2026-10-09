import { expect, mock, test } from 'claude-code/testing'

import { parseBlocks, parseInline } from './markdown'
import { cardLayout, duration, isLightTheme, kindOf, pick, pixelRows, pixelSvg, pixelWidth, SKINS, targetOf, themeFor, toolLabel } from './skins'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = { component: 'Pane', requestId: 'ashpack-skins' } as const
const DRAWER = { component: 'Pane', requestId: 'ashpack' } as const
const PANE_PROPS = {
  title: 'Skins',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30, contentRows: 30 },
  view: {},
} as never

test('helpers', () => {
  expect(SKINS.length).toBe(12)
  expect(new Set(SKINS.map(s => s.id)).size).toBe(12)
  expect(kindOf('Read')).toBe('read')
  expect(kindOf('mcp__github__search')).toBe('mcp')
  expect(kindOf('Agent')).toBeNull()
  expect(toolLabel('mcp__github__search_code')).toBe('github:search_code')
  expect(targetOf('Read', { file_path: '/repo/src/a.ts' }, '/repo')).toBe('src/a.ts')
  expect(targetOf('Bash', { command: 'npm\n  test' }, '/repo')).toBe('npm test')
  expect(targetOf('Agent', {}, '/repo')).toBe('')
  expect(duration(3_400)).toBe('3s')
  expect(duration(64_000)).toBe('1m 4s')
  expect(isLightTheme('light-daltonized')).toBe(true)
  expect(isLightTheme('dark')).toBe(false)
  expect(pick(['a', 'b', 'c'], 'Sauteing')).toBe(pick(['a', 'b', 'c'], 'Sauteing'))
  expect(cardLayout(100, 2)).toEqual({ perRow: 3, width: 32 })
  expect(cardLayout(52, 2)).toEqual({ perRow: 2, width: 25 })
  expect(cardLayout(40, 2)).toEqual({ perRow: 1, width: 40 })
  expect(cardLayout(62, 2)).toEqual({ perRow: 2, width: 30 })
  // Rows 0+1, 2+3 and 4 alone share cells: S's top bar over its left post, then its middle bar, then its foot.
  expect(pixelRows('S')).toEqual([['█▀▀'], ['▀▀█'], ['▀▀▀']])
  expect(pixelWidth('ASHPACK SKINS')).toBe(50)
  expect(pixelWidth('SKINS')).toBe(20)
  // The desktop's banner: one square per lit pixel, each letter in its own color.
  const svg = pixelSvg('SK', ['#111111', '#222222'], 6)
  expect(svg).toContain('viewBox="0 0 7 5" width="42" height="30"')
  expect(svg.match(/<rect /g)).toHaveLength(11 + 10) // S has 11 lit pixels, K 10
  expect(svg).toContain('<rect x="4" y="0" width="1" height="1" fill="#222222"/>') // K starts after S and a gap
  // Dark or light keeps the theme's variant.
  expect(themeFor('dark-ansi', true)).toBe('light-ansi')
  expect(themeFor('light-daltonized', false)).toBe('dark-daltonized')
  expect(themeFor('auto', true)).toBe('light')
  expect(themeFor(undefined, false)).toBe('dark')
})

test('markdown: inline spans and blocks', () => {
  expect(parseInline('a **b** `c` *d* [e](https://x.dev) snake_case_name _f_')).toEqual([
    { text: 'a ', kind: 'plain' },
    { text: 'b', kind: 'bold' },
    { text: ' ', kind: 'plain' },
    { text: 'c', kind: 'code' },
    { text: ' ', kind: 'plain' },
    { text: 'd', kind: 'italic' },
    { text: ' ', kind: 'plain' },
    { text: 'e', kind: 'link', href: 'https://x.dev' },
    { text: ' snake_case_name ', kind: 'plain' },
    { text: 'f', kind: 'italic' },
  ])
  const blocks = parseBlocks(
    ['# Title', 'one', 'line', '', '- a', '  - b', '1. c', '> q', '---', '```ts', 'const x = 1', '```', '| h | i |', '|---|---|', '| 1 | 2 |', '', '```py', 'open'].join('\n'),
  )
  expect(blocks.map(b => b.kind)).toEqual(['heading', 'para', 'item', 'item', 'item', 'quote', 'rule', 'code', 'markdown', 'code'])
  expect(blocks[1]).toEqual({ kind: 'para', spans: [{ text: 'one line', kind: 'plain' }] })
  expect(blocks.slice(2, 5).map(b => (b.kind === 'item' ? `${b.marker}${b.depth}` : ''))).toEqual(['•0', '•1', '1.0'])
  expect(blocks[7]).toEqual({ kind: 'code', lang: 'ts', code: 'const x = 1' })
  expect(blocks[8]).toEqual({ kind: 'markdown', text: '| h | i |\n|---|---|\n| 1 | 2 |' })
  expect(blocks[9]).toEqual({ kind: 'code', lang: 'py', code: 'open' }) // a fence still streaming
})

test('the side pane shows a mock card per skin; pressing one picks it and reskins tool rows', async ($, on) => {
  mock.store(on)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  // Stands in for Claude Code's own row.
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine-row</Text>
  })
  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ plugin: 'ashpack-skins', surface, ...PANE, props: PANE_PROPS })
    for (const skin of SKINS) expect(await pane.find({ key: `skin-${skin.id}` })).toBeDefined()
    expect(await pane.find({ text: /fix the login bug/ })).toBeDefined()
    // The terminal's banner is half blocks; the desktop spaces lines apart, so it gets an SVG.
    expect(JSON.stringify(await pane.drawn())).toContain(surface === 'terminal' ? '█▀▀' : '<svg')

    await pane.press({ key: 'skin-nord' })
    expect(JSON.stringify(await pane.drawn())).toContain('in use')

    const row = await $.ui.mount({
      plugin: 'ashpack-skins',
      surface,
      component: 'ToolUse',
      props: { tool_use_id: 't1', tool: 'Read', input: { file_path: '/repo/src/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    const drawn = JSON.stringify(await row.drawn())
    expect(drawn).toContain('src/a.ts')
    expect(drawn).toContain(SKINS.find(s => s.id === 'nord')?.dark.blue)

    // The toggle turns skins off and on; the pick is kept.
    await pane.press({ key: 'skin-toggle' })
    expect((await pane.find({ key: 'skin-toggle' }))?.text).toBe('Skins off')
    expect(JSON.stringify(await row.drawn())).toContain('engine-row')
    await pane.press({ key: 'skin-toggle' })
    expect(JSON.stringify(await row.drawn())).toContain(SKINS.find(s => s.id === 'nord')?.dark.blue)

    // The whole mock picks its skin, and turns skins on.
    await pane.press({ key: 'skin-toggle' })
    // The terminal's whole mock is a button; the desktop's mock is text (a Button of Text draws nothing there).
    if (surface === 'terminal') await pane.press({ key: 'mock-monokai' })
    else {
      expect(JSON.stringify(await pane.drawn())).not.toMatch(/"type":"Button"[^}]*"key":"mock-/)
      await pane.press({ key: 'skin-monokai' })
    }
    expect((await pane.find({ key: 'skin-toggle' }))?.text).toBe('Skins on')
    expect(JSON.stringify(await row.drawn())).toContain(SKINS.find(s => s.id === 'monokai')?.dark.blue)
    await pane.press({ key: 'skin-toggle' })
    await row.unmount()
    await pane.unmount()
  }
})

test('the picker is a page of the AshPack drawer; /skin opens it there, or its own pane without AshPack', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  // Stands in for the engine's drawing under the drawer, and for AshPack's command.
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const ran: string[] = []
  on('command.run', { command: 'ashpack' }, ($, e) => (ran.push(e.args), { text: '' }) as never)
  const opened: string[] = []
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  let hasAshpack = true
  on('settings.read', () => ({ value: { enabledPlugins: hasAshpack ? { 'ashpack@ashpack': true } : {} } }))

  for (const surface of SURFACES) {
    const drawer = await $.ui.mount({ plugin: 'ashpack-skins', surface, ...DRAWER, props: PANE_PROPS })
    const page = await drawer.find({ key: 'ashpack-page:Skins' })
    expect(page).toBeDefined()
    expect(await drawer.find({ key: 'skin-dracula' })).toBeDefined()
    await drawer.press({ key: 'skin-dracula' })
    expect(JSON.stringify(await drawer.drawn())).toContain('in use')
    await drawer.unmount()
  }

  await $.command.run({ command: 'skin', args: '' } as never)
  await clock.advance(0)
  expect(ran).toEqual(['skins'])
  expect(opened).toEqual([])
  hasAshpack = false
  await $.command.run({ command: 'skin', args: '' } as never)
  expect(opened).toEqual(['ashpack-skins'])
})

test('dark or light: the switch picks the palette and Claude Code\'s theme; a prompt sits in an outline', async ($, on) => {
  mock.store(on)
  let theme = 'dark-ansi'
  on('config.list', () => ({ value: [{ key: 'theme', value: theme }] }) as never)
  const set: unknown[] = []
  on('config.set', ($, e) => (set.push(e.value), (theme = String(e.value)), { value: e.value }) as never)
  on('ui.log', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/repo' }) as never)
  const nord = SKINS.find(s => s.id === 'nord')!
  await $.command.run({ command: 'skin', args: 'nord' } as never)

  const pane = await $.ui.mount({ plugin: 'ashpack-skins', surface: 'terminal', ...PANE, props: PANE_PROPS })
  expect((await pane.find({ key: 'skin-mode' }))?.text).toBe('Dark')
  await pane.press({ key: 'skin-mode' })
  expect((await pane.find({ key: 'skin-mode' }))?.text).toBe('Light')
  expect(set).toEqual(['light-ansi'])

  const prompt = { text: 'hello', origin: { kind: 'composer' }, isExpanded: false } as never
  for (const surface of SURFACES) {
    const row = await $.ui.mount({ plugin: 'ashpack-skins', surface, component: 'UserMessage', props: prompt })
    const drawn = JSON.stringify(await row.drawn())
    // The prompt in the skin's colour, in a rounded outline, no fill.
    expect(drawn).toContain(nord.light.text)
    expect(drawn).toContain('"borderStyle":"round"')
    expect(drawn).not.toContain('backgroundColor')
    await row.unmount()
  }
  await $.command.run({ command: 'skin', args: 'dark' } as never)
  expect(set).toEqual(['light-ansi', 'dark-ansi'])
  await pane.unmount()
})

test('a reply draws in the skin\'s colors, with code and tables as cards', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 0 })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine-reply</Text>
  })
  const copied: string[] = []
  on('ui.copy', ($, e) => (copied.push(e.text), { value: { isCopied: true } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  await $.command.run({ command: 'skin', args: 'dracula' } as never)
  const p = SKINS.find(s => s.id === 'dracula')!.dark
  const text = ['## Plan', 'Use **bold** and `code`.', '- one', '- two', '```ts', 'let x = 1', '```', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n')
  for (const surface of SURFACES) {
    const reply = await $.ui.mount({ plugin: 'ashpack-skins', surface, component: 'AssistantMessage', props: { text, isFirstOfReply: true } as never, viewport: { columns: 120, rows: 40 } as never })
    const drawn = JSON.stringify(await reply.drawn())
    for (const part of ['Plan', p.accent, p.text, p.cyan, 'let x = 1']) expect(drawn).toContain(part)
    expect(drawn).not.toContain('engine-reply')
    if (surface === 'terminal') {
      // The code in Claude Code's highlighter with a Copy; the table as an outlined grid.
      expect(drawn).toContain('"type":"Code"')
      expect(drawn).toContain('"key":"copy-block-4"')
      expect(drawn).toContain('"borderStyle":"round"')
    } else {
      // SVG cards whose rows rise in, each with a Copy button.
      expect(drawn).toContain('"type":"Svg"')
      expect(drawn).toContain('@keyframes r')
      await reply.press({ key: 'copy-block-4' })
      expect(copied.at(-1)).toBe('let x = 1')
    }
    await reply.unmount()
    // A summary row keeps Claude Code's drawing.
    const summary = await $.ui.mount({ plugin: 'ashpack-skins', surface, component: 'AssistantMessage', props: { text: 'x', isFirstOfReply: false, isSummary: true } as never })
    expect(JSON.stringify(await summary.drawn())).toContain('engine-reply')
    await summary.unmount()
  }
})

test('the desktop draws tool rows, group rows, diff and terminal cards, and a moving mark for the turn', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('ui.render', { component: ['ToolResult', 'ToolUse', 'ToolGroup', 'Spinner'] }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine-${e.component}`}</Text>
  })
  await $.command.run({ command: 'skin', args: 'nord' } as never)
  const p = SKINS.find(s => s.id === 'nord')!.dark
  const edit = {
    filePath: '/repo/src/auth.ts',
    structuredPatch: [{ oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: [' const a = 1', '-const b = 2', '+const b = 3'] }],
  }
  const shell = { stdout: 'ok 3 tests', stderr: 'warn: slow', interrupted: false }
  const mount = (surface: 'terminal' | 'desktop', component: string, props: unknown, requestId?: string) =>
    $.ui.mount({ plugin: 'ashpack-skins', surface, component, props, viewport: { columns: 120, rows: 40 }, ...(requestId ? { requestId } : {}) } as never)
  const drawnOf = async (ui: Awaited<ReturnType<typeof mount>>) => {
    const d = JSON.stringify(await ui.drawn())
    await ui.unmount()
    return d
  }

  // The desktop: an icon and the row's facts; an edit's lines changed.
  const row = await drawnOf(
    await mount('desktop', 'ToolUse', { tool_use_id: 'e1', tool: 'Edit', input: { file_path: '/repo/src/auth.ts' }, output: edit, isRunning: false, isErrored: false, isInterrupted: false }),
  )
  for (const part of ['"type":"Svg"', 'Edit', 'src/auth.ts', '+1', '−1', p.yellow]) expect(row).toContain(part)
  // The terminal: a plain row, no icon.
  const plain = await drawnOf(
    await mount('terminal', 'ToolUse', { tool_use_id: 'e1', tool: 'Edit', input: { file_path: '/repo/src/auth.ts' }, isRunning: false, isErrored: false, isInterrupted: false }),
  )
  expect(plain).toContain('src/auth.ts')
  expect(plain).not.toContain('●')

  const calls = [
    { tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
    { tool: 'Bash', input: { command: 'pwd' }, isRunning: false, isErrored: false, isInterrupted: false },
  ]
  const group = await drawnOf(await mount('desktop', 'ToolGroup', { calls, isActive: false, isExpanded: false }))
  for (const part of ['"type":"Svg"', 'Run', ' 2']) expect(group).toContain(part)
  expect(await drawnOf(await mount('terminal', 'ToolGroup', { calls, isActive: false, isExpanded: false }))).toContain('engine-ToolGroup')

  const diff = await drawnOf(await mount('desktop', 'ToolResult', { tool_use_id: 'e1', tool: 'Edit', output: edit, isErrored: false }, 'e1'))
  for (const part of ['"type":"Svg"', 'src/auth.ts', 'const b = 3', '+1 −1', '@keyframes r']) expect(diff).toContain(part)
  // A card's rows rise in when it is new; a redraw later (a resize, the side panel opening) is drawn still.
  await clock.advance(2000)
  const again = await drawnOf(await mount('desktop', 'ToolResult', { tool_use_id: 'e1', tool: 'Edit', output: edit, isErrored: false }, 'e1'))
  expect(again).toContain('const b = 3')
  expect(again).not.toContain('@keyframes')
  const term = await drawnOf(await mount('desktop', 'ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: shell, isErrored: false }))
  for (const part of ['"type":"Svg"', 'ok 3 tests', 'warn: slow', '"label":"Copy"']) expect(term).toContain(part)
  // The terminal keeps Claude Code's own diff and output.
  expect(await drawnOf(await mount('terminal', 'ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: shell, isErrored: false }))).toContain('engine-ToolResult')

  const spin = await drawnOf(await mount('desktop', 'Spinner', { word: 'Baking', message: 'Reading auth.ts', suffix: '…', mode: 'tool-use' }))
  for (const part of ['"type":"Svg"', 'Reading auth.ts']) expect(spin).toContain(part)
})

test('/skin <name> switches, an unknown name lists the skins', async ($, on) => {
  mock.store(on)
  const picked = await $.command.run({ command: 'skin', args: 'dracula' } as never)
  expect(picked.text).toBe('Skin: Dracula.')
  const bad = await $.command.run({ command: 'skin', args: 'nope' } as never)
  expect(bad.text).toContain('catppuccin')
  expect((await $.command.run({ command: 'skin', args: 'off' } as never)).text).toContain('off')
})
