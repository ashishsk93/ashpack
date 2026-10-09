// Types the vendored renderers share (from claude-skins' types/index.d.ts, the state
// contract left out: ashpack-skins keeps its own).

// Every colour a skin names. `fg` is body text, `muted` secondary text, `surface` the
// band behind a table header, `zebra` every other table row.
export type SkinSlot = 'read' | 'write' | 'run' | 'search' | 'web' | 'mcp' | 'other' | 'user' | 'fg' | 'muted' | 'surface' | 'zebra' | 'ok' | 'err' | 'warn'

// The switches the row builders read.
export type Prefs = {
  skin: string
  icons: 'unicode' | 'ascii'
  rail: boolean
  tables: boolean
  shimmer: boolean
  band: boolean
  clipOutput: boolean
}

// What one turn did, shown in its footer.
export type TurnStats = { tools: number; added: number; removed: number }
