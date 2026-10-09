<p align="center"><img src="docs/title.svg" alt="AshPack" width="300"></p>

<p align="center">One drawer and one strip, shared by all your Claude Code mods.<br/>So they stop fighting over the footer and the band above the prompt.</p>

<p align="center">
  <a href="https://github.com/ashishsk93/ashpack/releases"><img alt="release" src="https://img.shields.io/github/v/release/ashishsk93/ashpack?label=release&color=8b5cf6"></a>
  <img alt="Claude Code mods" src="https://img.shields.io/badge/Claude_Code-mods-1a9450">
  <img alt="terminal and desktop app" src="https://img.shields.io/badge/surfaces-terminal_%C2%B7_desktop_app-2f7bf0">
</p>

<p align="center"><img src="docs/hero.svg" alt="AshPack: the status strip, the working popup, and the drawer with a tab per mod" width="880"></p>

## Why

Every Claude Code mod wants the same two places: the footer and the row above the prompt. Three mods, three rows. AshPack is a host for those places:

- **The drawer**: a side panel with a tab per mod. Each mod's settings and controls live on its own page.
- **The strip**: one row above the prompt. Each mod puts a short chip there instead of a row of its own.

A mod joins with a single keyed Box; see [ADOPTING.md](ADOPTING.md). No import, no dependency: the host reads the trees the other mods draw. The host draws nothing else.

## The mods

| Mod | What it does | Command |
| --- | --- | --- |
| **ashpack** | The host: the drawer, the footer button `◆ AshPack ▸`, the strip | `/ashpack [page]` |
| **ashpack-status** | Status chips (model, branch, context, usage) and compact mode with a working popup | `/ashstatus [compact\|chips]` |
| **ashpack-skins** | Twelve skins for prompts, replies, tool rows, cards and the spinner, dark or light | `/skin [name\|on\|off\|dark\|light]` |

Each works alone; together they share the drawer and the strip. [Baton](https://github.com/ashishsk93/baton-mods) adopts the drawer too.

## Install

In a Claude Code session:

```
/plugin install ashpack --marketplace ashishsk93/ashpack
/plugin install ashpack-status --marketplace ashishsk93/ashpack
/plugin install ashpack-skins --marketplace ashishsk93/ashpack
```

Answer `y` to add the marketplace, pick a scope, then `/reload-plugins`. Install `ashpack` first: the host must be the first entry in `enabledPlugins` to see the other mods' pages and chips. If it is not, the drawer's Home page says so and offers `↑ move AshPack first`.

Update with `claude plugin marketplace update ashpack`, then `claude plugin update <mod>@ashpack`.

## ashpack

- **Drawer**: click `◆ AshPack ▸` in the footer, or run `/ashpack`. The panel docks beside the transcript in the desktop app and in a fullscreen terminal, and sits above the prompt on the terminal's main screen. Tabs: **Home**, then one per mod. `/ashpack skins` opens a page; `/ashpack close` and Esc close it. On the terminal, `n` and `p` step through the tabs. The page shown and the open state are kept across sessions.
- **Strip**: one row above the prompt with every mod's chips, wrapped when the row is short. Nothing is drawn when no mod has a chip.
- **Home**: the mods with a page, the plugin order when it is wrong, and how to adopt.
- **Colors**: the `◆` and the tab bar take the active skin's accent.

## ashpack-status

**Status chips**, one row:

```
◆ Opus 5.5 1M · ◕ high   ⎇ main ●1 ↑1   ctx ▰▰▱▱▱▱ 42%   session ▰▱▱▱▱▱ 23% ↻2h14m   week ▰▰▱▱▱▱ 41% ↻3d4h   app · $1.24 · 23m
```

`●` changed files, `↑`/`↓` ahead/behind, `↻` time to reset. Bars are green below 60%, amber below 85%, red from 85%. They refresh on a timer, on each prompt and turn, and when the model changes. In a fullscreen terminal the chips sit under the prompt; elsewhere they are in the strip. The desktop app draws the bars as images, so the segments line up, and leaves out the model chip, since its own footer names the model.

**Compact mode** hides tool calls, tool groups and progress pills; replies and the spinner stay. While Claude works, a popup above the prompt, half the width, shows a row per section of the work: Claude's task list when it keeps one, else the last three finished steps and the running one, with a wave loader beside it. In the desktop app the popup takes the chips' place while Claude works, so the two never stack. Press ctrl+o to see everything.

**Settings**: the **Status** page of the drawer has the two switches. `/ashstatus` opens it (a pane of its own without the host); `/ashstatus compact` and `/ashstatus chips` flip one.

## ashpack-skins

Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Rosé Pine, Solarized, One, Everforest, GitHub, Kanagawa and Monokai, each dark and light. A skin recolors your prompts, Claude's replies, the spinner and the turn footer, and lends its accent to the other AshPack mods. Text colors only: no painted backgrounds.

| | Desktop app | Terminal |
| --- | --- | --- |
| Tool calls | A row with a line icon for its kind (a spinning ring while it runs), the target, lines changed, time taken | A plain row |
| Runs of calls | One row, `Run 2 · Read 3` | Claude Code's own |
| Edits | A diff card: `+N −M`, changed lines in green and red | Claude Code's own |
| Shell commands | A terminal card: status, output, stderr apart, long output folded, Copy | Claude Code's own |
| Tables in replies | A card whose rows rise in once, with Copy | An outlined grid |
| Code in replies | A card with line numbers and colouring, with Copy | Claude Code's highlighting, with Copy |
| Spinner | A wave in the skin's accent beside the step | The skin's word, then a wave |

Cards animate only when new; a redraw shows them still. With compact mode on, tool rows are not drawn. The stored conversation and what the model reads do not change.

The picker is the **Skins** page of the drawer: `/skin`, or open the drawer and click **Skins**. Click a card or press its key. Above the cards: **Skins on / off** (`0`) and **Dark / Light** (`m`), which also sets Claude Code's theme to match. `/skin <name>`, `/skin on|off`, `/skin dark|light` work without the picker. Choices are kept across sessions, and the skin follows `/theme`.

## Give your mod a page and a chip

```tsx
on('ui.render', { component: 'Pane', requestId: 'ashpack' }, async ($, e, next) => {
  const below = await next(e) // keep the pages of the mods after yours
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

A chip is the same idea in the band above the prompt: a Box keyed `ashpack-chip:hello`. Both work without the host too: the chip becomes a row of its own, and the page can go in a pane of yours. [ADOPTING.md](ADOPTING.md) has the whole protocol, the fallback, and the plugin-order rule. `scripts/new-mod.sh <name> "description" --page` scaffolds a mod that already does all of it.

## Develop

```bash
scripts/new-mod.sh <name> "one-line description" [--page]   # scaffold a mod and list it in the marketplace
scripts/check.sh [name]                                     # validate, test and type-check every mod, or one
```

From a clone: `claude plugin marketplace add /path/to/ashpack`, then `claude plugin install ashpack@ashpack`. Edits apply after `/reload-plugins`.

Mods run in a sandbox with no DOM and no Node. Code that uses `$` must be in the same file as the hook that uses it; pure helpers can live in other files. The type check uses the API types that Claude Code writes; if `check.sh` finds none, set `CLAUDE_CODE_TYPES` to the path of `claude-code.d.ts`.
