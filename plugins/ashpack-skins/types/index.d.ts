declare module 'claude-code' {
  interface PluginState {
    'ashpack-skins': {
      skin: string // the picked skin's id
      isOn: boolean // skins draw; off, Claude Code's own drawing
      isLight: boolean // Claude Code's theme is a light one
      images: boolean // per prompt row: the prompt carried images
      duration: number // per tool call (by tool_use_id): how long it ran, -1 until it ends
    }
  }
}
