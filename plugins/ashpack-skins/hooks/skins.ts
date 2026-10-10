// The skins and the pure helpers the rows are drawn with. Nothing here touches `$`.

export type Palette = {
  bg: string // the background the skin expects; painted only on the picker's cards
  text: string
  muted: string
  accent: string
  blue: string
  green: string
  red: string
  yellow: string
  purple: string
  cyan: string
  pink: string
}

export type Skin = {
  id: string
  label: string
  dark: Palette
  light: Palette
  words: string[] // the spinner's gerunds
  done: string[] // the turn footer's past tense
}

export const SKINS: Skin[] = [
  {
    id: 'catppuccin',
    label: 'Catppuccin',
    dark: { bg: '#1e1e2e', text: '#cdd6f4', muted: '#7f849c', accent: '#fab387', blue: '#89b4fa', green: '#a6e3a1', red: '#f38ba8', yellow: '#f9e2af', purple: '#cba6f7', cyan: '#94e2d5', pink: '#f5c2e7' },
    light: { bg: '#eff1f5', text: '#4c4f69', muted: '#8c8fa1', accent: '#fe640b', blue: '#1e66f5', green: '#40a02b', red: '#d20f39', yellow: '#df8e1d', purple: '#8839ef', cyan: '#179299', pink: '#ea76cb' },
    words: ['Purring', 'Brewing', 'Kneading', 'Steeping', 'Whisking'],
    done: ['Brewed', 'Steeped', 'Whisked'],
  },
  {
    id: 'dracula',
    label: 'Dracula',
    dark: { bg: '#282a36', text: '#f8f8f2', muted: '#6272a4', accent: '#bd93f9', blue: '#8be9fd', green: '#50fa7b', red: '#ff5555', yellow: '#f1fa8c', purple: '#bd93f9', cyan: '#8be9fd', pink: '#ff79c6' },
    light: { bg: '#fffbeb', text: '#1f1f1f', muted: '#6c664b', accent: '#644ac9', blue: '#036a96', green: '#14710a', red: '#cb3a2a', yellow: '#846e15', purple: '#644ac9', cyan: '#036a96', pink: '#a3144d' },
    words: ['Lurking', 'Haunting', 'Conjuring', 'Brooding', 'Summoning'],
    done: ['Conjured', 'Summoned', 'Haunted'],
  },
  {
    id: 'nord',
    label: 'Nord',
    dark: { bg: '#2e3440', text: '#eceff4', muted: '#7b88a1', accent: '#88c0d0', blue: '#81a1c1', green: '#a3be8c', red: '#bf616a', yellow: '#ebcb8b', purple: '#b48ead', cyan: '#8fbcbb', pink: '#b48ead' },
    light: { bg: '#eceff4', text: '#2e3440', muted: '#6b768d', accent: '#3b7584', blue: '#4c6d97', green: '#4f7a3a', red: '#b0424e', yellow: '#94701f', purple: '#8a5f85', cyan: '#3b7584', pink: '#8a5f85' },
    words: ['Drifting', 'Frosting', 'Gliding', 'Thawing', 'Skiing'],
    done: ['Frozen', 'Charted', 'Crossed'],
  },
  {
    id: 'gruvbox',
    label: 'Gruvbox',
    dark: { bg: '#282828', text: '#ebdbb2', muted: '#928374', accent: '#fe8019', blue: '#83a598', green: '#b8bb26', red: '#fb4934', yellow: '#fabd2f', purple: '#d3869b', cyan: '#8ec07c', pink: '#d3869b' },
    light: { bg: '#fbf1c7', text: '#3c3836', muted: '#7c6f64', accent: '#af3a03', blue: '#076678', green: '#79740e', red: '#9d0006', yellow: '#b57614', purple: '#8f3f71', cyan: '#427b58', pink: '#8f3f71' },
    words: ['Roasting', 'Grinding', 'Smoldering', 'Tinkering', 'Forging'],
    done: ['Roasted', 'Forged', 'Tempered'],
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    dark: { bg: '#1a1b26', text: '#c0caf5', muted: '#565f89', accent: '#7aa2f7', blue: '#7aa2f7', green: '#9ece6a', red: '#f7768e', yellow: '#e0af68', purple: '#bb9af7', cyan: '#7dcfff', pink: '#bb9af7' },
    light: { bg: '#e1e2e7', text: '#3760bf', muted: '#6172b0', accent: '#2e7de9', blue: '#2e7de9', green: '#587539', red: '#f52a65', yellow: '#8c6c3e', purple: '#7847bd', cyan: '#007197', pink: '#9854f1' },
    words: ['Neon-ing', 'Cruising', 'Humming', 'Glowing', 'Wandering'],
    done: ['Glowed', 'Cruised', 'Lit'],
  },
  {
    id: 'rose-pine',
    label: 'Rosé Pine',
    dark: { bg: '#191724', text: '#e0def4', muted: '#6e6a86', accent: '#ebbcba', blue: '#9ccfd8', green: '#31748f', red: '#eb6f92', yellow: '#f6c177', purple: '#c4a7e7', cyan: '#9ccfd8', pink: '#ebbcba' },
    light: { bg: '#faf4ed', text: '#575279', muted: '#797593', accent: '#d7827e', blue: '#286983', green: '#56949f', red: '#b4637a', yellow: '#ea9d34', purple: '#907aa9', cyan: '#56949f', pink: '#d7827e' },
    words: ['Blooming', 'Pining', 'Drifting', 'Musing', 'Unfurling'],
    done: ['Bloomed', 'Mused', 'Unfurled'],
  },
  {
    id: 'solarized',
    label: 'Solarized',
    dark: { bg: '#002b36', text: '#93a1a1', muted: '#657b83', accent: '#cb4b16', blue: '#268bd2', green: '#859900', red: '#dc322f', yellow: '#b58900', purple: '#6c71c4', cyan: '#2aa198', pink: '#d33682' },
    light: { bg: '#fdf6e3', text: '#586e75', muted: '#839496', accent: '#cb4b16', blue: '#268bd2', green: '#859900', red: '#dc322f', yellow: '#b58900', purple: '#6c71c4', cyan: '#2aa198', pink: '#d33682' },
    words: ['Basking', 'Orbiting', 'Radiating', 'Calibrating', 'Dawning'],
    done: ['Orbited', 'Radiated', 'Calibrated'],
  },
  {
    id: 'one',
    label: 'One',
    dark: { bg: '#282c34', text: '#abb2bf', muted: '#5c6370', accent: '#61afef', blue: '#61afef', green: '#98c379', red: '#e06c75', yellow: '#e5c07b', purple: '#c678dd', cyan: '#56b6c2', pink: '#c678dd' },
    light: { bg: '#fafafa', text: '#383a42', muted: '#a0a1a7', accent: '#4078f2', blue: '#4078f2', green: '#50a14f', red: '#e45649', yellow: '#c18401', purple: '#a626a4', cyan: '#0184bc', pink: '#a626a4' },
    words: ['Compiling', 'Linting', 'Refactoring', 'Bundling', 'Shipping'],
    done: ['Compiled', 'Shipped', 'Linted'],
  },
  {
    id: 'everforest',
    label: 'Everforest',
    dark: { bg: '#2d353b', text: '#d3c6aa', muted: '#859289', accent: '#a7c080', blue: '#7fbbb3', green: '#a7c080', red: '#e67e80', yellow: '#dbbc7f', purple: '#d699b6', cyan: '#83c092', pink: '#d699b6' },
    light: { bg: '#fdf6e3', text: '#5c6a72', muted: '#939f91', accent: '#8da101', blue: '#3a94c5', green: '#8da101', red: '#f85552', yellow: '#dfa000', purple: '#df69ba', cyan: '#35a77c', pink: '#df69ba' },
    words: ['Foraging', 'Sprouting', 'Rustling', 'Rooting', 'Wandering'],
    done: ['Foraged', 'Sprouted', 'Rooted'],
  },
  {
    id: 'github',
    label: 'GitHub',
    dark: { bg: '#0d1117', text: '#e6edf3', muted: '#8b949e', accent: '#58a6ff', blue: '#58a6ff', green: '#3fb950', red: '#f85149', yellow: '#d29922', purple: '#bc8cff', cyan: '#39c5cf', pink: '#db61a2' },
    light: { bg: '#ffffff', text: '#1f2328', muted: '#6e7781', accent: '#0969da', blue: '#0969da', green: '#1a7f37', red: '#cf222e', yellow: '#9a6700', purple: '#8250df', cyan: '#1b7c83', pink: '#bf3989' },
    words: ['Committing', 'Rebasing', 'Merging', 'Forking', 'Reviewing'],
    done: ['Merged', 'Committed', 'Reviewed'],
  },
  {
    id: 'kanagawa',
    label: 'Kanagawa',
    dark: { bg: '#1f1f28', text: '#dcd7ba', muted: '#727169', accent: '#ffa066', blue: '#7e9cd8', green: '#98bb6c', red: '#ff5d62', yellow: '#e6c384', purple: '#957fb8', cyan: '#7fb4ca', pink: '#d27e99' },
    light: { bg: '#f2ecbc', text: '#545464', muted: '#8a8980', accent: '#cc6d00', blue: '#4d699b', green: '#6f894e', red: '#c84053', yellow: '#77713f', purple: '#624c83', cyan: '#597b75', pink: '#b35b79' },
    words: ['Cresting', 'Inking', 'Rippling', 'Brushing', 'Swelling'],
    done: ['Crested', 'Inked', 'Rippled'],
  },
  {
    id: 'monokai',
    label: 'Monokai',
    dark: { bg: '#272822', text: '#f8f8f2', muted: '#75715e', accent: '#fd971f', blue: '#66d9ef', green: '#a6e22e', red: '#f92672', yellow: '#e6db74', purple: '#ae81ff', cyan: '#66d9ef', pink: '#f92672' },
    light: { bg: '#faf4f2', text: '#29242a', muted: '#a59fa0', accent: '#e16032', blue: '#1c8ca8', green: '#269d69', red: '#e14775', yellow: '#cc7a0a', purple: '#7058be', cyan: '#1c8ca8', pink: '#e14775' },
    words: ['Sizzling', 'Hacking', 'Zapping', 'Buzzing', 'Sparking'],
    done: ['Zapped', 'Hacked', 'Sparked'],
  },
  {
    id: 'ayu',
    label: 'Ayu',
    dark: { bg: '#0b0e14', text: '#bfbdb6', muted: '#6c7380', accent: '#e6b450', blue: '#59c2ff', green: '#aad94c', red: '#f07178', yellow: '#ffb454', purple: '#d2a6ff', cyan: '#95e6cb', pink: '#f29668' },
    light: { bg: '#fcfcfc', text: '#5c6166', muted: '#8a9199', accent: '#e07b00', blue: '#2e8ad6', green: '#6c9100', red: '#e65050', yellow: '#b8860b', purple: '#a37acc', cyan: '#2fa58a', pink: '#e0794d' },
    words: ['Glinting', 'Shimmering', 'Mirroring', 'Gleaming', 'Polishing'],
    done: ['Gleamed', 'Mirrored', 'Polished'],
  },
  {
    id: 'night-owl',
    label: 'Night Owl',
    dark: { bg: '#011627', text: '#d6deeb', muted: '#637777', accent: '#c792ea', blue: '#82aaff', green: '#addb67', red: '#ef5350', yellow: '#ecc48d', purple: '#c792ea', cyan: '#7fdbca', pink: '#f78c6c' },
    light: { bg: '#fbfbfb', text: '#403f53', muted: '#7a8181', accent: '#994cc3', blue: '#4876d6', green: '#08916a', red: '#de3d3b', yellow: '#b5810a', purple: '#994cc3', cyan: '#0c969b', pink: '#bc5454' },
    words: ['Hooting', 'Prowling', 'Gliding', 'Watching', 'Roosting'],
    done: ['Hooted', 'Swooped', 'Roosted'],
  },
  {
    id: 'poimandres',
    label: 'Poimandres',
    dark: { bg: '#1b1e28', text: '#e4f0fb', muted: '#767c9d', accent: '#5de4c7', blue: '#89ddff', green: '#5de4c7', red: '#d0679d', yellow: '#fffac2', purple: '#91b4d5', cyan: '#add7ff', pink: '#fcc5e9' },
    light: { bg: '#f4f5f9', text: '#2f3347', muted: '#767c9d', accent: '#1b8f78', blue: '#2a7fb8', green: '#1b8f78', red: '#c2477d', yellow: '#8f7d10', purple: '#5f6fb0', cyan: '#2a90a8', pink: '#b04f99' },
    words: ['Dreaming', 'Drifting', 'Musing', 'Hovering', 'Pondering'],
    done: ['Dreamt', 'Mused', 'Pondered'],
  },
  {
    // No hues: text in greys, the accent white (or black). Diffs read by their + and −.
    id: 'mono',
    label: 'Mono',
    dark: { bg: '#121212', text: '#e8e8e8', muted: '#8a8a8a', accent: '#ffffff', blue: '#c8c8c8', green: '#d6d6d6', red: '#f0f0f0', yellow: '#bdbdbd', purple: '#cfcfcf', cyan: '#b0b0b0', pink: '#dcdcdc' },
    light: { bg: '#fafafa', text: '#1a1a1a', muted: '#7a7a7a', accent: '#000000', blue: '#3a3a3a', green: '#2a2a2a', red: '#111111', yellow: '#4a4a4a', purple: '#333333', cyan: '#555555', pink: '#444444' },
    words: ['Thinking', 'Working', 'Writing', 'Reading', 'Weighing'],
    done: ['Done', 'Finished', 'Worked'],
  },
]

export const OFF = 'off'

export const skinById = (id: string): Skin | undefined => SKINS.find(s => s.id === id)

export const paletteOf = (skin: Skin, isLight: boolean): Palette => (isLight ? skin.light : skin.dark)

// Claude Code's theme names say light in them: `light`, `light-daltonized`, `custom:x:foo-light`.
// ponytail: `auto` reads as dark; ask the terminal's background if light users hit it
export const isLightTheme = (value: unknown): boolean => typeof value === 'string' && value.includes('light')

// Claude Code's built-in theme for a mode, keeping a daltonized or ANSI variant: dark-ansi -> light-ansi.
export const themeFor = (current: unknown, isLight: boolean): string => {
  const variant = typeof current === 'string' ? (/^(?:dark|light)(-daltonized|-ansi)$/.exec(current)?.[1] ?? '') : ''
  return `${isLight ? 'light' : 'dark'}${variant}`
}

// A word from `list` that stays the same for the same `seed`, so a row never flickers.
export const pick = (list: string[], seed: string): string => {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return list[Math.abs(h) % list.length] ?? seed
}

export type Kind = 'read' | 'write' | 'run' | 'search' | 'web' | 'mcp'

const KINDS: Record<string, Kind> = {
  Read: 'read',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Bash: 'run',
  PowerShell: 'run',
  Grep: 'search',
  Glob: 'search',
  WebFetch: 'web',
  WebSearch: 'web',
}

// Null keeps Claude Code's own row: agents, todos and plan mode draw live progress a skin would have to rebuild.
export const kindOf = (tool: string): Kind | null => (tool.startsWith('mcp__') ? 'mcp' : (KINDS[tool] ?? null))

export const kindColor = (p: Palette, kind: Kind): string =>
  ({ read: p.blue, write: p.yellow, run: p.green, search: p.purple, web: p.cyan, mcp: p.pink })[kind]

// `mcp__github__search_code` reads as `github:search_code`.
export const toolLabel = (tool: string): string => {
  if (!tool.startsWith('mcp__')) return tool
  const [, server = '', ...name] = tool.split('__')
  return `${server}:${name.join('__')}`
}

const MAX_TARGET = 100

// What the call is about, on one line: the file, command, pattern or URL.
export const targetOf = (tool: string, input: unknown, cwd: string): string => {
  const f = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const raw = [f.file_path, f.notebook_path, f.command, f.pattern, f.url, f.query].find(v => typeof v === 'string') as string | undefined
  if (raw === undefined) return ''
  const rel = raw.startsWith(`${cwd}/`) ? raw.slice(cwd.length + 1) : raw
  const line = rel.replace(/\s+/g, ' ').trim()
  return line.length > MAX_TARGET ? `${line.slice(0, MAX_TARGET - 1)}…` : line
}

// As the engine's own footer formats it: `3s`, `1m 4s`.
export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// How many picker cards share a row at this width (24 columns fit the mock), and how wide each is.
const MIN_CARD = 24
export const cardLayout = (columns: number, gap: number): { perRow: number; width: number } => {
  const perRow = Math.max(1, Math.min(3, Math.floor((columns + gap) / (MIN_CARD + gap))))
  return { perRow, width: Math.floor((columns - gap * (perRow - 1)) / perRow) }
}

// A 5-row pixel font, just the letters of the banner. `#` is a lit pixel.
const FONT: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  S: ['###', '#..', '###', '..#', '###'],
  ' ': ['.', '.', '.', '.', '.'],
}

// Two pixel rows share a cell: top, bottom, both or neither.
const HALF: Record<string, string> = { '##': '█', '#.': '▀', '.#': '▄', '..': ' ' }

// `word` as 3 rows of half-block glyphs, one string per letter, so a drawing can color each letter.
export const pixelRows = (word: string): string[][] =>
  [0, 2, 4].map(r =>
    [...word].map(ch => {
      const glyph = FONT[ch] ?? FONT[' ']!
      const top = glyph[r] ?? ''
      const bottom = glyph[r + 1] ?? '.'.repeat(top.length)
      return [...top].map((t, i) => HALF[t + (bottom[i] ?? '.')] ?? ' ').join('')
    }),
  )

// `word` as an SVG of square pixels, each letter in the next of `colors`: the desktop
// spaces its text lines apart, so half-block glyphs do not tile there.
export const pixelSvg = (word: string, colors: readonly string[], px: number): string => {
  const letters = [...word].map(ch => FONT[ch] ?? FONT[' ']!)
  const lefts = letters.map((_, i) => letters.slice(0, i).reduce((x, g) => x + g[0]!.length + 1, 0))
  const rects = letters.flatMap((glyph, i) =>
    glyph.flatMap((row, y) =>
      [...row].flatMap((c, dx) => (c === '#' ? [`<rect x="${lefts[i]! + dx}" y="${y}" width="1" height="1" fill="${colors[i % colors.length]}"/>`] : [])),
    ),
  )
  const w = pixelWidth(word)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 5" width="${w * px}" height="${5 * px}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

// Columns the banner takes: its letters and a 1-column gap between them.
export const pixelWidth = (word: string): number =>
  [...word].reduce((sum, ch) => sum + (FONT[ch] ?? FONT[' ']!)[0]!.length, 0) + Math.max(0, [...word].length - 1)
