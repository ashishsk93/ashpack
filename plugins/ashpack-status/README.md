# ashpack-status

Status chips by the prompt, and compact mode with a working popup. A page of the [AshPack](../ashpack) drawer.

<p align="center"><img src="../../docs/ashpack-status.svg" alt="The status chips, compact mode's working popup, and the Status page" width="880"></p>

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

Bars are green below 60%, amber below 85%, red from 85%. The chips refresh on a timer, on each prompt and turn, and when the model changes.

Where they sit: under the prompt in a fullscreen terminal; above it elsewhere, in the AshPack strip (a row of their own without the host). The desktop app draws the bars as images, so the segments line up whatever its font does, and leaves out the model chip, since its own footer names the model. With a skin on, the model chip takes the skin's accent.

## Compact mode

Hides tool calls, tool groups and progress pills. Replies and the spinner stay. While Claude works, a popup above the prompt, half the width, shows one row per section of the work, at most five:

- Claude's task list when it keeps one, with `✓` done, `▸` running, `○` waiting;
- otherwise the last three finished steps (`✓ Reading format.ts`) and the running one.

A wave loader sits beside the running row, in the skin's accent when a skin is on. In the desktop app the popup takes the chips' place while Claude works, so the two never stack. Press ctrl+o to see everything.

## Settings

The **Status** page of the drawer has the two switches. `/ashstatus` opens it, in a pane of its own without the host. `/ashstatus compact` and `/ashstatus chips` flip one.

## Install

```
/plugin install ashpack-status --marketplace ashishsk93/ashpack
```

Works alone; with [ashpack](../ashpack) installed first, its chips join the strip and its switches the drawer.
