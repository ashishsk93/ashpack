// The active skin's colours for the other AshPack mods (status chips, the working popup),
// by role: ok, warn and hot for levels, then accent, blue and muted.
export type SharedPalette = { ok: string; warn: string; hot: string; accent: string; blue: string; muted: string }

declare module 'claude-code' {
  interface PluginState {
    'ashpack-skins': {
      skin: string // the picked skin's id
      isOn: boolean // skins draw; off, Claude Code's own drawing
      isLight: boolean // Claude Code's theme is a light one
      images: boolean // per prompt row: the prompt carried images
      duration: number // per tool call (by tool_use_id): how long it ran, -1 until it ends
      command: string // per Bash call (by tool_use_id): its command, for the terminal card
      accent: string // the active skin's accent, '' while skins are off; AshPack's loader reads it
      palette: SharedPalette | null // the same, while skins are on; null while they are off
      charts: boolean // ```mermaid fences draw as charts, and Claude is told they do
    }
  }
}
