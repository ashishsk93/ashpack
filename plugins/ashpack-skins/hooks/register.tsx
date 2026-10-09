import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { SvgCard } from './cards'
import { cardWidth, codeSvg, diffOf, diffSvg, outputLines, shellOf, statusColor, tableOf, tableSvg, terminalSvg, unified } from './cards'
import type { Block, Inline } from './markdown'
import { parseBlocks } from './markdown'
import type { Palette, Skin } from './skins'
import { cardLayout, duration, isLightTheme, kindColor, kindOf, OFF, paletteOf, pick, pixelRows, pixelSvg, pixelWidth, SKINS, skinById, targetOf, themeFor, toolLabel } from './skins'

// AshPack Skins. Recolors the prompt, the replies, tool rows, spinner words and turn
// footer (text colors only, no backgrounds, no added icons), and draws cards: code and
// tables in replies, edits as diffs, shell output as a terminal. The desktop gets its
// cards as SVG whose rows rise in. The picker is a page of the AshPack drawer (`/skin`
// opens it there), or a pane of its own without AshPack. Dark or light picks the
// palette and Claude Code's theme. What the model reads and the stored conversation
// are untouched.

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
const commandOf = atom({ plugin: 'ashpack-skins', key: 'command' } as const, '') // per tool call: a Bash call's command
const MAX_CARD_LINES = 80 // a longer code block stays the engine's drawing, whole
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

type CardInput = RenderInput<'AssistantMessage'> | RenderInput<'ToolResult'>

async function copy($: EngineInterface, e: CardInput, text: string): Promise<void> {
  const result = await $.ui.copy({ text, surface: e.surface })
  $.ui.toast(result.isCopied ? 'Copied' : 'Could not copy here')
}

// The desktop's card: the SVG, and a Copy button under it (an image's text cannot be selected).
function svgCardTree($: EngineInterface, e: CardInput, c: SvgCard, copyText: string, key: string) {
  if (e.surface === 'terminal') return null
  const { Box, Button, Svg } = $.ui.resolve(e)
  return (
    <Box key={`card-${key}`} flexDirection="column">
      <Svg source={c.source} alt={c.alt} width={c.width} height={c.height} />
      <Box justifyContent="flex-end">
        <Button key={`copy-${key}`} plain dimColor label="Copy" onPress={() => copy($, e, copyText)} />
      </Box>
    </Box>
  )
}

// The terminal's card: a rounded outline, a header line (what it is, a note), the body.
function boxCard($: EngineInterface, e: CardInput, p: Palette, label: string, note: [string, string], body: unknown, key: string) {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box key={`card-${key}`} flexDirection="column" borderStyle="round" borderColor={p.muted} paddingX={1}>
      <Box justifyContent="space-between" columnGap={2}>
        <Text color={p.muted} wrap="truncate-end">
          {label}
        </Text>
        <Text color={note[1]}>{note[0]}</Text>
      </Box>
      {body as never}
    </Box>
  )
}

function codeCard($: EngineInterface, e: RenderInput<'AssistantMessage'>, p: Palette, lang: string, code: string, key: string) {
  const lines = code.split('\n').length
  const { Code } = $.ui.resolve(e)
  const engineCode = <Code source={code} {...(lang ? { language: lang } : {})} />
  if (e.surface !== 'terminal' && lines <= MAX_CARD_LINES) return svgCardTree($, e, codeSvg(lang, code, p, cardWidth(e.viewport?.columns)), code, key)
  return boxCard($, e, p, lang || 'code', [`${lines} line${lines === 1 ? '' : 's'}`, p.muted], engineCode, key)
}

function tableCard($: EngineInterface, e: RenderInput<'AssistantMessage'>, p: Palette, t: ReturnType<typeof tableOf> & object, key: string) {
  const text = [t.header, ...t.rows].map(r => r.join(' | ')).join('\n')
  if (e.surface !== 'terminal') return svgCardTree($, e, tableSvg(t, p, cardWidth(e.viewport?.columns)), text, key)
  const { Box, Text } = $.ui.resolve(e)
  const room = Math.max(20, (e.viewport?.columns ?? 100) - 8)
  const natural = t.header.map((h, c) => Math.max([...h].length, ...t.rows.map(r => [...(r[c] ?? '')].length)))
  const scale = Math.min(1, (room - 2 * (natural.length - 1)) / Math.max(1, natural.reduce((a, b) => a + b, 0)))
  const widths = natural.map(w => Math.max(3, Math.floor(w * scale)))
  const cell = (v: string, w: number) => ([...v].length > w ? `${[...v].slice(0, w - 1).join('')}…` : v.padEnd(w))
  const line = (r: string[]) => r.map((v, c) => cell(v, widths[c] ?? 3)).join('  ')
  const body = (
    <Box flexDirection="column">
      {t.rows.map((r, i) => (
        <Text key={`row-${i}`} color={p.text}>
          {line(r)}
        </Text>
      ))}
    </Box>
  )
  return boxCard($, e, p, line(t.header), [`${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`, p.muted], body, key)
}

// A reply's blocks in the skin's colors; code and tables as cards.
function replyBlocks($: EngineInterface, e: RenderInput<'AssistantMessage'>, p: Palette, blocks: readonly Block[]) {
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
        return codeCard($, e, p, b.lang, b.code, k)
      case 'rule':
        return <Text color={p.muted}>{'─'.repeat(24)}</Text>
      case 'markdown': {
        const table = tableOf(b.text)
        return table ? tableCard($, e, p, table, k) : <Markdown text={b.text} />
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

// A path under the working directory, without it.
const shortPath = (path: string, cwd: string): string => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)

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

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const a = await active($)
    if (!a || !TYPED.has(e.props.origin.kind) || e.props.text.length > MAX_PROMPT || (await read($, memberOf(hasImages, e)))) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={a.p.accent}>{e.props.text}</Text>
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
    const labelColor = e.props.isRunning || e.props.isInterrupted ? p.muted : e.props.isErrored ? p.red : color
    const target = targetOf(e.props.tool, e.props.input, await $.session.cwd())
    // The desktop app draws its own tool rows, so this tree shows on the terminal.
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

  // A Bash call's command, kept for its result's terminal card (the result carries no input).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    await update($, memberOf(commandOf, { requestId: e.tool_use_id }), () => e.command)
    return next(e)
  }).catch(($, e, next) => next(e))

  // An edit's result as a diff card; a shell command's as a terminal card.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const a = await active($)
    if (!a) return next(e)
    const { p } = a
    const key = e.props.tool_use_id
    const diff = EDITS.has(e.props.tool) && !e.props.isErrored ? diffOf(e.props.output) : null
    if (diff) {
      const path = shortPath(diff.path, await $.session.cwd())
      const stats: [string, string] = [diff.isNew ? `new file · ${diff.added} lines` : `+${diff.added} −${diff.removed}`, diff.removed > diff.added ? p.red : p.green]
      if (e.surface !== 'terminal') return svgCardTree($, e, diffSvg(diff, path, p, cardWidth(e.viewport?.columns)), unified(diff), key) ?? next(e)
      const { Code } = $.ui.resolve(e)
      return boxCard($, e, p, path, stats, <Code source={unified(diff)} format="diff" path={diff.path} />, key)
    }
    const shell = e.props.tool === 'Bash' ? shellOf(e.props.output, await read($, memberOf(commandOf, e)), e.props.isErrored) : null
    if (!shell) return next(e)
    if (e.surface !== 'terminal') return svgCardTree($, e, terminalSvg(shell, p, cardWidth(e.viewport?.columns)), [shell.stdout, shell.stderr].filter(Boolean).join('\n'), key) ?? next(e)
    const { Box, Text } = $.ui.resolve(e)
    const lines = outputLines(shell)
    const body = (
      <Box flexDirection="column">
        {lines.length === 0 ? <Text color={p.muted}>no output</Text> : null}
        {lines.map((l, i) =>
          'fold' in l ? (
            <Text key={`out-${i}`} color={p.muted}>
              … {l.fold} more lines
            </Text>
          ) : (
            <Text key={`out-${i}`} color={l.isErr ? p.red : p.text} wrap="truncate-end">
              {l.text || ' '}
            </Text>
          ),
        )}
      </Box>
    )
    return boxCard($, e, p, shell.command ? `$ ${shell.command}` : 'shell', [shell.status, statusColor(p, shell.status)], body, key)
  })

  // A reply in the skin's colors, block by block. A summary row keeps Claude Code's.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const a = await active($)
    if (!a || e.props.isSummary || e.props.text.length > MAX_REPLY) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {replyBlocks($, e, a.p, parseBlocks(e.props.text))}
      </Box>
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
        <Text color={a.p.muted}>
          {pick(a.skin.done, e.props.word)} for {duration(e.props.durationMs)}
        </Text>
      </Text>
    )
  })
}
