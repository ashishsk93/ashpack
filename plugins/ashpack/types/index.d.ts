declare module 'claude-code' {
  interface PluginState {
    ashpack: {
      drawerOpen: boolean
      page: string // the drawer page shown: home, or a mod's page id
      misplaced: boolean // another plugin sits above the host in enabledPlugins
    }
  }
}
