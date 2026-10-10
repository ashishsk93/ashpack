import type { RenderSurface } from 'claude-code'

import type { AlertType, Block } from './markdown'
import type { Palette } from './skins'

// Pure pieces of a skinned reply's drawing, kept apart from the hooks.

// A Link needs a URL its surface opens: the terminal these schemes, the others https alone.
// Anything else stays text, underlined.
export const isUrl = (href: string, surface: RenderSurface): boolean =>
  href.length <= 2048 && (surface === 'terminal' ? /^(https?|mailto|file):/i : /^https:/i).test(href)

// Shell fences stay the desktop app's own block, which carries its Run button.
export const SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'shell', 'console', 'shellsession', 'powershell', 'ps1', 'pwsh', 'cmd', 'bat'])

export const ALERT_TITLE: Record<AlertType, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' }

export const alertColor = (p: Palette, type: AlertType): string => ({ note: p.blue, tip: p.green, important: p.purple, warning: p.yellow, caution: p.red })[type]

// A code block as markdown again, for the app's own drawing: its fence longer than any
// run of backticks inside it.
export const fenceOf = (lang: string, code: string): string => {
  const ticks = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map(m => m[0].length + 1)))
  return `${ticks}${lang}\n${code}\n${ticks}`
}

// For the first task item of a list, the list's tasks: how many, how many done (nested
// items and plain ones between them still belong to the list). Null for any other block.
export const taskRun = (blocks: readonly Block[], i: number): { done: number; total: number } | null => {
  const isItem = (j: number) => blocks[j]?.kind === 'item'
  const before = blocks.slice(0, i).map((_, j) => j).reverse().find(j => !isItem(j))
  const after = blocks.findIndex((_, j) => j > i && !isItem(j))
  const [start, end] = [before === undefined ? 0 : before + 1, after === -1 ? blocks.length : after]
  const list = blocks.slice(start, end)
  const checks = list.flatMap(b => (b.kind === 'item' && b.check !== undefined ? [b.check] : []))
  const first = list.findIndex(b => b.kind === 'item' && b.check !== undefined)
  return first !== -1 && start + first === i ? { done: checks.filter(Boolean).length, total: checks.length } : null
}
