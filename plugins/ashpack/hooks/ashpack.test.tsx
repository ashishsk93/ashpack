import { expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { findChips, findPages, misplaced, stepTab, withHostFirst, withoutChips } from './format'

const SURFACES = ['terminal', 'desktop'] as const
const FULL = { columns: 160, rows: 50, isFullscreen: true } as never

// A drawn tree's text, children joined in order.
const flatten = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(flatten).join('')
const DRAWER = { component: 'Pane', requestId: 'ashpack' } as const
const PANE_PROPS = {
  title: 'AshPack',
  isFocused: true,
  bodyColumns: 60,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 12, contentRows: 12 },
} as never
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10, contentRows: 0 }, view: {} } as never

test('helpers: pages, chips, plugin order, tabs', () => {
  const page = (label: string, text: string) => ({ type: 'Box', props: { key: `ashpack-page:${label}` }, children: [text] })
  const tree = { type: 'Box', props: {}, children: [{ type: 'Box', props: {}, children: [page('Baton', 'b')] }, page('Skins', 's'), page('skins', 'dup'), page('Home', 'x')] }
  expect(findPages(tree).map(p => `${p.id}:${p.label}:${flatten(p.tree)}`)).toEqual(['baton:Baton:b', 'skins:Skins:s'])
  expect(findPages('engine text')).toEqual([])

  // Chips: lifted out of the band tree, which keeps the rest.
  const chip = (label: string) => ({ type: 'Box', props: { key: `ashpack-chip:${label}` }, children: [label] })
  const band = { type: 'Box', props: {}, children: [{ type: 'Box', props: {}, children: [chip('ctx'), chip('week')] }, { type: 'Text', props: {}, children: ['other'] }] }
  expect(findChips(band).map(c => c.label)).toEqual(['ctx', 'week'])
  expect(flatten(withoutChips(band))).toBe('other')
  expect(findChips(withoutChips(band))).toEqual([])

  // Order: the host must be first; the fix moves it there and keeps the rest.
  expect(misplaced({ 'ashpack@ashpack': true, 'baton@baton-mods': true })).toBe(false)
  expect(misplaced({ 'baton@baton-mods': true, 'ashpack@ashpack': true })).toBe(true)
  expect(misplaced({ 'baton@baton-mods': true })).toBe(false)
  const fixed = JSON.parse(withHostFirst(JSON.stringify({ theme: 'dark', enabledPlugins: { 'baton@baton-mods': true, 'ashpack@ashpack': true, 'x@y': false } })))
  expect(Object.keys(fixed.enabledPlugins)).toEqual(['ashpack@ashpack', 'baton@baton-mods', 'x@y'])
  expect(fixed.theme).toBe('dark')
  expect(withHostFirst('{"enabledPlugins":{"x@y":true}}')).toBe('{"enabledPlugins":{"x@y":true}}')

  expect(stepTab(['home', 'skins', 'baton'], 'baton', 1)).toBe('home')
  expect(stepTab(['home', 'skins', 'baton'], 'home', -1)).toBe('baton')
})

test('the footer opens the drawer: a side pane with Home and a page per mod; the page shown is kept', async ($, on) => {
  mock.store(on)
  on('settings.read', () => ({ value: { enabledPlugins: { 'ashpack@ashpack': true, 'ashpack-status@ashpack': true } } }))
  const opened: string[] = []
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => e as never)
  on('ui.toast', () => ({ value: undefined }))
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
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  for (const surface of SURFACES) {
    const footer = await $.ui.mount({ plugin: 'ashpack', surface, component: 'SessionMode', viewport: FULL, props: { modes: ['focus'] } })
    expect(await footer.find({ text: /old-badge/ })).toBeDefined()
    expect((await footer.find({ key: 'ashpack' }))?.text).toContain('▸')
    await footer.press({ key: 'ashpack' })
    expect(opened).toEqual(['ashpack'])
    expect((await footer.find({ key: 'ashpack' }))?.text).toContain('◂')

    const pane = await $.ui.mount({ plugin: 'ashpack', surface, ...DRAWER, props: PANE_PROPS })
    for (const id of ['home', 'baton']) expect(await pane.find({ key: `page-${id}` })).toBeDefined()
    expect(await pane.find({ key: 'page-mods' })).toBeUndefined() // no installer page
    expect(await pane.find({ key: 'baton-ping' })).toBeUndefined()
    expect((await pane.find({ key: 'home-open-baton' }))?.text).toContain('Baton') // Home lists the pages
    await pane.press({ key: 'page-baton' })
    expect(await pane.find({ key: 'baton-ping' })).toBeDefined()
    await pane.press({ key: 'baton-ping', plugin: 'test' })
    expect(pressed).toBe(1)
    if (surface === 'terminal') {
      await pane.press({ key: 'tab-next' })
      expect(await pane.find({ key: 'baton-ping' })).toBeUndefined() // wrapped round to Home
    }
    await pane.press({ key: 'page-home' })
    expect(await pane.find({ key: 'baton-ping' })).toBeUndefined()
    // The footer button folds the drawer again.
    await footer.press({ key: 'ashpack' })
    expect((await footer.find({ key: 'ashpack' }))?.text).toContain('▸')
    await pane.unmount()
    await footer.unmount()
    opened.length = 0
    pressed = 0
  }
})

test('the strip lifts the chips of the mods beneath into one row', async ($, on) => {
  mock.store(on)
  on('settings.read', () => ({ value: { enabledPlugins: { 'ashpack@ashpack': true } } }))
  on('ui.toast', () => ({ value: undefined }))
  // Stands in for two mods, each with a chip in its band tree, one with a row of its own too.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box key="ashpack-chip:ctx">
          <Text>ctx 42%</Text>
        </Box>
        <Text>a row of its own</Text>
        <Box key="ashpack-chip:baton">
          <Text>baton · 2</Text>
        </Box>
      </Box>
    )
  })
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ plugin: 'ashpack', surface, component: 'AbovePrompt', viewport: FULL, props: BAND_PROPS })
    const tree = await band.drawn()
    const text = flatten(tree)
    expect(text).toContain('ctx 42%')
    expect(text).toContain('baton · 2')
    expect(text).toContain('a row of its own')
    // Each chip once, in the strip (the first row), the rest beneath.
    expect(text.split('ctx 42%').length).toBe(2)
    expect(text.indexOf('baton · 2')).toBeLessThan(text.indexOf('a row of its own'))
    expect(JSON.stringify(tree)).toContain('"flexWrap":"wrap"')
    await band.unmount()
  }
})

test('Home says when another mod sits above the host, and moves the host first', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/nowhere', CLAUDE_CONFIG_DIR: '/config' })
  const user = { enabledPlugins: { 'baton@baton-mods': true, 'ashpack@ashpack': true, 'ashpack-status@ashpack': true } }
  on('settings.read', () => ({ value: user }))
  let written = ''
  let isWritable = false
  const paths: string[] = []
  on('fs.read', ($, e) => (paths.push(e.path), { value: written || JSON.stringify(user) }))
  on('fs.write', ($, e) => (paths.push(e.path), isWritable ? (written = e.text) : undefined, { value: undefined }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('prompt.fill', () => ({ isFilled: true }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => e as never)
  on('ui.render', DRAWER, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  const pane = await $.ui.mount({ plugin: 'ashpack', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  expect(flatten(await pane.drawn())).toContain('Another mod sits above AshPack')
  // A write that did not land: read back, the banner stays and the toast says why.
  await pane.press({ key: 'fix-order' })
  expect(toasts.join(' ')).toContain('/config/settings.json still lists another mod first')
  expect(flatten(await pane.drawn())).toContain('Another mod sits above AshPack')
  // The user's settings live under CLAUDE_CONFIG_DIR when it is set.
  isWritable = true
  await pane.press({ key: 'fix-order' })
  expect([...new Set(paths)]).toEqual(['/config/settings.json'])
  expect(Object.keys(JSON.parse(written).enabledPlugins)[0]).toBe('ashpack@ashpack')
  expect(toasts.join(' ')).toContain('first in enabledPlugins')
  expect(flatten(await pane.drawn())).not.toContain('Another mod sits above AshPack')
  await pane.unmount()
})

// What the host stores, the panes it opened and closed, and its toasts.
function drawerWorld(on: On, stored: Record<string, unknown> = {}) {
  mock.store(on, stored)
  on('settings.read', () => ({ value: { enabledPlugins: { 'ashpack@ashpack': true } } }))
  const seen = { opened: [] as string[], closed: [] as string[], toasts: [] as string[] }
  on('ui.open', ($, e) => (seen.opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', ($, e) => (seen.closed.push(e.id), { value: undefined }))
  on('ui.toast', ($, e) => (seen.toasts.push(e.text), { value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => e as never)
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.render', DRAWER, ($, e) => {
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box>
        <Box key="ashpack-page:Baton">
          <Button key="baton-ping" plain label="ping" onPress={() => undefined} />
        </Box>
      </Box>
    )
  })
  return seen
}

// Stands in for a close the host did not make (the person's Esc reaches it the same way).
const closer: Plugin = {
  name: 'closer',
  register(on) {
    on('command.run', { command: 'close-drawer' }, async $ => {
      await $.ui.close({ id: 'ashpack' })
      return {}
    })
  },
}

test('/ashpack opens a page and closes the drawer; a new session brings back the page and the open drawer', { plugins: [closer] }, async ($, on) => {
  const seen = drawerWorld(on)
  const start = () => $.session.start({ source: 'startup', cwd: '/repo' } as never)
  const footer = async () => {
    const mounted = await $.ui.mount({ plugin: 'ashpack', surface: 'terminal', component: 'SessionMode', viewport: FULL, props: { modes: [] } })
    const label = (await mounted.find({ key: 'ashpack' }))?.text
    await mounted.unmount()
    return label
  }
  await start()
  expect(seen.opened).toEqual([]) // nothing kept: the drawer waits to be asked
  await $.command.run({ command: 'ashpack', args: 'Baton' } as never)
  expect(seen.opened).toEqual(['ashpack'])
  const pane = await $.ui.mount({ plugin: 'ashpack', surface: 'terminal', ...DRAWER, props: PANE_PROPS })
  expect(await pane.find({ key: 'baton-ping' })).toBeDefined()
  await $.command.run({ command: 'ashpack', args: 'close' } as never)
  expect(seen.closed).toEqual(['ashpack'])
  expect(await footer()).toContain('▸')
  // Closed, it stays closed; the page is kept.
  await start()
  expect(seen.opened).toEqual(['ashpack'])
  // Left open, it opens again, on the kept page.
  await $.command.run({ command: 'ashpack', args: '' } as never)
  await start()
  expect(seen.opened).toEqual(['ashpack', 'ashpack', 'ashpack'])
  expect(await pane.find({ key: 'baton-ping' })).toBeDefined()
  // A close the host did not make folds it too, and it stays closed.
  await $.command.run({ command: 'close-drawer', args: '' } as never)
  expect(await footer()).toContain('▸')
  await start()
  expect(seen.opened).toHaveLength(3)
  await pane.unmount()
})

test('the 0.9.5 notice is not for a fresh install', async ($, on) => {
  const seen = drawerWorld(on)
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  expect(seen.toasts.join(' ')).not.toContain('0.9.5')
})

test('the 0.9.5 notice is said once to someone who had the host before', async ($, on) => {
  const seen = drawerWorld(on, { compact: true }) // what the host stored before 0.9.5
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  await $.session.start({ source: 'startup', cwd: '/repo' } as never)
  expect(seen.toasts.filter(t => t.includes('0.9.5'))).toHaveLength(1)
})
