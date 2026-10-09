import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { Block, Inline } from './markdown'
import { parseBlocks } from './markdown'
import { diffstat } from './ref/format'
import { splitReply } from './ref/markdown'
import type { Call, Look } from './ref/rows'
import { codeCard, copyRow, desktopSpinnerRow, diffCard, groupRow, promptRow, replyRows, tableRows, terminalCard, toolRow } from './ref/rows'
import type { Palette as SlotPalette } from './ref/skin'
import { ICONS } from './ref/skin'
import { hunksOf } from './ref/svg-diff'
import { shellOutputOf } from './ref/svg-terminal'
import { kindOf as rowKind, summarize } from './ref/tools'
import type { Palette, Skin } from './skins'
import { cardLayout, duration, isLightTheme, kindColor, kindOf, OFF, paletteOf, pick, pixelRows, pixelSvg, pixelWidth, SKINS, skinById, targetOf, themeFor, toolLabel } from './skins'

// AshPack Skins. Recolors the prompt, the replies, tool rows, spinner words and turn
// footer in a skin's colors, and draws the way hellosverre/claude-skins does (its
// renderers are vendored in ./ref): on the desktop app, tool rows and group rows with a
// line icon, lines changed and time taken, edits as diff cards, shell output in a
// terminal card, code and tables as cards whose rows rise in, and an animated spinner.
// The terminal keeps plain rows and Claude Code's own diffs and output. The picker is a
// page of the AshPack drawer (`/skin` opens it there), or a pane of its own without
// AshPack. Dark or light picks the palette and Claude Code's theme. What the model reads
// and the stored conversation are untouched.

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
const EDITS = new Set(['Edit', 'Write', 'MultiEdit'])

type Active = { skin: Skin; p: Palette }

async function active($: EngineInterface): Promise<Active | null> {
  const [id, skinsOn, light] = await Promise.all([read($, chosen), read($, isOn), read($, isLight)])
  const skin = skinsOn ? skinById(id) : undefined
  return skin ? { skin, p: paletteOf(skin, light) } : null
}

async function load($: EngineInterface): Promise<void> {
  const [stored, storedOn, mode] = await Promise.all([$.store.get(SKIN_KEY), $.store.get(ON_KEY), $.store.get(MODE_KEY)])
  // 0.1.0 stored 'off' as the skin itself.
  await update($, chosen, () => (typeof stored === 'string' && skinById(stored) ? stored : DEFAULT_SKIN))
  await update($, isOn, () => (typeof storedOn === 'boolean' ? storedOn : stored !== OFF))
  if (mode === 'light' || mode === 'dark') await update($, isLight, () => mode === 'light')
  else await followTheme($)
}

const themeOf = async ($: EngineInterface): Promise<unknown> => (await $.config.list()).find(r => r.key === 'theme')?.value

// The person changed Claude Code's theme (/theme): the skin's mode follows it.
async function followTheme($: EngineInterface): Promise<void> {
  const light = isLightTheme(await themeOf($))
  await update($, isLight, () => light)
  await $.store.set(MODE_KEY, light ? 'light' : 'dark')
}

// Dark or light: the skin's palette, and Claude Code's own theme to match.
async function setLight($: EngineInterface, light: boolean): Promise<void> {
  await update($, isLight, () => light)
  await $.store.set(MODE_KEY, light ? 'light' : 'dark')
  const theme = await themeOf($)
  const wanted = themeFor(theme, light)
  if (wanted === theme) return
  const result = await $.config.set({ key: 'theme', value: wanted })
  if (result.deny !== undefined) $.ui.log(`ashpack-skins: theme stays ${String(theme)}: ${result.deny}`, { to: 'debug' })
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

// ── claude-skins' renderers, fed this skin ──

// A hex color `t` of the way from `a` to `b`.
const mix = (a: string, b: string, t: number): string => {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`
}

// This skin's palette as claude-skins' colour slots: each kind of tool in the colour
// the terminal rows use, the table bands faint tints of the text over the background.
const slots = (p: Palette): SlotPalette => ({
  read: p.blue,
  write: p.yellow,
  run: p.green,
  search: p.purple,
  web: p.cyan,
  mcp: p.pink,
  other: p.text,
  user: p.accent,
  fg: p.text,
  muted: p.muted,
  surface: mix(p.bg, p.text, 0.14),
  zebra: mix(p.bg, p.text, 0.07),
  ok: p.green,
  err: p.red,
  warn: p.yellow,
})

const PREFS = { skin: '', icons: 'unicode', rail: false, tables: true, shimmer: false, band: false, clipOutput: false } as const

type LookInput =
  | RenderInput<'AssistantMessage'>
  | RenderInput<'ToolResult'>
  | RenderInput<'ToolUse'>
  | RenderInput<'ToolGroup'>
  | RenderInput<'Spinner'>
  | RenderInput<'UserMessage'>

// What claude-skins' row builders draw with: this surface's elements (its Svg on the
// desktop), the skin, and a Copy that puts text on this surface's clipboard.
function lookOf($: EngineInterface, e: LookInput, a: Active): Look {
  const ui = $.ui.resolve(e)
  const copy = (text: string) =>
    void $.ui.copy({ text, surface: e.surface }).then(r => $.ui.toast(r.isCopied ? 'Copied' : 'Could not copy here'))
  return {
    ui,
    skin: { name: a.skin.id, label: a.skin.label, palette: slots(a.p), spinner: a.skin.words, done: a.skin.done },
    icons: ICONS.unicode,
    prefs: { ...PREFS, skin: a.skin.id },
    surface: e.surface,
    ...(e.surface !== 'terminal' && 'Svg' in ui ? { svg: ui.Svg } : {}),
    copy,
  }
}

// A reply's blocks in the skin's colors; code and tables as cards.
function replyBlocks($: EngineInterface, e: RenderInput<'AssistantMessage'>, a: Active, blocks: readonly Block[]) {
  const { p } = a
  const look = lookOf($, e, a)
  const { Box, Code, Link, Markdown, Text } = $.ui.resolve(e)
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
  const draw = (b: Block, k: string) => {
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
        // The desktop: claude-skins' code card. The terminal: Claude Code's highlighter, and a Copy.
        if (look.svg) return codeCard(look, b.lang, b.code, look.svg, e.viewport?.columns ?? 100, `copy-${k}`)
        return (
          <Box flexDirection="column">
            <Code source={b.code} {...(b.lang ? { language: b.lang } : {})} />
            {copyRow(look, `copy-${k}`, b.code)}
          </Box>
        )
      case 'rule':
        return <Text color={p.muted}>{'─'.repeat(24)}</Text>
      case 'markdown': {
        // A table: claude-skins' animated card on the desktop, its cell grid on the terminal.
        const table = splitReply(b.text).find(seg => seg.kind === 'table')
        if (!table || table.kind !== 'table') return <Markdown text={b.text} />
        return look.svg ? replyRows(look, [table], e.viewport?.columns ?? 100, look.svg) : tableRows(look, table, e.viewport?.columns ?? 100)
      }
    }
  }
  // A blank line between blocks, none between the items of one list.
  return blocks.map((b, i) => (
    <Box key={`block-${i}`} marginTop={i > 0 && !(b.kind === 'item' && blocks[i - 1]?.kind === 'item') ? 1 : 0}>
      {draw(b, `block-${i}`)}
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

  // Your prompt in a rounded outline sized to what you typed (claude-skins' prompt row).
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const a = await active($)
    if (!a || !TYPED.has(e.props.origin.kind) || e.props.text.length > MAX_PROMPT || (await read($, memberOf(hasImages, e)))) {
      return next(e)
    }
    return promptRow(lookOf($, e, a), e.props.text)
  })

  // Times every call, for the row's "how long it took".
  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    await update($, memberOf(tookMs, { requestId: e.tool_use_id }), () => ms)
    return ran
  }).catch(($, e, next) => next(e))

  // A tool row. The desktop: claude-skins' row, a line icon for its kind (a ring while it
  // runs), the tool, its target, lines changed and time taken. The terminal: a plain row.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = rowKind(e.props.tool)
    const a = kind ? await active($) : null
    if (!kind || !a) return next(e)
    const cwd = await $.session.cwd()
    if (e.surface !== 'terminal') {
      const ms = await read($, memberOf(tookMs, e))
      const diff = diffstat(e.props.output)
      const meta = { ...(ms >= 0 && !e.props.isRunning ? { ms } : {}), ...(diff ?? {}) }
      return toolRow(lookOf($, e, a), e.props as Call, kind, summarize(e.props.tool, e.props.input, cwd), meta)
    }
    const { Text } = $.ui.resolve(e)
    const { p } = a
    const color = kindColor(p, kindOf(e.props.tool) ?? 'mcp')
    const labelColor = e.props.isRunning || e.props.isInterrupted ? p.muted : e.props.isErrored ? p.red : color
    const target = targetOf(e.props.tool, e.props.input, cwd)
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

  // A run of calls the transcript folds into one line: claude-skins' group row on the
  // desktop (`Read 3 · Run 2` beside an icon), Claude Code's own on the terminal.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const a = e.surface !== 'terminal' && !e.props.isExpanded ? await active($) : null
    if (!a) return next(e)
    return groupRow(lookOf($, e, a), e.props.calls as readonly Call[])
  })

  // On the desktop, an edit's result as claude-skins' diff card and a shell command's as
  // its terminal card. The terminal keeps Claude Code's own diff and output.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const a = e.surface !== 'terminal' ? await active($) : null
    const look = a ? lookOf($, e, a) : null
    if (!look?.svg) return next(e)
    const columns = e.viewport?.columns ?? 100
    if (EDITS.has(e.props.tool) && !e.props.isErrored) {
      const diff = hunksOf(e.props.output)
      if (diff) return diffCard(look, look.svg, diff, summarize(e.props.tool, { file_path: diff.path }, await $.session.cwd()), columns)
    }
    if (e.props.tool === 'Bash') {
      const shell = shellOutputOf(e.props.output)
      if (shell) return terminalCard(look, look.svg, shell, e.props.isErrored, columns)
    }
    return next(e)
  })

  // A reply in the skin's colors, block by block. A summary row keeps Claude Code's.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const a = await active($)
    if (!a || e.props.isSummary || e.props.text.length > MAX_REPLY) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {replyBlocks($, e, a, parseBlocks(e.props.text))}
      </Box>
    )
  })

  // The spinner keeps Claude Code's line (time, tokens) and says the skin's word.
  // The desktop: claude-skins' animated icon for what the turn is doing, beside the step the app names.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const a = await active($)
    if (a && e.surface !== 'terminal') {
      const look = lookOf($, e, a)
      return look.svg ? desktopSpinnerRow(look, look.svg, e.props.mode, e.props.message ?? e.props.word) : next(e)
    }
    if (!a || e.props.message !== null) return next(e)
    return next({ ...e, props: { ...e.props, word: pick(a.skin.words, e.props.word) } })
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
