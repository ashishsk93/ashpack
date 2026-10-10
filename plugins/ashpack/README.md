# ashpack

The host. One drawer and one strip, shared by every mod that adopts them, so mods stop fighting for the footer and the band above the prompt.

<p align="center"><img src="../../docs/ashpack.svg" alt="The drawer with a tab per mod, and the strip above the prompt" width="880"></p>

## Drawer

Click `◆ AshPack ▸` in the footer, or run `/ashpack`. The panel docks beside the transcript in the desktop app and in a fullscreen terminal, and sits above the prompt on the terminal's main screen.

- Tabs: **Home**, then one per mod page (**Status** and **Activity**, **Skins**, **Baton**, yours).
- `/ashpack <page>` opens a page (`/ashpack skins`). `/ashpack close` and Esc close the drawer.
- On the terminal, `n` and `p` step through the tabs.
- The page shown and whether the drawer was open are kept across sessions.
- **Home** lists the pages, says when the plugin order is wrong, and shows how to adopt.

## Strip

One row above the prompt. Each mod puts a chip there (`ctx ▰▰▱▱ 42%`, `baton · 2 waiting`) instead of a row of its own. The row wraps when it is short, and nothing is drawn when no mod has a chip.

## Plugin order

Claude Code runs the plugins of the user tier in the order of `enabledPlugins` in `~/.claude/settings.json` (under `CLAUDE_CONFIG_DIR` when it is set), first entry outermost. The host sees the pages and chips of the mods beneath it only, so `"ashpack@ashpack"` must be the first entry. When it is not, Home offers `↑ move AshPack first`, which rewrites the order and hands the prompt `/reload-plugins`.

## Colors

The `◆` and the tab bar take the active skin's accent when [ashpack-skins](../ashpack-skins) is on.

## For your mod

A page is one Box keyed `ashpack-page:<Label>` in the drawer's pane; a chip is one Box keyed `ashpack-chip:<label>` in the band above the prompt. See [ADOPTING.md](../../ADOPTING.md). `scripts/new-mod.sh <name> "description" --page` scaffolds a mod that already has both and a pane of its own for sessions without the host.

## Install

```
/plugin install ashpack --marketplace ashishsk93/ashpack
```
