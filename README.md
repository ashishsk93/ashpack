# AshPack

Personal Claude Code mods. This repo is a plugin marketplace; each mod lives in `plugins/<name>`.

## ashpack

- **Status grid**: 2 rows × 3 sections, under the prompt, above the engine's hint line ("auto mode on"):

  ```
  ◆ Opus 5.5 1M ◕ high   │ ⎇ main ●1 ↑1             │ ashpack · $1.24 · 23m
  ctx ▰▰▰▱▱▱ 42%         │ session ▰▰▱▱▱▱ 23% ↻2h14m │ week ▰▰▱▱▱▱ 41%  fable ▰▱▱▱▱▱ 12% ↻3d4h
  ```

  `●` changed files, `↑`/`↓` ahead/behind, `↻` time to reset. Bars are green below 60%, yellow below 85% and red from 85%. Outside fullscreen the line under the prompt holds one row only, so the grid sits directly above the prompt there.
- **Compact mode**: hides tool calls, tool groups, progress pills and the spinner. Replies stay. While Claude works, a full-width popup above the prompt shows the current step, the elapsed time and the sections of the work. The sections are Claude's task list when it keeps one. Otherwise they are the last three finished steps (for example `✓ Reading format.ts`) and the running step. Finished sections are filled, and the current one has a bar that sweeps from right to left. Press ctrl+o to see everything.
- **Drawer**: the footer shows only `◆ AshPack ▸`. Click it: a small card floats above it with one tab for each mod that draws in the footer (AshPack first, then for example baton). Each tab shows that mod's own badges and buttons, and the AshPack tab holds the toggles (compact mode, status rows). The Mods tab lists the mods of this pack: `●` on, `○` off, `+` not installed. Click one to turn it on or off, or to install it. Click `↻ update` to update the pack. After a change, AshPack puts `/reload-plugins` in the prompt box; press Enter to apply it. Use `‹` `›` or click a tab name to switch tabs. Click `◂` or `✕` to close. Outside fullscreen, the other mods' badges slide out in the footer and a small pane holds the toggles (Esc closes). Also `/ashpack`, `/ashpack compact`, `/ashpack status`.

### Plugin order

Claude Code runs the plugins of the user tier in the order of `enabledPlugins` in `~/.claude/settings.json`. The first entry runs first (outermost). The drawer can hold other mods only if `"ashpack@ashpack"` is the first entry. AshPack shows a toast at session start when it is not.

## ashpack-skins

Twelve skins: Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Rosé Pine, Solarized, One, Everforest, GitHub, Kanagawa and Monokai. A skin redraws your prompts, the tool rows, the spinner's words and the turn footer in its colors. It uses only Box and Text, so the terminal and the desktop app's Code tab draw the same. The stored conversation, and what the model reads, do not change.

To open the picker in the side panel, run `/skin`, or open the AshPack tray and press **◐ Skins** on its `skins` tab. The panel shows one mock card for each skin. Click a card or press its key to apply it. The **ON/OFF** toggle at the top (key `0`) turns skins off and back on and keeps your pick. `/skin <name>`, `/skin on` and `/skin off` work without the panel. Your choice is kept across sessions.

Each skin has a dark and a light palette. The skin follows your `/theme`: a theme with "light" in its name gets the light palette.

The Skins button lives in the footer. Put `"ashpack-skins@ashpack"` right after `"ashpack@ashpack"` in `enabledPlugins`: a mod that draws its footer badge without passing the footer on (baton does this) hides every mod listed after it.

## Install

In a Claude Code session, install a mod from GitHub:

```
/plugin install ashpack --marketplace ashishsk93/ashpack
/plugin install ashpack-skins --marketplace ashishsk93/ashpack
```

Answer `y` to add the marketplace, then pick a scope. Get later versions with `claude plugin marketplace update ashpack`, then `claude plugin update ashpack@ashpack`.

From a clone (edits apply after `/reload-plugins`):

```
claude plugin marketplace add /path/to/ashpack
claude plugin install ashpack@ashpack
```

## Develop

| Task | Command |
| --- | --- |
| Add a mod | `scripts/new-mod.sh <name> "one-line description"` |
| Check all mods | `scripts/check.sh` |
| Check one mod | `scripts/check.sh <name>` |

`new-mod.sh` makes `plugins/<name>/` (manifest, hooks module, one test) and adds the mod to `.claude-plugin/marketplace.json`. `check.sh` validates the marketplace, then validates, tests and type-checks each mod. The type check uses the API types that Claude Code writes; if the script finds none, set `CLAUDE_CODE_TYPES` to the path of `claude-code.d.ts`.

Mods run in a sandbox with no DOM and no Node. Code that uses `$` must be in the same file as the hook that uses it. Pure helpers can go in other files.
