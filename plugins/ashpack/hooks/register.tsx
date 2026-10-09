import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { Page } from './format'
import { ACCENT, findChips, findPages, HOST, misplaced, stepTab, withHostFirst, withoutChips } from './format'

// AshPack: the host. One side panel (the drawer) with a page per mod, and one strip
// above the prompt with a chip per mod, so mods do not fight for the footer or the band.
// It draws nothing of its own but the drawer, the footer button and the strip; the
// status chips, compact mode and skins are mods of their own that adopt it.
// The host must be outermost (first in enabledPlugins): the pages and chips of the
// mods beneath it are in the trees `next(e)` hands it.

const DRAWER = 'ashpack' // the drawer pane's id; mods hook its render to add a page
const DRAWER_COLUMNS = 64
const PAGE_KEY = 'page' // $.store: the page shown and whether the drawer was open, across sessions
const OPEN_KEY = 'open'
const NOTICE_KEY = 'split-notice' // $.store: the 0.9.5 split was mentioned once
const STATUS_MOD = 'ashpack-status@ashpack'
const SKIN_ACCENT = { plugin: 'ashpack-skins', key: 'accent' } as const

const drawerOpen = atom({ plugin: 'ashpack', key: 'drawerOpen' } as const, false)
const page = atom({ plugin: 'ashpack', key: 'page' } as const, 'home')
const isMisplaced = atom({ plugin: 'ashpack', key: 'misplaced' } as const, false)

// The skin's accent when one is on, else the host's own. Reading it while drawing
// redraws the site when the skin changes.
async function accentColor($: EngineInterface): Promise<string> {
  const held = await $.state.get(SKIN_ACCENT as never).catch(() => undefined)
  const value: unknown = held?.value
  return typeof value === 'string' && value !== '' ? value : ACCENT
}

const enabledOf = async ($: EngineInterface): Promise<Record<string, unknown>> =>
  ((await $.settings.read()).enabledPlugins ?? {}) as Record<string, unknown>

async function checkOrder($: EngineInterface): Promise<void> {
  const user = await $.settings.read({ source: 'user' })
  await update($, isMisplaced, () => misplaced(user.enabledPlugins))
}

// Moves the host to the front of enabledPlugins in ~/.claude/settings.json, then hands
// the prompt box "/reload-plugins" to send.
async function fixOrder($: EngineInterface): Promise<void> {
  try {
    const path = `${await $.env.get('HOME')}/.claude/settings.json`
    await $.fs.write(path, withHostFirst(await $.fs.read(path)))
    await update($, isMisplaced, () => false)
    $.ui.toast('AshPack is first in enabledPlugins. Press Enter to reload plugins.')
    await $.prompt.fill({ text: '/reload-plugins' })
  } catch (err) {
    $.ui.toast(`AshPack: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// 0.9.5 moved the status chips and compact mode to ashpack-status: said once.
async function noticeSplit($: EngineInterface): Promise<void> {
  if ((await $.store.get(NOTICE_KEY)) === true) return
  await $.store.set(NOTICE_KEY, true)
  if ((await enabledOf($))[STATUS_MOD] === true) return
  $.ui.toast('AshPack 0.9.5: the status chips and compact mode are now the ashpack-status mod: /plugin install ashpack-status@ashpack', { timeoutMs: 12_000 })
}

// The drawer is a side pane on every surface (docked beside a fullscreen transcript,
// inline above the prompt on the terminal's main screen).
async function openDrawer($: EngineInterface, pageId?: string): Promise<void> {
  if (pageId) await showPage($, pageId)
  await update($, drawerOpen, () => true)
  await $.store.set(OPEN_KEY, true)
  await $.ui.open({ id: DRAWER, title: 'AshPack', focus: true, closeOnEscape: true, columns: DRAWER_COLUMNS })
}

async function closeDrawer($: EngineInterface): Promise<void> {
  await update($, drawerOpen, () => false)
  await $.store.set(OPEN_KEY, false)
  await $.ui.close({ id: DRAWER })
}

async function showPage($: EngineInterface, id: string): Promise<void> {
  await update($, page, () => id)
  await $.store.set(PAGE_KEY, id)
}

type PaneInput = RenderInput<'Pane'>

// Home: the mods with a page, the plugin order when it is wrong, and how to adopt.
function homePage($: EngineInterface, e: PaneInput, pages: readonly Page[], misplacedNow: boolean, accent: string) {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box key="page-home" flexDirection="column" rowGap={1}>
      {misplacedNow ? (
        <Box flexDirection="column" borderStyle="round" borderColor="#a87700" paddingX={1}>
          <Text bold>Another mod sits above AshPack</Text>
          <Text dimColor wrap="wrap">
            The drawer holds the pages and chips of the mods beneath it only. Put "{HOST}" first in enabledPlugins in ~/.claude/settings.json, or:
          </Text>
          <Button key="fix-order" plain label="↑ move AshPack first" onPress={() => fixOrder($)} />
        </Box>
      ) : null}
      <Box flexDirection="column">
        <Text bold>Pages</Text>
        {pages.length > 0 ? (
          pages.map(p => (
            <Box key={`home-page-${p.id}`} columnGap={1}>
              <Text color={accent}>●</Text>
              <Button key={`home-open-${p.id}`} plain label={p.label} onPress={() => showPage($, p.id)} />
            </Box>
          ))
        ) : (
          <Text dimColor>No mod has a page yet.</Text>
        )}
      </Box>
      <Text dimColor wrap="wrap">
        A mod joins with one Box keyed "ashpack-page:Label" in the drawer, or "ashpack-chip:label" in the strip above the prompt. See ADOPTING.md in the ashpack repo.
      </Text>
    </Box>
  )
}

// The tab bar: a tab per page, the shown one lit and underlined (the terminal) or bright
// (elsewhere). On the terminal, n and p step through the tabs.
function tabBar($: EngineInterface, e: PaneInput, tabs: readonly { id: string; label: string }[], shown: string, accent: string) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const ids = tabs.map(t => t.id)
  return (
    <Box key="tabs" columnGap={2} flexWrap="wrap">
      {tabs.map(t => {
        const isShown = t.id === shown
        return (
          <Box key={`tab-${t.id}`} flexDirection="column">
            <Button key={`page-${t.id}`} plain dimColor={!isShown} label={t.label} onPress={() => showPage($, t.id)} />
            {e.surface === 'terminal' ? (
              <Text color={isShown ? accent : undefined} dimColor={!isShown}>
                {(isShown ? '━' : '─').repeat([...t.label].length)}
              </Text>
            ) : null}
          </Box>
        )
      })}
      {e.surface === 'terminal' && tabs.length > 1 ? (
        <Box columnGap={1}>
          <Button key="tab-prev" plain dimColor hotkey="p" label="‹p" onPress={() => showPage($, stepTab(ids, shown, -1))} />
          <Button key="tab-next" plain dimColor hotkey="n" label="n›" onPress={() => showPage($, stepTab(ids, shown, 1))} />
        </Box>
      ) : null}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ashpack',
      description: 'Open the AshPack drawer, or a page of it: /ashpack skins',
      argumentHint: '[page|close]',
    })
    const [storedPage, storedOpen] = await Promise.all([$.store.get(PAGE_KEY), $.store.get(OPEN_KEY)])
    if (typeof storedPage === 'string') await update($, page, () => storedPage)
    const started = await next(e)
    await checkOrder($).catch(() => undefined)
    void noticeSplit($).catch(() => undefined)
    // The drawer comes back as it was left; opened unasked it waits for a wide terminal.
    if (storedOpen === true) await openDrawer($).catch(() => undefined)
    return started
  })

  on('command.run', { command: 'ashpack' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'close') {
      await closeDrawer($)
      return {}
    }
    // A word names a page (`/ashpack skins`); a page no mod draws shows Home.
    await openDrawer($, arg || undefined)
    return {}
  })

  // The person closing the panel (Esc, its close mark) folds the drawer too.
  on('ui.close', async ($, e, next) => {
    if (e.id === DRAWER) {
      await update($, drawerOpen, () => false)
      await $.store.set(OPEN_KEY, false)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // ── footer: the mods that draw here (those without a page), then "◆ AshPack" ──
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const [isOpen, accent] = await Promise.all([read($, drawerOpen), accentColor($)])
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box columnGap={2}>
        {below}
        <Box>
          <Text color={accent}>◆ </Text>
          <Button key="ashpack" plain label={isOpen ? 'AshPack ◂' : 'AshPack ▸'} onPress={() => (isOpen ? closeDrawer($) : openDrawer($))} />
        </Box>
      </Box>
    )
  })

  // ── the strip above the prompt: the chips of the mods beneath, in one row ──
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const chips = findChips(below)
    if (chips.length === 0) return below
    const { Box } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'
    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap" columnGap={isTerminal ? 2 : 3} rowGap={isTerminal ? 0 : 1}>
          {chips.map(c => c.tree as RenderElement)}
        </Box>
        {withoutChips(below) as RenderElement | null}
      </Box>
    )
  })

  // ── the drawer: a header, the tab bar, the shown page ──
  // The mods beneath draw their pages into `next(e)`'s tree; each keeps its own buttons.
  on('ui.render', { component: 'Pane', requestId: DRAWER }, async ($, e, next) => {
    // A mod whose page hook fails costs the pages, never the drawer.
    const below = await next(e).catch(err => ($.ui.log(`ashpack drawer pages: ${String(err)}`, { to: 'debug' }), null))
    const pages = findPages(below)
    const [shown, misplacedNow, accent] = await Promise.all([read($, page), read($, isMisplaced), accentColor($)])
    const { Box, Text } = $.ui.resolve(e)
    const tabs = [{ id: 'home', label: 'Home' }, ...pages]
    const active = tabs.find(t => t.id === shown)?.id ?? 'home'
    const body = active === 'home' ? homePage($, e, pages, misplacedNow, accent) : ((pages.find(p => p.id === active)?.tree ?? null) as RenderElement | null)
    return (
      <Box flexDirection="column" rowGap={1} paddingX={1}>
        <Box justifyContent="space-between" columnGap={2}>
          <Text wrap="truncate-end">
            <Text bold color={accent}>
              ◆ AshPack
            </Text>
            <Text dimColor> · your mods, one place</Text>
          </Text>
          {e.surface === 'terminal' ? <Text dimColor>Esc closes</Text> : null}
        </Box>
        {tabBar($, e, tabs, active, accent)}
        {body}
      </Box>
    )
  })
}
