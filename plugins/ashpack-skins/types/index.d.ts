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
      frame: number // the terminal spinner's wave, a step per tick while a turn runs
    }
  }
}
