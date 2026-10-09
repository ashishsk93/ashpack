import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, Timer } from 'claude-code'

import type { Block, Inline } from './markdown'
import { parseBlocks } from './markdown'
import type { Card, Table } from './cards'
import { cardWidth, codeSvg, diffOf, diffSvg, shellOf, tableOf, tableSvg, terminalSvg } from './cards'
import { toolIcon, wave, waveSvg } from './icons'
import type { Kind, Palette, Skin } from './skins'
import { cardLayout, duration, isLightTheme, kindColor, kindOf, OFF, paletteOf, pick, pixelRows, pixelSvg, pixelWidth, SKINS, skinById, targetOf, themeFor, toolLabel } from './skins'

// AshPack Skins. Recolors the prompt, the replies, tool rows, spinner words and turn
// footer in a skin's colors. On the desktop app it also draws tool rows and group rows
// (a line icon, the target, lines changed, time taken), edits as diff cards, shell
// output in a terminal card, code and tables as cards whose rows rise in when new, and
// a moving mark for what the turn is doing. The terminal keeps plain rows and Claude
// Code's own diffs and output. The picker is a page of the AshPack drawer (`/skin` opens
// it there), or a pane of its own without AshPack. Dark or light picks the palette and
// Claude Code's theme. What the model reads and the stored conversation are untouched.

const PANE = 'ashpack-skins' // the picker's own pane, for sessions without AshPack
const DRAWER = 'ashpack' // the AshPack drawer's pane, where the picker is a page
const ASHPACK = 'ashpack@ashpack'
const SKIN_KEY = 'skin' // $.store keys: the picked skin, whether skins are on, dark or light
const ON_KEY = 'on'
const MODE_KEY = 'mode'
const DEFAULT_SKIN = SKINS[0]?.id ?? ''
const HOTKEYS = '123456789abcdefg'
const CARD_GAP = 2
const MAX_PROMPT = 4000 // a longer paste keeps Claude Code's folding
const MAX_REPLY = 20_000 // a longer reply keeps Claude Code's drawing
const BANNER = 'ASHPACK SKINS'
const SHORT_BANNER = 'SKINS'
const BANNER_PX = 6 // the desktop banner's pixel, in CSS pixels

// Only a person's own typing becomes a skinned prompt row.
const TYPED = new Set(['composer', 'bridge', 'sdk'])

const chosen = atom({ plugin: 'ashpack-skins', key: 'skin' } as const, DEFAULT_SKIN)
const isOn = atom({ plugin: 'ashpack-skins', key: 'isOn' } as const, true)
const isLight = atom({ plugin: 'ashpack-skins', key: 'isLight' } as const, false)
const hasImages = atom({ plugin: 'ashpack-skins', key: 'images' } as const, false)
const tookMs = atom({ plugin: 'ashpack-skins', key: 'duration' } as const, -1) // per tool call: how long it ran
const commandOf = atom({ plugin: 'ashpack-skins', key: 'command' } as const, '') // per Bash call: its command
const sharedAccent = atom({ plugin: 'ashpack-skins', key: 'accent' } as const, '') // read by AshPack's loader
const frame = atom({ plugin: 'ashpack-skins', key: 'frame' } as const, 0)
const FRAME_MS = 120
const SPINNER_CELLS = 4 // the terminal spinner's wave
const SPINNER_PX = 25 // the desktop spinner's wave: four bars
const ANIMATE_MS = 1500 // a card's rows rise in during its first moments only
const MAX_SEEN = 500
const EDITS = new Set(['Edit', 'Write', 'MultiEdit'])

type Active = { skin: Skin; p: Palette }

async function active($: EngineInterface): Promise<Active | null> {
  const [id, skinsOn, light] = await Promise.all([read($, chosen), read($, isOn), read($, isLight)])
  const skin = skinsOn ? skinById(id) : undefined
  return skin ? { skin, p: paletteOf(skin, light) } : null
}

// Other mods (AshPack's loader) wear the active skin's accent.
async function shareAccent($: EngineInterface): Promise<void> {
  const a = await active($)
  await update($, sharedAccent, () => a?.p.accent ?? '')
}

// The terminal spinner's wave moves a step per tick while a turn runs.
let ticker: Timer | undefined
let terminalSeen = false // a terminal has drawn: the frame has a reader

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function load($: EngineInterface): Promise<void> {
  const [stored, storedOn, mode] = await Promise.all([$.store.get(SKIN_KEY), $.store.get(ON_KEY), $.store.get(MODE_KEY)])
  // 0.1.0 stored 'off' as the skin itself.
  await update($, chosen, () => (typeof stored === 'string' && skinById(stored) ? stored : DEFAULT_SKIN))
  await update($, isOn, () => (typeof storedOn === 'boolean' ? storedOn : stored !== OFF))
  if (mode === 'light' || mode === 'dark') await update($, isLight, () => mode === 'light')
  else await followTheme($)
  await shareAccent($)
}

const themeOf = async ($: EngineInterface): Promise<unknown> => (await $.config.list()).find(r => r.key === 'theme')?.value

// The person changed Claude Code's theme (/theme): the skin's mode follows it.
async function followTheme($: EngineInterface): Promise<void> {
  const light = isLightTheme(await themeOf($))
  await update($, isLight, () => light)
  await $.store.set(MODE_KEY, light ? 'light' : 'dark')
  await shareAccent($)
}

// Dark or light: the skin's palette, and Claude Code's own theme to match.
async function setLight($: EngineInterface, light: boolean): Promise<void> {
  await update($, isLight, () => light)
  await $.store.set(MODE_KEY, light ? 'light' : 'dark')
  await shareAccent($)
  const theme = await themeOf($)
  const wanted = themeFor(theme, light)
  if (wanted === theme) return
  const result = await $.config.set({ key: 'theme', value: wanted })
  if (result.deny !== undefined) $.ui.log(`ashpack-skins: theme stays ${String(theme)}: ${result.deny}`, { to: 'debug' })
}

async function setOn($: EngineInterface, value: boolean): Promise<void> {
  await update($, isOn, () => value)
  await $.store.set(ON_KEY, value)
  await shareAccent($)
}

// Picking a skin turns skins on.
async function choose($: EngineInterface, id: string): Promise<void> {
  await update($, chosen, () => id)
  await $.store.set(SKIN_KEY, id)
  await setOn($, true)
}

// The picker: the AshPack drawer's Skins page, or its own pane without AshPack.
async function openPicker($: EngineInterface): Promise<void> {
  const settings = await $.settings.read()
  const hasDrawer = (settings.enabledPlugins as Record<string, unknown> | undefined)?.[ASHPACK] === true
  if (hasDrawer) {
    // A command hook may not run another command (it would wait on itself): hand off just after.
    $.clock.after(0, () => void $.command.run({ command: 'ashpack', args: 'skins' }).catch(err => $.ui.log(`ashpack-skins: ${String(err)}`, { to: 'debug' })))
    return
  }
  await $.ui.open({ id: PANE, title: 'Skins', focus: true, closeOnEscape: true })
}


// One small mock of a turn in the skin's colors, on its own background. The title and
// the whole mock are buttons that pick it.
function card($: EngineInterface, e: RenderInput<'Pane'>, skin: Skin, index: number, width: number, isPicked: boolean, isOnNow: boolean, light: boolean) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const p = paletteOf(skin, light)
  const pickIt = () => choose($, skin.id)
  const hotkey = HOTKEYS[index]
  // Each line of the mock as colored spans.
  const lines: [string, string, boolean?][][] = [
    [[p.accent, 'fix the login bug']],
    [[p.blue, 'Read', true], [p.muted, ' src/auth.ts']],
    [[p.yellow, 'Edit', true], [p.muted, ' auth.ts '], [p.green, '+4 '], [p.red, '−1']],
    [[p.green, 'Bash', true], [p.muted, ' npm test']],
    [[p.accent, `${skin.words[0]}…`]],
  ]
  const spans = (line: [string, string, boolean?][], r: number, end: string) =>
    line.map(([color, text, bold], i) => (
      <Text key={`${skin.id}-${r}-${i}`} color={color} bold={bold}>
        {i === line.length - 1 ? text + end : text}
      </Text>
    ))
  const mark = isPicked ? (isOnNow ? 'in use' : 'off') : ''
  const pickButton = <Button key={`skin-${skin.id}`} plain {...(hotkey ? { hotkey } : {})} label={skin.label} onPress={pickIt} />
  const frame = { flexDirection: 'column', borderStyle: 'round', borderColor: isPicked ? p.accent : p.muted, backgroundColor: p.bg, paddingX: 1 } as const
  // The terminal: the title inside the card, and the whole mock one button.
  if (e.surface === 'terminal') {
    return (
      <Box key={`card-${skin.id}`} width={width} {...frame}>
        <Box justifyContent="space-between">
          {pickButton}
          <Text color={isOnNow ? p.green : p.muted}>{mark}</Text>
        </Box>
        <Button key={`mock-${skin.id}`} plain onPress={pickIt}>
          {lines.flatMap((line, r) => spans(line, r, r < lines.length - 1 ? '\n' : ''))}
        </Button>
      </Box>
    )
  }
  // The desktop draws its buttons in its own colors, unreadable on a dark card, and a
  // Button holding Text as nothing: the title button sits above the card, the mock is text.
  return (
    <Box key={`card-${skin.id}`} flexDirection="column" width={width}>
      <Box justifyContent="space-between">
        {pickButton}
        <Text bold>{mark}</Text>
      </Box>
      <Box key={`mock-${skin.id}`} {...frame}>
        {lines.map((line, r) => (
          <Text key={`${skin.id}-line-${r}`} wrap="truncate-end">
            {spans(line, r, '')}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

// The pane's pixel-art title, each letter in a color of the picked skin; a narrow pane gets the short one.
// The terminal draws it in half blocks; the desktop as an SVG, since it spaces text lines apart.
function banner($: EngineInterface, e: RenderInput<'Pane'>, p: Palette, columns: number) {
  const word = pixelWidth(BANNER) <= columns ? BANNER : SHORT_BANNER
  const colors = [p.accent, p.pink, p.purple, p.blue, p.cyan, p.green, p.yellow]
  if (e.surface !== 'terminal') {
    const { Svg } = $.ui.resolve(e)
    return <Svg key="banner" source={pixelSvg(word, colors, BANNER_PX)} alt={word} />
  }
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box key="banner" flexDirection="column">
      {pixelRows(word).map((letters, r) => (
        <Text key={`banner-${r}`} wrap="truncate-end">
          {letters.map((glyph, i) => (
            <Text key={`px-${r}-${i}`} color={colors[i % colors.length]}>
              {i === 0 ? glyph : ` ${glyph}`}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

// The picker: the banner, the switches (on/off, dark/light), then a card per skin, a few to a row.
async function skinsPage($: EngineInterface, e: RenderInput<'Pane'>, columns: number) {
  const [id, skinsOn, light] = await Promise.all([read($, chosen), read($, isOn), read($, isLight)])
  const { Box, Button, Text } = $.ui.resolve(e)
  const { perRow, width } = cardLayout(columns, CARD_GAP)
  const rows = Array.from({ length: Math.ceil(SKINS.length / perRow) }, (_, r) => SKINS.slice(r * perRow, (r + 1) * perRow))
  const picked = skinById(id) ?? SKINS[0]
  return (
    <Box flexDirection="column" alignItems="center" rowGap={1}>
      {picked ? banner($, e, paletteOf(picked, light), columns) : null}
      <Box columnGap={3}>
        <Button key="skin-toggle" plain hotkey="0" label={skinsOn ? 'Skins on' : 'Skins off'} onPress={() => setOn($, !skinsOn)} />
        <Button key="skin-mode" plain hotkey="m" label={light ? 'Light' : 'Dark'} onPress={() => setLight($, !light)} />
        <Text dimColor>{skinsOn ? picked?.label : "Claude Code's own"}</Text>
      </Box>
      {rows.map((row, r) => (
        <Box key={`cards-${r}`} columnGap={CARD_GAP}>
          {row.map((skin, c) => card($, e, skin, r * perRow + c, width, skin.id === picked?.id, skinsOn, light))}
        </Box>
      ))}
      <Text dimColor>Click a card or press its key</Text>
    </Box>
  )
}

// ── drawing on the desktop ──

type DrawInput =
  | RenderInput<'AssistantMessage'>
  | RenderInput<'ToolResult'>
  | RenderInput<'ToolUse'>
  | RenderInput<'ToolGroup'>
  | RenderInput<'Spinner'>

// When each card was first drawn. A redraw (a resize, the side panel opening) is drawn
// still, so the rows rise in once.
// ponytail: module memory, starts over on reload; capped at MAX_SEEN keys
const firstSeen = new Map<string, number>()

async function isNew($: EngineInterface, key: string): Promise<boolean> {
  const now = await $.clock.now()
  const seen = firstSeen.get(key)
  if (seen !== undefined) return now - seen < ANIMATE_MS
  firstSeen.set(key, now)
  if (firstSeen.size > MAX_SEEN) firstSeen.delete(firstSeen.keys().next().value ?? key)
  return true
}

function copyText($: EngineInterface, e: DrawInput, text: string): void {
  void $.ui.copy({ text, surface: e.surface }).then(r => $.ui.toast(r.isCopied ? 'Copied' : 'Could not copy here'))
}

// A card image, and a Copy under it (an image's text cannot be selected).
function cardTree($: EngineInterface, e: DrawInput, c: Card, copy: string, key: string) {
  if (e.surface === 'terminal') return null
  const { Box, Button, Svg } = $.ui.resolve(e)
  return (
    <Box key={`card-${key}`} flexDirection="column" marginY={1} alignSelf="flex-start">
      <Svg source={c.source} alt={c.alt} width={c.width} height={c.height} />
      <Box justifyContent="flex-end">
        <Button key={`copy-${key}`} plain dimColor label="Copy" onPress={() => copyText($, e, copy)} />
      </Box>
    </Box>
  )
}

// A table on the terminal: an outline, the column names in the accent, the cells lined up.
function tableGrid($: EngineInterface, e: RenderInput<'AssistantMessage'>, p: Palette, t: Table) {
  const { Box, Text } = $.ui.resolve(e)
  const room = Math.max(20, (e.viewport?.columns ?? 100) - 8)
  const natural = t.header.map((h, c) => Math.max([...h].length, ...t.rows.map(r => [...(r[c] ?? '')].length)))
  const scale = Math.min(1, (room - 2 * (natural.length - 1)) / Math.max(1, natural.reduce((a, b) => a + b, 0)))
  const widths = natural.map(w => Math.max(3, Math.floor(w * scale)))
  const cell = (v: string, w: number) => ([...v].length > w ? `${[...v].slice(0, w - 1).join('')}…` : v.padEnd(w))
  const line = (r: string[]) => r.map((v, c) => cell(v, widths[c] ?? 3)).join('  ')
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={p.muted} paddingX={1} alignSelf="flex-start">
      <Text color={p.accent} bold>
        {line(t.header)}
      </Text>
      {t.rows.map((r, i) => (
        <Text key={`row-${i}`} color={p.text}>
          {line(r)}
        </Text>
      ))}
    </Box>
  )
}

const KIND_NAME: Record<Kind, string> = { read: 'Read', write: 'Edit', run: 'Run', search: 'Search', web: 'Web', mcp: 'MCP' }

// How long a call took: `0.4s`, `12s`, `1m 4s`.
const took = (ms: number): string => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : duration(ms))

type CallState = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

// A call's mark colour: red when it failed, muted while it runs or once interrupted.
const stateColor = (p: Palette, kind: Kind, s: CallState) => (s.isErrored ? p.red : s.isRunning || s.isInterrupted ? p.muted : kindColor(p, kind))

// A tool row on the desktop: its icon, the tool, what it touched, lines changed and time taken.
function toolRowTree($: EngineInterface, e: RenderInput<'ToolUse'>, p: Palette, kind: Kind, target: string, meta: { ms?: number; added?: number; removed?: number }) {
  if (e.surface === 'terminal') return null
  const { Box, Svg, Text } = $.ui.resolve(e)
  const s = e.props
  return (
    <Box flexDirection="row" columnGap={1} alignItems="center">
      <Svg source={toolIcon(kind, stateColor(p, kind, s), s.isRunning)} alt={KIND_NAME[kind]} width={16} height={16} />
      <Text wrap="truncate-end">
        <Text color={kindColor(p, kind)} bold>
          {toolLabel(s.tool)}
        </Text>
        {target ? <Text color={s.isErrored ? p.red : p.muted}>{`  ${target}`}</Text> : null}
        {meta.added || meta.removed ? <Text color={p.green}>{`   +${meta.added ?? 0}`}</Text> : null}
        {meta.added || meta.removed ? <Text color={p.red}>{` −${meta.removed ?? 0}`}</Text> : null}
        {meta.ms !== undefined ? <Text color={p.muted}>{`   ${took(meta.ms)}`}</Text> : null}
        {s.isInterrupted ? <Text color={p.muted}> · interrupted</Text> : null}
      </Text>
    </Box>
  )
}

// A run of calls folded into one row on the desktop: `Run 2 · Read 3` beside the icon of the most frequent.
function groupRowTree($: EngineInterface, e: RenderInput<'ToolGroup'>, p: Palette) {
  if (e.surface === 'terminal') return null
  const kinds = e.props.calls.map(c => kindOf(c.tool)).filter((k): k is Kind => k !== null)
  const counts = [...new Set(kinds)].map(k => [k, kinds.filter(x => x === k).length] as const).sort((a, b) => b[1] - a[1])
  const lead = counts[0]?.[0]
  if (!lead) return null
  const state = {
    isRunning: e.props.calls.some(c => c.isRunning),
    isErrored: e.props.calls.some(c => c.isErrored),
    isInterrupted: e.props.calls.some(c => c.isInterrupted),
  }
  const { Box, Svg, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="row" columnGap={1} alignItems="center">
      <Svg source={toolIcon(lead, stateColor(p, lead, state), state.isRunning)} alt={KIND_NAME[lead]} width={16} height={16} />
      <Text wrap="truncate-end">
        {counts.map(([k, n], i) => (
          <Text key={`kind-${k}`}>
            {i > 0 ? <Text color={p.muted}> · </Text> : null}
            <Text color={kindColor(p, k)} bold>
              {KIND_NAME[k]}
            </Text>
            <Text color={p.muted}>{` ${n}`}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  )
}

// A reply's blocks in the skin's colors; code and tables as cards.
async function replyBlocks($: EngineInterface, e: RenderInput<'AssistantMessage'>, a: Active, blocks: readonly Block[]) {
  const { p } = a
  const width = cardWidth(e.viewport?.columns)
  // Which of the desktop's cards are new, so only they rise in.
  const fresh = await Promise.all(
    blocks.map((b, i) => (e.surface !== 'terminal' && (b.kind === 'code' || b.kind === 'markdown') ? isNew($, `${e.requestId}:${i}`) : false)),
  )
  const { Box, Code, Link, Markdown, Text, Button } = $.ui.resolve(e)
  const spans = (list: readonly Inline[], key: string, color: string) =>
    list.map((s, i) =>
      s.kind === 'link' && s.href ? (
        <Link key={`${key}-${i}`} href={s.href} label={s.text} />
      ) : (
        <Text key={`${key}-${i}`} color={s.kind === 'code' ? p.cyan : color} bold={s.kind === 'bold'} italic={s.kind === 'italic'}>
          {s.text}
        </Text>
      ),
    )
  const draw = (b: Block, k: string, i: number) => {
    switch (b.kind) {
      case 'heading':
        return (
          <Text bold color={b.level <= 2 ? p.accent : p.purple}>
            {spans(b.spans, k, b.level <= 2 ? p.accent : p.purple)}
          </Text>
        )
      case 'para':
        return <Text color={p.text}>{spans(b.spans, k, p.text)}</Text>
      case 'item':
        return (
          <Box paddingLeft={b.depth * 2}>
            <Text color={p.accent}>{b.marker} </Text>
            <Box flexShrink={1}>
              <Text color={p.text}>{spans(b.spans, k, p.text)}</Text>
            </Box>
          </Box>
        )
      case 'quote':
        return (
          <Box paddingLeft={2}>
            <Text italic color={p.muted}>
              {spans(b.spans, k, p.muted)}
            </Text>
          </Box>
        )
      case 'code':
        // The desktop: a code card. The terminal: Claude Code's highlighting, and a Copy under it.
        if (e.surface !== 'terminal') return cardTree($, e, codeSvg(b.lang, b.code, p, width, fresh[i] === true), b.code, k)
        return (
          <Box flexDirection="column">
            <Code source={b.code} {...(b.lang ? { language: b.lang } : {})} />
            <Box justifyContent="flex-end">
              <Button key={`copy-${k}`} plain dimColor label="Copy" onPress={() => copyText($, e, b.code)} />
            </Box>
          </Box>
        )
      case 'rule':
        return <Text color={p.muted}>{'─'.repeat(24)}</Text>
      case 'markdown': {
        // A table: a card on the desktop, an outlined grid on the terminal.
        const table = tableOf(b.text)
        if (!table) return <Markdown text={b.text} />
        if (e.surface !== 'terminal') return cardTree($, e, tableSvg(table, p, width, fresh[i] === true), b.text, k)
        return tableGrid($, e, p, table)
      }
    }
  }
  // A blank line between blocks, none between the items of one list.
  return blocks.map((b, i) => (
    <Box key={`block-${i}`} marginTop={i > 0 && !(b.kind === 'item' && blocks[i - 1]?.kind === 'item') ? 1 : 0}>
      {draw(b, `block-${i}`, i)}
    </Box>
  ))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skin',
      description: 'Pick a skin in the AshPack drawer, or /skin <name | on | off | dark | light>',
      argumentHint: `[${[...SKINS.map(s => s.id), 'on', OFF, 'dark', 'light'].join(' | ')}]`,
      immediate: true,
    })
    await load($)
    return next(e)
  })

  // /clear, /resume and /branch reset $.state to its defaults and skip session.start.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (e.key === 'theme' && result.deny === undefined) await followTheme($)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'skin' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === '') {
      await openPicker($)
      return {}
    }
    if (arg === 'dark' || arg === 'light') {
      await setLight($, arg === 'light')
      return { text: `Skins: ${arg}.` }
    }
    if (arg === 'on' || arg === OFF) {
      await setOn($, arg === 'on')
      return { text: arg === 'on' ? 'Skins on.' : "Skins off: Claude Code's own drawing." }
    }
    const skin = SKINS.find(s => s.id === arg || s.label.toLowerCase() === arg)
    if (!skin) return { text: `No skin "${arg}". Skins: ${SKINS.map(s => s.id).join(', ')}; or on, off.` }
    await choose($, skin.id)
    return { text: `Skin: ${skin.label}.` }
  })

  // The Skins page of the AshPack drawer: drawn after the pages of the mods beneath.
  on('ui.render', { component: 'Pane', requestId: DRAWER }, async ($, e, next) => {
    const below = await next(e)
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Box key="ashpack-page:Skins" flexDirection="column">
          {await skinsPage($, e, e.props.bodyColumns - 2)}
        </Box>
      </Box>
    )
  })

  // Without AshPack the picker is a pane of its own.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => skinsPage($, e, e.props.bodyColumns))

  // Notes which prompts carried images, so their row keeps Claude Code's drawing of them.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.door === 'prompt' && stored.uuid !== undefined && e.message.content.some(b => b.type === 'image')) {
      await update($, memberOf(hasImages, { requestId: stored.uuid }), () => true)
    }
    return stored
  }).catch(($, e, next) => next(e))

  // Your prompt in the skin's colour, in a rounded outline sized to what you typed.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface === 'terminal') terminalSeen = true
    const a = await active($)
    if (!a || !TYPED.has(e.props.origin.kind) || e.props.text.length > MAX_PROMPT || (await read($, memberOf(hasImages, e)))) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" alignItems="flex-start" marginY={1}>
        <Box borderStyle="round" borderColor={a.p.muted} paddingX={1} flexShrink={1}>
          <Text color={a.p.text}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  // Times every call, for its row; keeps a shell call's command, for its terminal card.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash') await update($, memberOf(commandOf, { requestId: e.tool_use_id }), () => e.command)
    const startedAt = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    await update($, memberOf(tookMs, { requestId: e.tool_use_id }), () => ms)
    return ran
  }).catch(($, e, next) => next(e))

  // A tool row: on the desktop its icon, the tool, its target, lines changed and time
  // taken; on the terminal the tool and its target.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    const a = kind ? await active($) : null
    if (!kind || !a) return next(e)
    const { p } = a
    const target = targetOf(e.props.tool, e.props.input, await $.session.cwd())
    if (e.surface !== 'terminal') {
      const ms = await read($, memberOf(tookMs, e))
      const diff = diffOf(e.props.output)
      const meta = { ...(ms >= 0 && !e.props.isRunning ? { ms } : {}), ...(diff ? { added: diff.added, removed: diff.removed } : {}) }
      return toolRowTree($, e, p, kind, target, meta) ?? next(e)
    }
    const { Text } = $.ui.resolve(e)
    const labelColor = stateColor(p, kind, e.props)
    return (
      <Text wrap="truncate-end">
        <Text color={labelColor} bold>
          {toolLabel(e.props.tool)}
        </Text>
        {target ? <Text color={p.muted}> {target}</Text> : null}
        {e.props.isInterrupted ? <Text color={p.muted}> · interrupted</Text> : null}
      </Text>
    )
  })

  // A run of calls folded into one line: our row on the desktop, Claude Code's on the terminal.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const a = e.surface !== 'terminal' && !e.props.isExpanded ? await active($) : null
    return (a && groupRowTree($, e, a.p)) ?? next(e)
  })

  // On the desktop, an edit's result as a diff card and a shell command's in a terminal
  // card. The terminal keeps Claude Code's own diff and output.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const a = e.surface !== 'terminal' ? await active($) : null
    if (!a) return next(e)
    const width = cardWidth(e.viewport?.columns)
    const diff = EDITS.has(e.props.tool) && !e.props.isErrored ? diffOf(e.props.output) : null
    if (diff) {
      const path = targetOf('Edit', { file_path: diff.path }, await $.session.cwd())
      const card = diffSvg(diff, path, a.p, width, await isNew($, e.requestId))
      return cardTree($, e, card, card.alt, e.requestId) ?? next(e)
    }
    const shell = e.props.tool === 'Bash' ? shellOf(e.props.output, await read($, memberOf(commandOf, e)), e.props.isErrored) : null
    if (!shell) return next(e)
    const output = [shell.stdout, shell.stderr].filter(t => t.trim() !== '').join('\n')
    return cardTree($, e, terminalSvg(shell, a.p, width, await isNew($, e.requestId)), output, e.requestId) ?? next(e)
  })

  // A reply in the skin's colors, block by block. A summary row keeps Claude Code's.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const a = await active($)
    if (!a || e.props.isSummary || e.props.text.length > MAX_REPLY) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {await replyBlocks($, e, a, parseBlocks(e.props.text))}
      </Box>
    )
  })

  on('turn.start', async ($, e, next) => {
    stopTicker()
    // Only the terminal reads `frame`; a tick on the desktop would only redraw the transcript.
    if (terminalSeen) ticker = $.clock.every(FRAME_MS, () => void update($, frame, n => (n + 1) % 100_000))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) stopTicker()
    return next(e)
  })

  // The spinner: a wave in the skin's accent. The terminal keeps Claude Code's line (time,
  // tokens), says the skin's word and puts the wave after it; the desktop draws the wave
  // beside the step the app names.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface === 'terminal') terminalSeen = true
    const a = await active($)
    if (!a) return next(e)
    if (e.surface !== 'terminal') {
      const { Box, Svg, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" columnGap={1} alignItems="center">
          <Svg source={waveSvg(a.p.accent, SPINNER_PX)} alt="Working" />
          <Text color={a.p.muted}>{e.props.message ?? e.props.word}</Text>
        </Box>
      )
    }
    const f = await read($, frame)
    const word = e.props.message === null ? pick(a.skin.words, e.props.word) : e.props.word
    return next({ ...e, props: { ...e.props, word, suffix: `${e.props.suffix} ${wave(f, SPINNER_CELLS)}` } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const a = await active($)
    if (!a) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text>
        <Text color={a.p.muted}>
          {pick(a.skin.done, e.props.word)} for {duration(e.props.durationMs)}
        </Text>
      </Text>
    )
  })
}
