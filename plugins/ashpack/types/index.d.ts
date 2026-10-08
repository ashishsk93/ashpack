// What the turn is doing: the running step's line, and the lines of the steps it finished.
export type Activity = { startedAt: number; label: string; steps: number; trail: string[] }

// One of the pack's mods, as the card's Mods tab lists it.
export type PackMod = { name: string; state: 'on' | 'off' | 'missing' }

// One item of the model's task list (TodoWrite, or TaskCreate/TaskUpdate).
export type Section = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }

export type GitInfo = { branch: string; dirty: number; ahead: number; behind: number }

export type RateWindow = { kind: string; percentUsed: number; resetsAt?: string }

// What the status rows draw; refreshed by events and a timer, read while drawing.
export type StatusData = {
  model: string
  effort?: string
  contextPercent?: number
  rateLimits: RateWindow[]
  git: GitInfo | null
  folder: string
  costUsd?: number
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    ashpack: {
      compact: boolean
      statusOn: boolean
      activity: Activity | null
      frame: number
      status: StatusData | null
      drawerOpen: boolean
      tab: string
      plan: Section[]
      pack: PackMod[]
      packBusy: string | null
    }
  }
}
