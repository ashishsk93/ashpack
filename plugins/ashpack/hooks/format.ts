// Pure helpers for the AshPack host, kept apart from the hooks so the tests can call them.

export const HOST = 'ashpack@ashpack' // the host's entry in enabledPlugins
export const ACCENT = '#8b5cf6' // the host's own accent; a skin's accent replaces it

// ── the drawer's pages ──
// A mod gives itself a page by hooking the drawer's pane and adding a Box keyed
// `ashpack-page:<Label>` to the tree `next(e)` hands it (see ADOPTING.md).

export const PAGE_PREFIX = 'ashpack-page:'
export const BUILT_IN_PAGES = ['home'] as const

export type Page = { id: string; label: string; tree: unknown }

type Node = { props?: { key?: unknown }; children?: unknown[] }

const keyOf = (node: unknown): string | undefined => {
  const key = (node as Node | null)?.props?.key
  return typeof key === 'string' ? key : undefined
}

const childrenOf = (node: unknown): unknown[] => {
  const children = (node as Node | null)?.children
  return Array.isArray(children) ? children : []
}

const pagesIn = (node: unknown): Page[] => {
  if (typeof node !== 'object' || node === null) return []
  const key = keyOf(node)
  if (key?.startsWith(PAGE_PREFIX)) {
    const label = key.slice(PAGE_PREFIX.length).trim()
    return label ? [{ id: label.toLowerCase(), label, tree: node }] : []
  }
  return childrenOf(node).flatMap(pagesIn)
}

// The pages in a drawn tree, in order; one per id, the drawer's own ids left to it.
export const findPages = (tree: unknown): Page[] =>
  pagesIn(tree).filter((p, i, all) => all.findIndex(q => q.id === p.id) === i && !(BUILT_IN_PAGES as readonly string[]).includes(p.id))

// ── the strip's chips ──
// A mod puts a Box keyed `ashpack-chip:<label>` in its band tree (AbovePrompt); the
// host lifts it into the one strip above the prompt, so mods do not each take a row.

export const CHIP_PREFIX = 'ashpack-chip:'

export type Chip = { label: string; tree: unknown }

const chipsIn = (node: unknown): Chip[] => {
  if (typeof node !== 'object' || node === null) return []
  const key = keyOf(node)
  if (key?.startsWith(CHIP_PREFIX)) return [{ label: key.slice(CHIP_PREFIX.length).trim(), tree: node }]
  return childrenOf(node).flatMap(chipsIn)
}

export const findChips = (tree: unknown): Chip[] => chipsIn(tree)

// The same tree with the chips taken out, so they are drawn once, in the strip.
export const withoutChips = (node: unknown): unknown => {
  if (typeof node !== 'object' || node === null) return node
  if (keyOf(node)?.startsWith(CHIP_PREFIX)) return null
  const children = (node as Node).children
  if (!Array.isArray(children)) return node
  return { ...(node as object), children: children.map(withoutChips).filter(c => c !== null) }
}

// ── plugin order ──
// The host sees the pages and chips of the mods beneath it only: it must be first in
// enabledPlugins. `misplaced` says whether it is not; `withHostFirst` is the settings
// file with the host moved to the front, the rest as it was.

export const misplaced = (enabledPlugins: unknown): boolean => {
  const keys = Object.keys((enabledPlugins ?? {}) as Record<string, unknown>)
  return keys.includes(HOST) && keys[0] !== HOST
}

export const withHostFirst = (settingsJson: string): string => {
  const settings = JSON.parse(settingsJson) as Record<string, unknown>
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>
  if (!(HOST in enabled)) return settingsJson
  const rest = Object.fromEntries(Object.entries(enabled).filter(([k]) => k !== HOST))
  return `${JSON.stringify({ ...settings, enabledPlugins: { [HOST]: enabled[HOST], ...rest } }, null, 2)}\n`
}

// The tab after or before `shown`, wrapping round.
export const stepTab = (ids: readonly string[], shown: string, by: 1 | -1): string => {
  const at = Math.max(0, ids.indexOf(shown))
  return ids[(at + by + ids.length) % ids.length] ?? shown
}
