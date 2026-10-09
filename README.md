# AshPack

Personal Claude Code mods. This repo is a plugin marketplace; each mod lives in `plugins/<name>`.

## ashpack

- **Status grid**: 2 rows × 3 sections, under the prompt, above the engine's hint line ("auto mode on"):

  ```
  ◆ Opus 5.5 1M ◕ high   │ ⎇ main ●1 ↑1             │ ashpack · $1.24 · 23m
  ctx ▰▰▰▱▱▱ 42%         │ session ▰▰▱▱▱▱ 23% ↻2h14m │ week ▰▰▱▱▱▱ 41%  fable ▰▱▱▱▱▱ 12% ↻3d4h
  ```

  `●` changed files, `↑`/`↓` ahead/behind, `↻` time to reset. Bars are green below 60%, yellow below 85% and red from 85%. Outside fullscreen the line under the prompt holds one row only, so the grid sits directly above the prompt there.
- **Compact mode**: hides tool calls, tool groups, progress pills and the spinner. Replies stay. While Claude works, a popup above the prompt (half the width) shows the elapsed time and one row for each section of the work, at most five. The sections are Claude's task list when it keeps one. Otherwise they are the last three finished steps (for example `✓ Reading format.ts`) and the running step. Finished rows have `✓`, waiting rows `○`, and the running row `▸` with a loader beside it: a block with a fading trail that crosses a dotted track (`···░▒▓██····`). The desktop app draws the loader as an animated image and leaves out the elapsed time. Press ctrl+o to see everything. In the desktop app, compact mode adds only the popup: the app draws tool calls itself, collapsed into lines like `Ran 2 commands`, and a mod cannot hide them. The app's most compact transcript view, **Normal**, is that collapsed one.
- **Drawer**: click `◆ AshPack ▸` in the footer, or run `/ashpack`. A side panel opens, docked beside the transcript in the desktop app and in a fullscreen terminal (inline above the prompt on the terminal's main screen). It has one page per tab:
  - **Home**: the switches for compact mode and status rows.
  - **A page for each mod that supports AshPack**, for example **Skins** and **Baton**. These mods leave the footer, so they do not compete for its space. Mods without a page keep their footer badges.
  - **Mods**: the mods of this pack, `●` on, `○` off, `+` not installed. Click `turn on`, `turn off` or `install`, or `↻ update all`. After a change, AshPack puts `/reload-plugins` in the prompt box; press Enter to apply it.

  `/ashpack <page>` opens the panel on a page (`/ashpack skins`). `/ashpack compact` and `/ashpack status` flip a switch. Esc closes the panel.

### Give your mod a page in the drawer

Any mod can have a page. Hook the drawer's pane (id `ashpack`), keep the tree of the mods beneath you, and add one Box keyed `ashpack-page:<Label>`:

```tsx
on('ui.render', { component: 'Pane', requestId: 'ashpack' }, async ($, e, next) => {
  const below = await next(e) // the pages of the mods after yours
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {below}
      <Box key="ashpack-page:Hello" flexDirection="column">
        <Text>Your page: any tree, Buttons included.</Text>
      </Box>
    </Box>
  )
})
```

AshPack draws the page when its tab is open; its Buttons run your own handlers. Always return `below`, or the pages of the mods after yours are lost. To leave the footer while AshPack is on, read `enabledPlugins["ashpack@ashpack"]` with `$.settings.read()` at session start, and then `return next(e)` from your `SessionMode` hook.

### Plugin order

Claude Code runs the plugins of the user tier in the order of `enabledPlugins` in `~/.claude/settings.json`. The first entry runs first (outermost). The drawer finds the other mods' pages only if `"ashpack@ashpack"` is the first entry. AshPack shows a toast at session start when it is not.

## ashpack-skins

Twelve skins: Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Rosé Pine, Solarized, One, Everforest, GitHub, Kanagawa and Monokai. A skin redraws your prompts, Claude's replies (headings, lists, inline code and links; tables and code blocks keep Claude Code's highlighting), the tool rows, the spinner's words and the turn footer in its colors. The stored conversation, and what the model reads, do not change.

The picker is the **Skins** page of the AshPack drawer: run `/skin`, or open the drawer and click **Skins**. Without AshPack, `/skin` opens it in a panel of its own. Click a card (in the desktop app, the skin's name above the card) or press its key to apply it. Two switches sit above the cards:

- **● ON / ○ OFF** (key `0`) turns skins off and back on and keeps your pick.
- **◐ DARK / ☀ LIGHT** (key `m`) picks the skin's dark or light palette and sets Claude Code's theme to match (`dark-ansi` becomes `light-ansi`). The desktop app keeps its own appearance (its Settings), so there your prompts and Claude's replies paint the skin's background instead. The app draws tool calls itself, so they keep the app's look.

`/skin <name>`, `/skin on`, `/skin off`, `/skin dark` and `/skin light` work without the picker. Your choices are kept across sessions. When you change the theme with `/theme`, the skin follows it.

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
