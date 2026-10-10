// One tool call of the turn, for the working popup's cards and the Activity page: what kind,
// on what (cut to TARGET_CHARS), how it went.
export type CallKind = 'read' | 'edit' | 'command' | 'search' | 'web' | 'agent' | 'skill' | 'tool'
export type Call = { id: string; kind: CallKind; target: string; state: 'running' | 'ok' | 'failed'; ms?: number; added?: number; removed?: number }

// A call running now, main's or a subagent's, and its line for the popup (`Reading a.ts`).
export type Step = { id: string; label: string }

// What the turn is doing: its number and prompt, the calls running now (the latest heads the
// popup), its calls so far, and what the session had cost when it began.
export type Activity = { n: number; prompt: string; startedAt: number; steps: Step[]; calls: Call[]; costAtStart?: number }

// A finished turn, kept for the Activity page: what was asked, its calls, how it ended.
export type Turn = {
  n: number
  prompt: string
  startedAt: number
  ms: number
  calls: Call[]
  outcome: 'answer' | 'aborted' | 'refusal' | 'error'
  costUsd?: number
  tokensIn?: number
  tokensOut?: number
}

// The session's finished turns added up: kept whole, while the history keeps the latest turns.
// `since`: when the first of them began.
export type Totals = { turns: number; workMs: number; calls: number; failed: number; added: number; removed: number; files: string[]; since?: number }

// The Activity page's record, one value so a finished turn joins both in one write.
export type History = { turns: Turn[]; totals: Totals } // turns: the latest, oldest first

// One item of the model's task list (TodoWrite, or TaskCreate/TaskUpdate).
export type Section = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }

// `dirty` counts every changed path; the rest split it: staged, changed in the tree, new, in conflict.
// `stashes` when git printed them (2.35 on, and only while there are some).
export type GitInfo = { branch: string; dirty: number; ahead: number; behind: number; staged: number; changed: number; untracked: number; conflicts: number; stashes?: number }

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
      history: History
      shownTurn: number | null // the Activity page's turn, by number; null follows the latest
      callFilter: CallKind | 'all' // the Activity page's calls: one kind, or all
      callLimit: number // the Activity page's calls listed, the latest; Show more adds to it
      frame: number // the terminal popup's wave, 8 a second
      second: number // the terminal Activity page's running time, once a second
      status: StatusData | null
      plan: Section[]
    }
  }
}
