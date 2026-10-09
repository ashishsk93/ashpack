declare module 'claude-code' {
  interface PluginState {
    'ashpack-skins': {
      skin: string // the picked skin's id
      isOn: boolean // skins draw; off, Claude Code's own drawing
      isLight: boolean // Claude Code's theme is a light one
      images: boolean // per prompt row: the prompt carried images
    }
  }
}
