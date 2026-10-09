declare module 'claude-code' {
  interface PluginState {
    'ashpack-skins': {
      skin: string // the picked skin's id
      isOn: boolean // skins draw; off, Claude Code's own drawing
      isLight: boolean // Claude Code's theme is a light one
      images: boolean // per prompt row: the prompt carried images
      command: string // per Bash call (by tool_use_id): its command, for the result's terminal card
    }
  }
}
