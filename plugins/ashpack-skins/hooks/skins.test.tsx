import { expect, mock, test } from 'claude-code/testing'

import { chartRows } from './chart-cells'
import { niceStep, chartSvg } from './charts'
import { shortNumber, wrapWords } from './chart-kit'
import { layoutFlow } from './flow-layout'
import { diffFence, newSide } from './cards'
import { parseBlocks, parseInline } from './markdown'
import { taskRun } from './reply'
import { parseChart, parseFlow, parsePie, parseSequence, parseXY } from './mermaid'
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
  expect(SKINS.length).toBe(16) // as many as the picker has hotkeys
  expect(new Set(SKINS.map(s => s.id)).size).toBe(16)
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
  expect(blocks[7]).toEqual({ kind: 'code', lang: 'ts', code: 'const x = 1', isClosed: true })
  expect(blocks[8]).toEqual({ kind: 'markdown', text: '| h | i |\n|---|---|\n| 1 | 2 |' })
  expect(blocks[9]).toEqual({ kind: 'code', lang: 'py', code: 'open', isClosed: false }) // a fence still streaming
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
  const text = ['## Plan', 'Use **bold** and `code`, see [the docs](https://x.dev) and [README.md](README.md).', '- one', '- two', '```ts', 'let x = 1', '```', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n')
  for (const surface of SURFACES) {
    const reply = await $.ui.mount({ plugin: 'ashpack-skins', surface, component: 'AssistantMessage', props: { text, isFirstOfReply: true } as never, viewport: { columns: 120, rows: 40 } as never })
    const drawn = JSON.stringify(await reply.drawn())
    for (const part of ['Plan', p.accent, p.text, p.cyan]) expect(drawn).toContain(part)
    expect(drawn).not.toContain('engine-reply')
    // A URL is a Link; a relative path is underlined text (the engine refuses a Link to it).
    expect(drawn).toContain('"href":"https://x.dev"')
    expect(drawn).not.toContain('"href":"README.md"')
    expect(drawn).toContain('"underline":true')
    if (surface === 'terminal') {
      // The code in the skin's colours (the keyword in its purple) with a Copy; the table as an outlined grid.
      expect(drawn).not.toContain('"type":"Code"')
      expect(drawn).toContain(`{"type":"Text","props":{"color":"${p.purple}","italic":false},"children":["let"]}`)
      expect(drawn).toContain('"key":"copy-block-4"')
      expect(drawn).toContain('"borderStyle":"round"')
    } else {
      // SVG cards, still (no entry animation), each with a Copy button.
      expect(drawn).toContain('"type":"Svg"')
      expect(drawn).not.toContain('@keyframes')
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

test('the desktop draws tool rows, group rows, diff and terminal cards; the spinner has no wave', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  let suffix = '' // what the skin hands Claude Code's spinner to draw after the word
  let word = '' // and the word it hands it
  let compactOn = false // stands in for ashpack-status' compact switch
  on('state.get', ($, e, next) => {
    const { plugin, key } = e as { plugin: string; key: string } // another plugin's value: not in this contract
    return plugin === 'ashpack-status' && key === 'compact' ? ({ value: { value: compactOn, version: 1 } } as never) : next(e)
  })
  on('ui.render', { component: ['ToolResult', 'ToolUse', 'ToolGroup', 'Spinner'] }, ($, e) => {
    if (e.component === 'Spinner') ({ suffix, word } = e.props as { suffix: string; word: string })
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
  for (const part of ['"type":"Svg"', 'src/auth.ts', 'const b = 3', '+1 −1']) expect(diff).toContain(part)
  // No entry animation: the desktop re-mounts a message's first tree on every layout change.
  expect(diff).not.toContain('@keyframes')
  const term = await drawnOf(await mount('desktop', 'ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: shell, isErrored: false }))
  for (const part of ['"type":"Svg"', 'ok 3 tests', 'warn: slow', '"label":"Copy"']) expect(term).toContain(part)
  // The terminal keeps Claude Code's own diff and output.
  expect(await drawnOf(await mount('terminal', 'ToolResult', { tool_use_id: 'b1', tool: 'Bash', output: shell, isErrored: false }))).toContain('engine-ToolResult')

  // The spinner has no wave. The desktop keeps the app's own: a live run of tool calls draws
  // the app's own row there whatever a mod answers, so a skinned spinner flipped back and
  // forth. The terminal says the skin's word, Claude Code's suffix as it was.
  const spinProps = { word: 'Baking', message: null, suffix: '…', mode: 'thinking' }
  // With ashpack-status' compact mode on, skins step aside: the mods beneath hide the rows.
  compactOn = true
  expect(await drawnOf(await mount('desktop', 'ToolUse', { tool_use_id: 'e1', tool: 'Edit', input: { file_path: '/repo/src/auth.ts' }, isRunning: false, isErrored: false, isInterrupted: false }))).toContain('engine-ToolUse')
  expect(await drawnOf(await mount('desktop', 'ToolGroup', { calls, isActive: false, isExpanded: false }))).toContain('engine-ToolGroup')
  compactOn = false
  expect(await drawnOf(await mount('desktop', 'Spinner', spinProps))).toContain('engine-Spinner')
  await drawnOf(await mount('terminal', 'Spinner', spinProps))
  expect(suffix).toBe('…')
  expect(word).toBe(pick(SKINS.find(s => s.id === 'nord')!.words, 'Baking'))
})

test('/skin <name> switches and shares its accent, an unknown name lists the skins', async ($, on) => {
  mock.store(on)
  let accent: unknown // what AshPack's loader would read
  on('state.set', ($, e, next) => {
    if (e.key === 'accent') accent = e.value
    return next(e)
  })
  const picked = await $.command.run({ command: 'skin', args: 'dracula' } as never)
  expect(picked.text).toBe('Skin: Dracula.')
  expect(accent).toBe(SKINS.find(s => s.id === 'dracula')!.dark.accent)
  const bad = await $.command.run({ command: 'skin', args: 'nope' } as never)
  expect(bad.text).toContain('catppuccin')
  expect((await $.command.run({ command: 'skin', args: 'off' } as never)).text).toContain('off')
  expect(accent).toBe('')
})

const FLOW = [
  'graph TD;',
  '  A([Start]) --> B{Valid?};',
  '  B -->|yes| C[Save]',
  '  B -- no --> D["Show [error]"]:::warn',
  '  D -.-> A',
  '  C & D ==> E((Done))',
  '  subgraph tail [Tail]',
  '    E --- F',
  '  end',
  '  classDef warn fill:#f00',
  '  api-gateway --> A',
].join('\n')

test('charts: mermaid fences read into flowcharts, sequences, pies and xy charts', () => {
  const flow = parseFlow(FLOW)
  expect(flow?.dir).toBe('TD')
  expect(flow?.nodes.map(n => `${n.id}:${n.shape}:${n.label}`)).toEqual([
    'A:pill:Start',
    'B:diamond:Valid?',
    'C:rect:Save',
    'D:rect:Show [error]',
    'E:circle:Done',
    'F:rect:F',
    'api-gateway:rect:api-gateway',
  ])
  expect(flow?.edges.map(e => `${e.from}>${e.to}:${e.label}:${e.line}:${e.head}`)).toEqual([
    'A>B::solid:arrow',
    'B>C:yes:solid:arrow',
    'B>D:no:solid:arrow',
    'D>A::dotted:arrow',
    'C>E::thick:arrow',
    'D>E::thick:arrow',
    'E>F::solid:none',
    'api-gateway>A::solid:arrow',
  ])

  const seq = parseSequence(['sequenceDiagram', '  autonumber', '  actor U as User', '  participant S as Server', '  U->>+S: Save', '  alt ok', '    S-->>-U: 201', '  else bad', '    S--xU: 422', '  end', '  Note right of S: logs it', '  box Aqua Backend', '  end'].join('\n'))
  expect(seq?.actors.map(a => a.name)).toEqual(['User', 'Server'])
  expect(seq?.steps.map(st => st.kind)).toEqual(['msg', 'open', 'msg', 'else', 'msg', 'close', 'note'])
  expect(seq?.steps[4]).toEqual({ kind: 'msg', from: 1, to: 0, text: '422', isDashed: true, isCross: true })

  expect(parsePie('pie showData\n  title Pets\n  "Dogs" : 386\n  "Cats" : 85\n  "None" : 0')).toEqual({ kind: 'pie', title: 'Pets', slices: [{ label: 'Dogs', value: 386 }, { label: 'Cats', value: 85 }] })
  const xy = parseXY('xychart-beta\n  title "Sales"\n  x-axis [jan, "feb x", mar]\n  y-axis "Revenue" 0 --> 100\n  bar [10, 20, 30]\n  line [5, 15, 25, 35]')
  expect(xy).toEqual({
    kind: 'xy',
    title: 'Sales',
    xLabels: ['jan', 'feb x', 'mar', '4'],
    yTitle: 'Revenue',
    yMin: 0,
    yMax: 100,
    series: [
      { kind: 'bar', name: '', values: [10, 20, 30] },
      { kind: 'line', name: '', values: [5, 15, 25, 35] },
    ],
  })
  // Input Claude writes that once read wrong: hyphenated ids, comparisons in labels, start
  // heads, the newer node syntax, `1,200`, a hyphen and x in an actor's name.
  expect(parseFlow('flowchart LR\n  Client --> end-user\n  end-user --> API')?.edges).toHaveLength(2)
  expect(parseFlow('graph TD\n  B{x < 5 and y > 3} --> C')?.nodes[0]?.label).toBe('x < 5 and y > 3')
  expect(parseFlow('graph TD\n  A o--o B\n  C x--x D')?.edges.map(e => e.head)).toEqual(['both', 'both'])
  expect(parseFlow('graph TD\n  A@{ shape: diamond, label: "Ok?" } --> B')?.nodes[0]).toEqual({ id: 'A', label: 'Ok?', shape: 'diamond' })
  expect(parsePie('pie\n  "Requests" : 1,200\n  "Errors" : 30')?.slices.map(x => x.value)).toEqual([1200, 30])
  expect(parseSequence('sequenceDiagram\n  web-xhr->>API: GET')?.actors.map(a => a.id)).toEqual(['web-xhr', 'API'])
  // What it cannot read whole stays code rather than drawing something wrong.
  expect(parseFlow('graph TD\n  A --> B ??? C')).toBeNull()
  expect(parsePie('pie\n  "a" : lots')).toBeNull()
  expect(parseXY('xychart-beta\n  bar [1, n/a, 3]')).toBeNull()
  expect(parseXY('xychart-beta\n  bar [1, 2]\n  line []')?.series).toHaveLength(1)

  // A kind it does not draw, or a fence it cannot read, stays code.
  expect(parseChart('journey\n  title A\n  section B\n    Wake up: 5: Me')).toBeNull()
  expect(parseChart('pie\n  nothing here')).toBeNull()

  expect(shortNumber(1234)).toBe('1234')
  expect(shortNumber(12_345)).toBe('12.3k')
  expect(shortNumber(2_500_000)).toBe('2.5M')
  expect(niceStep(50)).toBe(20)
  expect(niceStep(7)).toBe(2)
  expect(wrapWords('a long label that wraps', 10)).toEqual(['a long', 'label that', 'wraps'])

  // Layout: an edge runs down the page; nodes in one rank never overlap; a cycle still lays out.
  const sizes = [{ w: 40, h: 20 }, { w: 40, h: 20 }, { w: 40, h: 20 }, { w: 40, h: 20 }]
  const lay = layoutFlow(sizes, [[0, 1], [0, 2], [1, 3], [2, 3], [3, 0]], 'TD', { rank: 30, cross: 20, margin: 5 })
  const c = lay.centers
  expect(c[1]!.y).toBeGreaterThan(c[0]!.y)
  expect(c[3]!.y).toBeGreaterThan(c[1]!.y)
  expect(c[1]!.y).toBe(c[2]!.y)
  expect(Math.abs(c[1]!.x - c[2]!.x)).toBeGreaterThanOrEqual(60)
  expect(lay.routes[4]!.at(-1)!.y).toBeLessThan(lay.routes[4]![0]!.y) // the back edge runs up, into its target
  const lr = layoutFlow(sizes.slice(0, 2), [[0, 1]], 'LR', { rank: 30, cross: 20, margin: 5 })
  expect(lr.centers[1]!.x).toBeGreaterThan(lr.centers[0]!.x)

  // The cards and the cells.
  const p = SKINS[0]!.dark
  // A flat or inverted axis still draws, with a few ticks (all zeros once built billions).
  for (const src of ['xychart-beta\n  bar [0, 0, 0]', 'xychart-beta\n  bar [-3, -3]', 'xychart-beta\n  y-axis "v" 100 --> 0\n  bar [5]']) {
    const card = chartSvg(parseXY(src)!, p, 720)
    expect(card.source).not.toMatch(/NaN|Infinity/)
    expect((card.source.match(/<line /g) ?? []).length).toBeLessThanOrEqual(13)
  }
  for (const chart of [flow, seq, parsePie('pie\n "a" : 1\n "b" : 3'), xy]) {
    const card = chartSvg(chart!, p, 720)
    expect(card.source).toMatch(/^<svg .*<\/svg>$/s)
    expect(card.width).toBe(720)
    expect(chartRows(chart!, p, 80).length).toBeGreaterThan(0)
  }
  const flowText = chartRows(flow!, p, 80).map(r => r.map(x => x.text).join(''))
  expect(flowText).toContain('Valid?')
  expect(flowText).toContain('  ├─ yes ─▶ Save')
  expect(flowText).toContain('  ├┄┄▶ Start') // a dotted edge back up
  const seqText = chartRows(seq!, p, 80).map(r => r.map(x => x.text).join(''))
  expect(seqText[0]).toMatch(/^User +Server/)
  expect(seqText.some(r => r.includes('──▶'))).toBe(true)
  expect(seqText.some(r => r.includes('✕'))).toBe(true)
  const pieText = chartRows(parsePie('pie\n "a" : 1\n "b" : 3')!, p, 40).map(r => r.map(x => x.text).join(''))
  expect(pieText).toContain('■ a   25%  1')
  expect(pieText).toContain('■ b   75%  3')
})

test('a closed ```mermaid fence draws as a chart while charts are on, and Claude is told so', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 0 })
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine-reply</Text>
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }) as never)
  await $.command.run({ command: 'skin', args: 'nord' } as never)
  const fence = ['Here:', '```mermaid', FLOW, '```'].join('\n')
  const draw = async (surface: 'terminal' | 'desktop', text: string) => {
    const reply = await $.ui.mount({ plugin: 'ashpack-skins', surface, component: 'AssistantMessage', props: { text, isFirstOfReply: true } as never, viewport: { columns: 120, rows: 40 } as never })
    const drawn = JSON.stringify(await reply.drawn())
    await reply.unmount()
    return drawn
  }
  for (const surface of SURFACES) {
    const drawn = await draw(surface, fence)
    if (surface === 'terminal') {
      expect(drawn).toContain('flowchart')
      expect(drawn).toContain('├─')
      expect(drawn).not.toContain('"type":"Code"')
    } else {
      expect(drawn).toContain('"type":"Svg"')
      expect(drawn).toContain('Valid?')
      expect(drawn).toContain('steps')
    }
    // A fence still streaming stays code until it closes.
    const open = await draw(surface, fence.replace(/\n```$/, ''))
    expect(open).not.toContain('├─')
    expect(open).not.toContain('steps')
  }
  const sections = async (surfaces: readonly string[]) => (await $.prompt.compose({ surfaces, model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', tools: [], outputStyle: null, traits: [] } as never)).sections.map(s => s.id)
  expect(await sections(['terminal'])).toEqual(['intro', 'ashpack-skins:charts'])
  expect(await sections([])).toEqual(['intro']) // headless: nothing draws a chart

  expect((await $.command.run({ command: 'skin', args: 'charts off' } as never)).text).toContain('Charts off')
  expect(await draw('terminal', fence)).not.toContain('├─')
  expect(await sections(['terminal'])).toEqual(['intro'])
  expect((await $.command.run({ command: 'skin', args: 'charts' } as never)).text).toContain('Charts on')
  expect(await sections(['desktop'])).toEqual(['intro', 'ashpack-skins:charts'])
})

test('markdown extras: alerts, task lists and diff fences', () => {
  const blocks = parseBlocks(['> [!WARNING]', '> Back up **first**.', '> Then run it.', '', '- [x] read', '- [ ] fix', 'after'].join('\n'))
  expect(blocks.map(b => b.kind)).toEqual(['alert', 'item', 'item', 'para'])
  expect(blocks[0]).toMatchObject({ kind: 'alert', type: 'warning' })
  expect(blocks[0]?.kind === 'alert' ? blocks[0].lines.length : 0).toBe(2)
  expect(blocks.slice(1, 3).map(b => (b.kind === 'item' ? b.check : null))).toEqual([true, false])

  const d = diffFence(['--- a/src/x.ts', '+++ b/src/x.ts', '@@ -3,3 +3,3 @@', ' keep', '-old', '+new', '-- not a header after a hunk'].join('\n'))
  expect(d).toMatchObject({ path: 'src/x.ts', added: 1, removed: 2 })
  expect(d?.hunks[0]?.oldStart).toBe(3)
  expect(newSide(d!)).toBe('keep\nnew')
  expect(diffFence('just words')).toBeNull()
  expect(diffFence('--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x')?.path).toBe('gone.ts') // a deleted file keeps its name
  expect(diffFence('+++ b/a\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/c b/c\n+++ b/c\n@@ -1 +1 @@\n-c\n+d')?.path).toBe('2 files')

  // A list's task count sits over its first task, counting every task in the list.
  const list = parseBlocks(['- [x] Step 1', '  - detail', '- [ ] Step 2', '- [ ] Step 3'].join('\n'))
  expect(list.map((_, i) => taskRun(list, i))).toEqual([{ done: 1, total: 3 }, null, null, null])
})

test('more charts: state, mind map, class, ER, timeline, Gantt and quadrant', () => {
  const p = SKINS[0]!.dark
  const sources = {
    'state diagram': 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : go\n  Busy --> Idle : done\n  Busy --> [*]',
    'mind map': 'mindmap\n  root((Plan))\n    A\n      A1\n    B',
    'class diagram': 'classDiagram\n  class Animal {\n    +name\n  }\n  Animal <|-- Dog\n  Dog : +bark()',
    'ER diagram': 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER {\n    int id PK\n  }',
    timeline: 'timeline\n  title T\n  2024 : a : b\n       : c\n  2025 : d',
    gantt: 'gantt\n  dateFormat YYYY-MM-DD\n  section S\n  One :a1, 2026-01-01, 3d\n  Two :after a1, 2d\n  Ship :milestone, 2026-01-06, 0d',
    quadrant: 'quadrantChart\n  x-axis Low --> High\n  y-axis Low --> High\n  quadrant-1 Win\n  P: [0.2, 0.9]',
  }
  for (const [kind, src] of Object.entries(sources)) {
    const chart = parseChart(src)
    expect(chart === null ? null : chart.kind === 'flow' ? chart.name : chart.kind).toBe(kind)
    const card = chartSvg(chart!, p, 720)
    expect(card.source).not.toMatch(/NaN|Infinity|undefined/)
    expect(chartRows(chart!, p, 80).length).toBeGreaterThan(0)
  }
  const state = parseChart(sources['state diagram'])
  expect(state?.kind === 'flow' ? state.edges.map(e => `${e.from}>${e.to}`) : []).toEqual(['__start>Idle', 'Idle>Busy', 'Busy>Idle', 'Busy>__end'])
  const cls = parseChart(sources['class diagram'])
  expect(cls?.kind === 'flow' ? cls.nodes.find(n => n.id === 'Dog')?.body : []).toEqual(['+bark()'])
  expect(cls?.kind === 'flow' ? cls.edges[0] : null).toMatchObject({ from: 'Animal', to: 'Dog', head: 'start' }) // the parent on top, the head at it
  const gantt = parseChart(sources.gantt)
  expect(gantt?.kind === 'gantt' ? gantt.tasks.map(t => t.end - t.start) : []).toEqual([3, 2, 0])
  expect(gantt?.kind === 'gantt' ? gantt.tasks[1]?.start : 0).toBe(gantt?.kind === 'gantt' ? gantt.tasks[0]?.end : 1)
  const timeline = parseChart(sources.timeline)
  expect(timeline?.kind === 'timeline' ? timeline.periods.map(x => x.events.length) : []).toEqual([3, 1])
  // Input that once read wrong: a two-space dateFormat, generics, classes on ids, <br> in labels.
  expect(parseChart('gantt\n  dateFormat  YYYY-MM-DD\n  A :2024-01-01, 3d')?.kind).toBe('gantt')
  const generic = parseChart('classDiagram\n  class Repository~T~ {\n    +find()\n  }\n  Repository <|-- UserRepo')
  expect(generic?.kind === 'flow' ? generic.nodes.map(n => `${n.id}:${n.label}`) : []).toEqual(['Repository:Repository<T>', 'UserRepo:UserRepo'])
  const styled = parseChart('stateDiagram-v2\n  B:::hot --> C\n  accTitle: states\n  note left of B\n    hello\n  end note')
  expect(styled?.kind === 'flow' ? styled.nodes.map(n => n.id) : []).toEqual(['B', 'C'])
  const mind = parseChart('mindmap\n  root((Steam<br/>power))\n    **Bold** idea')
  expect(mind?.kind === 'flow' ? mind.nodes.map(n => n.label) : []).toEqual(['Steam power', 'Bold idea'])
  // Unreadable input stays code.
  expect(parseChart('gantt\n  dateFormat DD-MM-YYYY\n  A :2026-01-01, 1d')).toBeNull()
  expect(parseChart('gantt\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  A :2026-01-01, 1d')).toBeNull() // a calendar it does not keep
  expect(parseChart('stateDiagram-v2\n  [*] --> First\n  state First {\n    [*] --> Second\n  }')).toBeNull() // a composite's own start
  expect(parseChart('quadrantChart\n  P: [2, 0.5]')).toBeNull()
  expect(parseChart('mindmap\n  a\n  b')).toBeNull() // two roots
})

test('replies: shell fences keep the app\'s block, diffs are cards, alerts and tasks draw', async ($, on) => {
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
  await $.command.run({ command: 'skin', args: 'gruvbox' } as never)
  const p = SKINS.find(s => s.id === 'gruvbox')!.dark
  const text = ['```bash', 'npm test', '```', '', '```diff', '@@ -1 +1 @@', '-a', '+b', '```', '', '> [!TIP]', '> Use it.', '', '- [x] one', '- [ ] two'].join('\n')
  for (const surface of SURFACES) {
    const reply = await $.ui.mount({ plugin: 'ashpack-skins', surface, component: 'AssistantMessage', props: { text, isFirstOfReply: true } as never, viewport: { columns: 120, rows: 40 } as never })
    const drawn = JSON.stringify(await reply.drawn())
    expect(drawn).toContain('Tip')
    expect(drawn).toContain('1 of 2 done')
    expect(drawn).toContain('✓')
    if (surface === 'desktop') {
      expect(drawn).toContain('"type":"Markdown"') // the bash fence, with the app's Run button
      expect(drawn).toContain('+1 −1') // the diff card's badge
      await reply.press({ key: 'copy-extra-block-1' })
      expect(copied.at(-1)).toBe('b')
    } else {
      expect(drawn).toContain(`"color":"${p.green}"},"children":["+b"]`)
      expect(drawn).toContain(`"color":"${p.red}"},"children":["-a"]`)
    }
    await reply.unmount()
  }
})

test('the skin shares its palette with the other AshPack mods', async ($, on) => {
  mock.store(on)
  let shared: unknown
  on('state.set', ($, e, next) => {
    if (e.key === 'palette') shared = e.value
    return next(e)
  })
  await $.command.run({ command: 'skin', args: 'nord' } as never)
  const p = SKINS.find(s => s.id === 'nord')!.dark
  expect(shared).toEqual({ ok: p.green, warn: p.yellow, hot: p.red, accent: p.accent, blue: p.blue, muted: p.muted, bg: p.bg, text: p.text, cyan: p.cyan, pink: p.pink, purple: p.purple })
  await $.command.run({ command: 'skin', args: 'off' } as never)
  expect(shared).toBeNull()
})
