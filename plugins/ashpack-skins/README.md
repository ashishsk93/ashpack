# ashpack-skins

Twelve skins for Claude Code: Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Rosé Pine, Solarized, One, Everforest, GitHub, Kanagawa and Monokai, each dark and light. A page of the [AshPack](../ashpack) drawer.

<p align="center"><img src="../../docs/ashpack-skins.svg" alt="The same turn in Catppuccin, Dracula, Nord, Gruvbox and GitHub light, then code and table cards" width="880"></p>

## What a skin changes

Text colors only, no painted backgrounds. A skin recolors your prompts, Claude's replies (headings, lists, inline code, links), the spinner and the turn footer, and lends its accent to the other AshPack mods (the drawer's `◆`, the status chips' model, the working popup's loader).

| | Desktop app | Terminal |
| --- | --- | --- |
| Tool calls | A row with a line icon for its kind (a spinning ring while it runs), the target, lines changed, time taken | A plain row |
| Runs of calls | One row, `Run 2 · Read 3` | Claude Code's own |
| Edits | A diff card: `+N −M`, changed lines in green and red | Claude Code's own |
| Shell commands | A terminal card: status, output, stderr apart, long output folded, Copy | Claude Code's own |
| Tables in replies | A card, with Copy | An outlined grid |
| Code in replies | A card with line numbers and colouring, with Copy | Claude Code's highlighting, with Copy |
| Spinner | A wave in the skin's accent beside the step | The skin's word, then a wave |
| Your prompts | A rounded outline sized to what you typed | The same |

Cards are still: the desktop app keeps a message's first drawing and re-mounts it on every layout change, so an entry animation would replay each time. With ashpack-status' compact mode on, tool rows are not drawn. The stored conversation and what the model reads do not change.

## Picking a skin

The picker is the **Skins** page of the drawer: `/skin`, or open the drawer and click **Skins**. Without the host, `/skin` opens it in a pane of its own. Click a card (in the desktop app, the skin's name above it) or press its key.

Two switches sit above the cards:

- **Skins on / Skins off** (`0`) turns skins off and back on and keeps your pick.
- **Dark / Light** (`m`) picks the skin's dark or light palette and sets Claude Code's theme to match (`dark-ansi` becomes `light-ansi`). The desktop app keeps its own appearance, so pick the mode that matches it.

Without the picker: `/skin <name>`, `/skin on`, `/skin off`, `/skin dark`, `/skin light`. Your choices are kept across sessions, and the skin follows `/theme`.

## Install

```
/plugin install ashpack-skins --marketplace ashishsk93/ashpack
```

Works alone; with [ashpack](../ashpack) installed first, the picker is a page of the drawer.
