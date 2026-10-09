# AshPack

Personal Claude Code mods. This repo is a plugin marketplace; each mod lives in `plugins/<name>`.

## ashpack

The host. One drawer and one strip, shared by every mod that adopts them, so mods do not fight for the footer or the band above the prompt.

- **Drawer**: click `◆ AshPack ▸` in the footer, or run `/ashpack`. A side panel opens, docked beside the transcript in the desktop app and in a fullscreen terminal (inline above the prompt on the terminal's main screen), with a tab per mod: **Status**, **Skins**, **Baton**, yours. **Home** lists the pages and says when the plugin order is wrong. `/ashpack <page>` opens a page (`/ashpack skins`); `/ashpack close` and Esc close it. On the terminal, `n` and `p` step through the tabs. The page shown and whether the drawer was open are kept across sessions.
- **Strip**: one row above the prompt. Each mod puts a chip there (`ctx ▰▰▱▱ 42%`, `baton · 2 waiting`) instead of taking a row of its own.
- **Plugin order**: the host must be first in `enabledPlugins` (`~/.claude/settings.json`) to see the other mods' pages and chips. When it is not, Home offers `↑ move AshPack first`.

The host draws nothing else. See [ADOPTING.md](ADOPTING.md) to give your mod a page and a chip; `scripts/new-mod.sh <name> "description" --page` scaffolds one.

## ashpack-status

- **Status chips**: one row:

  ```
  ◆ Opus 5.5 1M · ◕ high   ⎇ main ●1 ↑1   ctx ▰▰▱▱▱▱ 42%   session ▰▱▱▱▱▱ 23% ↻2h14m   week ▰▰▱▱▱▱ 41%  fable ▰▱▱▱▱▱ 12% ↻3d4h   ashpack · $1.24 · 23m
  ```

  `●` changed files, `↑`/`↓` ahead/behind, `↻` time to reset. Each bar is a row of segments: green below 60%, amber below 85% and red from 85%. With a skin on, the model takes the skin's accent. The desktop app names the model and effort in its own footer, so there the row starts at the branch. The chips refresh on a timer, on each prompt and turn, and when the model changes. Where they sit: under the prompt in a fullscreen terminal, and above it elsewhere, in the AshPack strip. The desktop app draws the bars as images, so the segments line up whatever its font does, and the working popup takes the chips' place while Claude works, so the two never stack.
- **Compact mode**: hides tool calls, tool groups, progress pills and the spinner. Replies stay. While Claude works, a popup above the prompt (half the width) shows the elapsed time and one row for each section of the work, at most five. The sections are Claude's task list when it keeps one. Otherwise they are the last three finished steps (for example `✓ Reading format.ts`) and the running step. Finished rows have `✓`, waiting rows `○`, and the running row `▸` with a loader beside it: a wave of bars that rise and fall in turn (`▅▇█▇▄▂▁▂`). With a skin on, the wave takes the skin's accent; otherwise it is blue. The desktop app draws the loader as an animated image and leaves out the elapsed time. Press ctrl+o to see everything.
- **Settings**: the **Status** page of the AshPack drawer has the two switches. `/ashstatus` opens it (a pane of its own without the host); `/ashstatus compact` and `/ashstatus chips` flip one.

## ashpack-skins

Twelve skins: Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Rosé Pine, Solarized, One, Everforest, GitHub, Kanagawa and Monokai. A skin recolors your prompts, Claude's replies (headings, lists, inline code and links), the spinner and the turn footer, and the loaders and `◆` of the other AshPack mods. In the desktop app it also draws tool calls and cards:

| Site | Desktop app | Terminal |
| --- | --- | --- |
| Tool calls | A row with a line icon for its kind (a spinning ring while it runs), the tool, its target, lines changed and time taken | A plain row: the tool and its target |
| Runs of calls | One row, for example `Run 2 · Read 3`, beside an icon | Claude Code's own |
| Edits | A diff card: the file, `+N −M`, the changed lines in green and red | Claude Code's own diff |
| Shell commands | A terminal card: status, output with stderr apart, long output folded, a Copy button | Claude Code's own output |
| Tables in replies | A card whose rows rise in when it first shows, with a Copy button | An outlined grid, the column names in the skin's accent |
| Code in replies | A card with the language, line numbers and colouring, and a Copy button | Claude Code's highlighting, and a Copy button |
| Spinner | A wave in the skin's accent, beside the step the app names | The skin's word, then a wave (`▃▆██`) |
| Your prompts | A rounded outline sized to what you typed | The same |

Cards have no background of their own, and their rows rise in only when a card is new: a redraw (a resize, the side panel opening) shows it still. With ashpack-status' compact mode on, tool calls are not shown. The stored conversation, and what the model reads, do not change.

The picker is the **Skins** page of the AshPack drawer: run `/skin`, or open the drawer and click **Skins**. Without AshPack, `/skin` opens it in a panel of its own. Click a card (in the desktop app, the skin's name above the card) or press its key to apply it. Two switches sit above the cards:

- **Skins on / Skins off** (key `0`) turns skins off and back on and keeps your pick.
- **Dark / Light** (key `m`) picks the skin's dark or light palette and sets Claude Code's theme to match (`dark-ansi` becomes `light-ansi`). The desktop app keeps its own appearance (its Settings), so pick the mode that matches it.

`/skin <name>`, `/skin on`, `/skin off`, `/skin dark` and `/skin light` work without the picker. Your choices are kept across sessions. When you change the theme with `/theme`, the skin follows it.

## Install

In a Claude Code session, install a mod from GitHub:

```
/plugin install ashpack --marketplace ashishsk93/ashpack
/plugin install ashpack-status --marketplace ashishsk93/ashpack
/plugin install ashpack-skins --marketplace ashishsk93/ashpack
```

Answer `y` to add the marketplace, then pick a scope. Get later versions with `claude plugin marketplace update ashpack`, then `claude plugin update ashpack@ashpack` (and the same for each mod). Install `ashpack` first, so it is first in `enabledPlugins`.

From a clone (edits apply after `/reload-plugins`):

```
claude plugin marketplace add /path/to/ashpack
claude plugin install ashpack@ashpack
```

## Develop

| Task | Command |
| --- | --- |
| Add a mod | `scripts/new-mod.sh <name> "one-line description"` (`--page` for a drawer page and a chip) |
| Check all mods | `scripts/check.sh` |
| Check one mod | `scripts/check.sh <name>` |

`new-mod.sh` makes `plugins/<name>/` (manifest, hooks module, one test) and adds the mod to `.claude-plugin/marketplace.json`; with `--page` the module already has a drawer page, a strip chip and a pane of its own for sessions without the host. `check.sh` validates the marketplace, then validates, tests and type-checks each mod. The type check uses the API types that Claude Code writes; if the script finds none, set `CLAUDE_CODE_TYPES` to the path of `claude-code.d.ts`.

Mods run in a sandbox with no DOM and no Node. Code that uses `$` must be in the same file as the hook that uses it. Pure helpers can go in other files.
