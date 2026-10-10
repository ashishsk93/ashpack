// One tool call of the turn, for the working popup: what kind, on what, how it went.
export type CallKind = 'read' | 'edit' | 'command' | 'search' | 'web' | 'agent' | 'skill' | 'tool'
export type Call = { id: string; kind: CallKind; target: string; state: 'running' | 'ok' | 'failed'; ms?: number; added?: number; removed?: number }

// What the turn is doing: the running step's line, and its calls so far.
export type Activity = { startedAt: number; label: string; calls: Call[] }

// One item of the model's task list (TodoWrite, or TaskCreate/TaskUpdate).
export type Section = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }

// `dirty` counts every changed path; the rest split it: staged, changed in the tree, new, in conflict.
export type GitInfo = { branch: string; dirty: number; ahead: number; behind: number; staged: number; changed: number; untracked: number; conflicts: number }

// A pull request for the branch, as `gh pr view` reports it, its checks counted.
export type PullRequest = {
  number: number
  state: string // OPEN, MERGED or CLOSED
  isDraft: boolean
  review: string // APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED or ''
  checks: { passed: number; failed: number; pending: number }
}

// What the extra repo chips read; each field fetched only while its chip is on.
export type RepoInfo = {
  operation?: string // a merge, rebase, cherry-pick, revert or bisect under way
  stashes?: number
  lines?: { added: number; removed: number } // the tree against HEAD
  commit?: { at: number; subject: string } | null // HEAD; null before the first commit
  pr?: PullRequest | null // null: no pull request, or no `gh`
}

export type RateWindow = { kind: string; percentUsed: number; resetsAt?: string }

// One status chip, by what it shows; the Status page turns each on or off and orders them.
export type ChipId = 'model' | 'branch' | 'context' | 'session' | 'week' | 'spend' | 'tree' | 'lines' | 'commit' | 'pr'

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
  repo: RepoInfo
}

declare module 'claude-code' {
  interface PluginState {
    'ashpack-status': {
      compact: boolean
      statusOn: boolean
      hiddenChips: ChipId[]
      orderedChips: ChipId[]
      activity: Activity | null
      openCard: CallKind | 'tasks' | null // the popup's card shown open, its calls listed
      frame: number
      status: StatusData | null
      plan: Section[]
    }
  }
}
