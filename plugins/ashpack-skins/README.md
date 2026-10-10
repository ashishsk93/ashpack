# ashpack-skins

Sixteen skins for Claude Code: Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night, Rosé Pine, Solarized, One, Everforest, GitHub, Kanagawa, Monokai, Ayu, Night Owl, Poimandres and Mono, each dark and light. A page of the [AshPack](../ashpack) drawer.

<p align="center"><img src="../../docs/ashpack-skins.svg" alt="The same turn in Catppuccin, Dracula, Nord, Gruvbox and GitHub light, then code and table cards" width="880"></p>

## What a skin changes

Text colors only, no painted backgrounds. A skin recolors your prompts, Claude's replies (headings, lists, inline code, links, code, alerts, task lists, charts), the spinner word and the turn footer. It also lends its colours to the other AshPack mods: the drawer's `◆` takes its accent; the status chips, their bars and the working popup take its whole palette (green, amber and red become the skin's own).

| | Desktop app | Terminal |
| --- | --- | --- |
| Tool calls | A row with a line icon for its kind (a spinning ring while it runs), the target, lines changed, time taken | A plain row |
| Runs of calls | One row, `Run 2 · Read 3` | Claude Code's own |
| Edits | A diff card: `+N −M`, changed lines in green and red | Claude Code's own |
| Shell commands | A terminal card: status, output, stderr apart, long output folded, Copy | Claude Code's own |
| Tables in replies | A card, with Copy | An outlined grid |
| Code in replies | A card with line numbers and colouring, with Copy | Coloured in the skin's palette, with Copy |
| Shell code (` ```bash `) | The app's own block, so its Run button stays | Coloured in the skin's palette, with Copy |
| ` ```diff ` in replies | The diff card, with Copy and **Copy new** (the code after the change) | Added lines green, removed red, the same two copies |
| Alerts (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) | An outline in the alert's colour with its title | The same |
| Task lists (`- [x]`, `- [ ]`) | `✓` done, `○` to do, and `2 of 5 done` over the list | The same |
| Charts in replies | ` ```mermaid ` as a chart card, with Copy: eleven kinds, see [Charts](#charts) | The same charts in cells |
| Spinner | The app's own (a mod cannot restyle its live tool-group row, so a skinned spinner flipped back and forth) | The skin's word |
| Your prompts | A rounded outline sized to what you typed | The same |

Cards are still: the desktop app keeps a message's first drawing and re-mounts it on every layout change, so an entry animation would replay each time. With ashpack-status' compact mode on, tool rows are not drawn. The stored conversation does not change, and the model reads nothing new except the charts note below.

## Charts

A ` ```mermaid ` fence in a reply draws as a chart once the fence closes. Eleven kinds draw:

| Kind | Mermaid | Desktop app | Terminal |
| --- | --- | --- | --- |
| Flowchart | `flowchart` or `graph`, `TD` `LR` `BT` `RL`; shapes, edge labels, dotted and thick edges, `A & B` | Boxes, diamonds and pills in layers, curved arrows; a chart too wide across is turned down the page | Each step, then `├─ yes ─▶` the steps it leads to |
| Sequence | `sequenceDiagram`: participants, actors, messages, notes, `loop` `alt` `opt` `par` `critical` `break` | Lifelines, arrows, notes and framed groups | The same in cells; one line per message when there are too many actors for the width |
| Pie | `pie`, with a title | A donut with a legend of shares and values | A stacked bar and a legend |
| Bar and line | `xychart-beta`: `x-axis`, `y-axis`, `bar`, `line` | Bars and lines on a grid, values on the bars | A bar per category; a line as a sparkline |
| State | `stateDiagram-v2`: transitions with labels, `[*]`, `state "x" as y`, `<<choice>>` | Laid out like a flowchart, `start` and `end` as pills | Each state and where it goes |
| Mind map | `mindmap`, by indentation, with shapes | A tree across the page from its root | Each topic and its branches |
| Class | `classDiagram`: classes with members, `<\|--`, `*--`, `o--`, `-->`, `..>` | Boxes with their members under a rule, arrows for inheritance and use | Each class, its members, what it points to |
| ER | `erDiagram`: entities with fields, `\|\|--o{` and the rest | Boxes with fields, each link labelled `places (one to many)` | Each entity, its fields, its links |
| Timeline | `timeline`, with sections | A line across with a dot per period, its events under it | A period per row, its events after it |
| Gantt | `gantt` with `YYYY-MM-DD` dates, `after`, `3d`/`2w`, `done` `active` `crit` `milestone` | Bars on a calendar, critical ones red, milestones as diamonds | A bar per task across the days |
| Quadrant | `quadrantChart`: axes, four quadrant names, points | A square split four ways, each point placed and named | The same grid in cells, points numbered |

Other Mermaid kinds (journey, gitGraph, sankey and the rest) stay code, and so does any fence a reader cannot read whole: a wrong chart is worse than the source. While a skin is on and charts are on, Claude gets a short note (76 words, after the prompt cache's boundary) that these fences draw here, so it reaches for one when a picture reads better. A headless run (`claude -p`) gets no note. **Charts on / Charts off** on the Skins page, or `/skin charts on` and `/skin charts off`, turns both the drawing and the note on or off.

## Picking a skin

The picker is the **Skins** page of the drawer: `/skin`, or open the drawer and click **Skins**. Without the host, `/skin` opens it in a pane of its own. Click a card (in the desktop app, the skin's name above it) or press its key.

Three switches sit above the cards:

- **Skins on / Skins off** (`0`) turns skins off and back on and keeps your pick.
- **Dark / Light** (`m`) picks the skin's dark or light palette and sets Claude Code's theme to match (`dark-ansi` becomes `light-ansi`). The desktop app keeps its own appearance, so pick the mode that matches it.
- **Charts on / Charts off** draws ` ```mermaid ` fences as charts, or leaves them as code.

Without the picker: `/skin <name>`, `/skin on`, `/skin off`, `/skin dark`, `/skin light`, `/skin charts on`, `/skin charts off`. Your choices are kept across sessions, and the skin follows `/theme`.

## Install

```
/plugin install ashpack-skins --marketplace ashishsk93/ashpack
```

Works alone; with [ashpack](../ashpack) installed first, the picker is a page of the drawer.
