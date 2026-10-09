import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { Palette, Skin } from './skins'
import { cardLayout, duration, isLightTheme, kindColor, kindOf, OFF, paletteOf, pick, pixelRows, pixelSvg, pixelWidth, SKINS, skinById, targetOf, toolLabel } from './skins'

// AshPack Skins. Redraws the prompt, tool rows, spinner words and turn footer in
// a skin's colors with Box and Text only, so the terminal and the desktop app
// draw the same. `/skin`, or the Skins button in the footer (a tab of the
// AshPack tray), opens a side pane of mock cards to pick one from.
// What the model reads and the stored conversation are untouched.

const PANE = 'ashpack-skins'
const SKIN_KEY = 'skin' // $.store keys: the picked skin, and whether skins are on
const ON_KEY = 'on'
const DEFAULT_SKIN = SKINS[0]?.id ?? ''
const HOTKEYS = '123456789abcdefg'
const CARD_GAP = 2
const MAX_PROMPT = 4000 // a longer paste keeps Claude Code's folding
const BANNER = 'ASHPACK SKINS'
const SHORT_BANNER = 'SKINS'
const BANNER_PX = 6 // the desktop banner's pixel, in CSS pixels

// Only a person's own typing becomes a skinned prompt row.
const TYPED = new Set(['composer', 'bridge', 'sdk'])

const chosen = atom({ plugin: 'ashpack-skins', key: 'skin' } as const, DEFAULT_SKIN)
const isOn = atom({ plugin: 'ashpack-skins', key: 'isOn' } as const, true)
const isLight = atom({ plugin: 'ashpack-skins', key: 'isLight' } as const, false)
const hasImages = atom({ plugin: 'ashpack-skins', key: 'images' } as const, false)

type Active = { skin: Skin; p: Palette }

async function active($: EngineInterface): Promise<Active | null> {
  const [id, skinsOn, light] = await Promise.all([read($, chosen), read($, isOn), read($, isLight)])
  const skin = skinsOn ? skinById(id) : undefined
  return skin ? { skin, p: paletteOf(skin, light) } : null
}

async function load($: EngineInterface): Promise<void> {
  const [stored, storedOn] = await Promise.all([$.store.get(SKIN_KEY), $.store.get(ON_KEY)])
  // 0.1.0 stored 'off' as the skin itself.
  await update($, chosen, () => (typeof stored === 'string' && skinById(stored) ? stored : DEFAULT_SKIN))
  await update($, isOn, () => (typeof storedOn === 'boolean' ? storedOn : stored !== OFF))
  await refreshTheme($)
}

// Claude Code's own theme decides whether a skin draws its light or dark palette.
async function refreshTheme($: EngineInterface): Promise<void> {
  const rows = await $.config.list()
  const light = isLightTheme(rows.find(r => r.key === 'theme')?.value)
  await update($, isLight, () => light)
}

async function setOn($: EngineInterface, value: boolean): Promise<void> {
  await update($, isOn, () => value)
  await $.store.set(ON_KEY, value)
}

// Picking a skin turns skins on.
async function choose($: EngineInterface, id: string): Promise<void> {
  await update($, chosen, () => id)
  await $.store.set(SKIN_KEY, id)
  await setOn($, true)
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Skins', focus: true, closeOnEscape: true })
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
    [[p.accent, '▍ '], [p.text, 'fix the login bug']],
    [[p.blue, '● Read', true], [p.muted, ' src/auth.ts']],
    [[p.yellow, '● Edit', true], [p.muted, ' auth.ts '], [p.green, '+4 '], [p.red, '−1']],
    [[p.green, '● Bash', true], [p.muted, ' npm test']],
    [[p.accent, `✻ ${skin.words[0]}…`]],
  ]
  const spans = (line: [string, string, boolean?][], r: number, end: string) =>
    line.map(([color, text, bold], i) => (
      <Text key={`${skin.id}-${r}-${i}`} color={color} bold={bold}>
        {i === line.length - 1 ? text + end : text}
      </Text>
    ))
  const mark = isPicked ? (isOnNow ? '✓ on' : '· off') : ''
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
function banner($: EngineInterface, e: RenderInput<'Pane'>, p: Palette) {
  const word = pixelWidth(BANNER) <= e.props.bodyColumns ? BANNER : SHORT_BANNER
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skin',
      description: 'Pick a skin from the side pane, or /skin <name | on | off>',
      argumentHint: `[${[...SKINS.map(s => s.id), 'on', OFF].join(' | ')}]`,
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
    if (e.key === 'theme') await refreshTheme($)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'skin' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === '') {
      await openPane($)
      return {}
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

  // The footer's Skins button. The AshPack tray folds it into a tab of its own.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const [id, skinsOn] = await Promise.all([read($, chosen), read($, isOn)])
    const { Box, Button } = $.ui.resolve(e)
    const label = skinsOn ? (skinById(id)?.label ?? 'on') : 'off'
    return (
      <Box columnGap={2}>
        {below}
        <Button key="skins-open" plain dimColor={!skinsOn} label={`◐ Skins: ${label}`} onPress={() => openPane($)} />
      </Box>
    )
  })

  // The picker: the banner, the on/off toggle, then a card per skin, a few to a row, all centered.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [id, skinsOn, light] = await Promise.all([read($, chosen), read($, isOn), read($, isLight)])
    const { Box, Button, Text } = $.ui.resolve(e)
    const { perRow, width } = cardLayout(e.props.bodyColumns, CARD_GAP)
    const rows = Array.from({ length: Math.ceil(SKINS.length / perRow) }, (_, r) => SKINS.slice(r * perRow, (r + 1) * perRow))
    const picked = skinById(id) ?? SKINS[0]
    return (
      <Box flexDirection="column" alignItems="center" rowGap={1}>
        {picked ? banner($, e, paletteOf(picked, light)) : null}
        <Box columnGap={2}>
          <Text bold>Skins</Text>
          <Button key="skin-toggle" plain hotkey="0" label={skinsOn ? '● ON ' : '○ OFF'} onPress={() => setOn($, !skinsOn)} />
          <Text dimColor>
            {skinsOn ? picked?.label : "Claude Code's own"} · {light ? 'light' : 'dark'}
          </Text>
        </Box>
        {rows.map((row, r) => (
          <Box key={`cards-${r}`} columnGap={CARD_GAP}>
            {row.map((skin, c) => card($, e, skin, r * perRow + c, width, skin.id === picked?.id, skinsOn, light))}
          </Box>
        ))}
        <Text dimColor>Click a card or press its key · Esc closes</Text>
      </Box>
    )
  })

  // Notes which prompts carried images, so their row keeps Claude Code's drawing of them.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.door === 'prompt' && stored.uuid !== undefined && e.message.content.some(b => b.type === 'image')) {
      await update($, memberOf(hasImages, { requestId: stored.uuid }), () => true)
    }
    return stored
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const a = await active($)
    if (!a || !TYPED.has(e.props.origin.kind) || e.props.text.length > MAX_PROMPT || (await read($, memberOf(hasImages, e)))) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={a.p.accent}>▍ </Text>
        <Box flexGrow={1}>
          <Text color={a.p.text}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    const a = kind ? await active($) : null
    if (!kind || !a) return next(e)
    const { Text } = $.ui.resolve(e)
    const { p } = a
    const color = kindColor(p, kind)
    const [icon, iconColor] = e.props.isRunning ? ['○', p.muted] : e.props.isInterrupted ? ['◌', p.muted] : e.props.isErrored ? ['✕', p.red] : ['●', color]
    const target = targetOf(e.props.tool, e.props.input, await $.session.cwd())
    return (
      <Text wrap="truncate-end">
        <Text color={iconColor}>{icon} </Text>
        <Text color={color} bold>
          {toolLabel(e.props.tool)}
        </Text>
        {target ? <Text color={p.muted}> {target}</Text> : null}
        {e.props.isInterrupted ? <Text color={p.muted}> · interrupted</Text> : null}
      </Text>
    )
  })

  // The spinner keeps Claude Code's line (time, tokens) and says the skin's word.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const a = await active($)
    if (!a || e.surface !== 'terminal' || e.props.message !== null) return next(e)
    return next({ ...e, props: { ...e.props, word: pick(a.skin.words, e.props.word) } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const a = await active($)
    if (!a) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text>
        <Text color={a.p.accent}>◆ </Text>
        <Text color={a.p.muted}>
          {pick(a.skin.done, e.props.word)} for {duration(e.props.durationMs)}
        </Text>
      </Text>
    )
  })
}
