# ashpack-status

Status chips by the prompt, compact mode with a working popup, and an Activity page that keeps every turn's tool calls. Pages of the [AshPack](../ashpack) drawer.

<p align="center"><img src="../../docs/ashpack-status.svg" alt="The status chips, compact mode's working popup, the Status page and the Activity page" width="880"></p>

## Status chips

One row:

```
◆ Opus 5.5 1M · ◕ high   ⎇ main ●1 ↑1   ctx ▰▰▱▱▱▱ 42%   session ▰▱▱▱▱▱ 23% ↻2h14m   week ▰▰▱▱▱▱ 41% ↻3d4h   app · $1.24 · 23m
```

| Mark | Meaning |
| --- | --- |
| `◆ Opus 5.5 1M · ◕ high` | model, context window, effort |
| `⎇ main ●1 ↑1 ↓2` | branch, changed files, ahead, behind |
| `ctx` `session` `week` | context used, and the usage windows, with `↻` time to reset |
| `app · $1.24 · 23m` | folder, session cost, session time |

Bars are green below 60%, amber below 85%, red from 85%. The chips refresh on a timer, on each prompt and turn, and when the model changes; a burst of these (a turn's end raises several) runs one refresh at a time, plus one more for what changed meanwhile, and git runs only while a chip that shows the repo is on.

### Repo chips (off until you turn them on)

Four more chips show what is going on in the repo. Turn each on in the Status page.

| Chip | Shows | From |
| --- | --- | --- |
| Working tree | `rebasing · 2 staged · 3 changed · 1 new · 1 conflict · 1 stash`, or `clean` | `git status` (with `git stash list` before git 2.35), the git directory |
| Lines changed | `diff +120 −34`: the tree against `HEAD` (new files not counted) | `git diff --shortstat HEAD` |
| Last commit | `commit 2h ago · fix: login redirect` | `git log -1` |
| Pull request and checks | `PR #12 ✓ 5 checks · approved`; failing checks, running checks, draft, merged, changes asked | `gh pr view`, at most every 2 minutes; `no PR` without `gh` or a PR |

A chip that is off runs no command.

Where they sit: under the prompt in a fullscreen terminal; above it elsewhere, in the AshPack strip (a row of their own without the host). The desktop app draws the bars as images, so the segments line up whatever its font does, and leaves out the model chip, since its own footer names the model. With a skin on, the chips and the working popup draw in the skin's palette: its green, amber and red for the bars and the repo, its accent for the model and the popup's outline.

## Compact mode

Hides tool calls, tool groups and progress pills. Replies and the spinner stay. While Claude works, a popup above the prompt, half the width, shows:

```
╭──────────────────────────────────────────────╮
│ ◆ AshPack Fix the chart labels    2/5 · 1m 4s│
│ ▸ Running npm test…          ▁▂▃▅▇▅▃▂▁▂▃▅    │
│ Read 4  Edit 2  Command 3 ▾  Tasks 2/5       │
│ ✓ $ npm run build                       4.2s │
│ ✗ $ npm test                            2.0s │
│ ▸ $ npm test -- --watch=false                │
╰──────────────────────────────────────────────╯
```

- The step running now, with a wave loader beside it (in the skin's accent when a skin is on); the task in hand, when Claude keeps a task list, heads the popup.
- A card per kind of call this turn, with its count: Read, Edit, Command, Search, Web, Agent, Skill, Tool, and Tasks for the task list.
- Click a card to list its calls under the cards: the files read, the commands run (`✓` passed, `✗` failed, `▸` running) with how long each took, the files edited with `+N −M`, the tasks with `✓` `▸` `○`. Click it again to fold it. On the terminal, ctrl+x tab focuses the popup and a card's letter opens it (`r` `e` `c` `s` `w` `a` `k` `o` `t`).

Above the prompt (the desktop app, and the terminal's main screen) the popup takes the chips' place while Claude works, so the two never stack; a fullscreen terminal keeps the chips under the prompt. When calls run side by side, the line shows the latest one still running.

Compact mode hides the tool rows of the ctrl+o transcript too: a mod sees the same rows there and cannot tell the two views apart. To read every call, turn compact mode off (`/ashstatus compact`), or open the Activity page.

## Activity

The popup closes when the turn ends; the **Activity** page of the drawer keeps it all. Open the drawer, pick Activity and leave it open beside the chat (`/ashstatus activity` opens it).

```
╭───────────────────────────────────────────────╮
│ ● TURN 6 · WORKING                     1m 35s │
│ Running npm test…                             │
│ “build the activity page”                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
╰───────────────────────────────────────────────╯
l: All 9  r: Read 4  e: Edit 2  c: Command 3
✓ READ  src/auth.ts                         0.1s
✓ EDIT  src/auth.ts  +12 −3                 1.2s
✗ RUN   $ npm test                          8.4s

This session
SESSION          WORKING          TURNS
1h 02m           21m 22s          6
TOOL CALLS 3 failed  LINES 9 files  SPEND
31               +892 −60         $3.84
CONTEXT ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ 41%
TIMELINE ▂▅▁▃█▄

▸ #6  build the activity page · working · 9
  #5  ship it · 10m 10s · 8
  #4  fix the clipping in the chart · 2m 10s · 4
```

That is the terminal. The desktop app draws the same page as cards: the turn in view with a coloured edge, a pulsing dot and the wave; its calls with a pill per kind; tiles for the session's numbers; the timeline as bars.

- **The turn in view**: running, what it does now with the prompt under it (the desktop adds the wave; the terminal ticks the time once a second); done, the prompt with its time, calls, time spent in tools, cost and tokens. A bar splits its calls by kind, in a hue per kind.
- **Its calls**: the latest 12, each with how it went, its kind, the file, command, search or page it acted on (its first 200 characters), an edit's `+N −M`, and how long it took. **Show more** lists 12 more. The filters above narrow them to one kind; a filter, or another turn, starts the list at 12 again.
- **This session**: session time (from its first turn), time working, turns, tool calls (and how many failed), lines added and removed across the files edited, spend, and the context's fill.
- **Timeline**: a bar per turn, as tall as the turn was long, split by kind.
- **Turns**: the newest first. Click one to bring it into view; **← Back to now** follows the running turn again.

On the terminal, with the drawer focused, a filter's letter picks it (`l` for All, then the cards' `r` `e` `c` `s` `w` `a` `k` `o`) and `b` is **Back to now**.

The desktop app draws the cards as images, in the skin's colours when a skin is on, else light or dark as the app is. The page keeps the last 30 turns of the session, and the latest 500 calls of each; `/clear`, a resume and a new session start it over.

## Settings

The **Status** page of the drawer has the two switches. Under **Status chips**, a row per chip turns each one on or off, and its `↑` `↓` move it: model and effort, branch, context, session limit, weekly limits, folder, cost and time, then the four repo chips, which start off (the desktop app lists no model row, since it draws no model chip). The chips show in the rows' order, and the pick is kept across sessions. `/ashstatus` opens the page, in a pane of its own without the host, and `/ashstatus activity` the Activity page. `/ashstatus compact` and `/ashstatus chips` flip one.

## Install

```
/plugin install ashpack-status --marketplace ashishsk93/ashpack
```

Works alone; with [ashpack](../ashpack) installed first, its chips join the strip and its switches the drawer.
