# Give your mod a place in AshPack

AshPack is a host. It owns two shared spaces so that mods do not each take one of their own:

- **The drawer**: a side panel with a tab per mod. Click `◆ AshPack ▸` in the footer, or run `/ashpack <page>`.
- **The strip**: one row above the prompt with a chip per mod.

A mod joins with keyed Boxes. There is nothing to import: mods run in sandboxes of their own, and the host only reads the trees that the mods beneath it draw.

## A page in the drawer

Hook the drawer's pane (id `ashpack`), keep the tree of the mods beneath you, and add one Box keyed `ashpack-page:<Label>`:

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

The label is the tab. The host draws the page when its tab is open; its Buttons run your own handlers. Always return `below`, or the pages of the mods after yours are lost. `/ashpack hello` opens the drawer on your page.

## A chip in the strip

Hook the band above the prompt and put a Box keyed `ashpack-chip:<label>` in your tree. The host lifts it into the strip and draws the rest of your tree beneath, so the chip is drawn once:

```tsx
on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  const below = await next(e)
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Box key="ashpack-chip:hello">
        <Text dimColor>hello · 2 waiting</Text>
      </Box>
      {below}
    </Box>
  )
})
```

Keep a chip short: a word and a number. The strip wraps when the row is short, and the desktop app draws chips with wide gaps between them.

## Without the host

Both trees are plain trees, so a mod draws the same without AshPack: the chip is a row of its own, and the page can go in a pane of the mod's own. Read `enabledPlugins["ashpack@ashpack"]` with `$.settings.read()` to tell the two apart:

```tsx
const hasHost = (settings.enabledPlugins as Record<string, unknown> | undefined)?.['ashpack@ashpack'] === true
if (hasHost) $.clock.after(0, () => void $.command.run({ command: 'ashpack', args: 'hello' })) // a command hook may not run another command: hand off just after
else await $.ui.open({ id: 'hello', title: 'Hello', focus: true, closeOnEscape: true })
```

A `ui.render` hook on `{ component: 'Pane', requestId: ['ashpack', 'hello'] }` then draws the page in either pane. To leave the footer while the host is on, `return next(e)` from your `SessionMode` hook when `hasHost`.

`scripts/new-mod.sh <name> "description" --page` scaffolds all of this.

## Plugin order

Claude Code runs the plugins of the user tier in the order of `enabledPlugins` in `~/.claude/settings.json`. The first entry runs first, outermost. The host sees the pages and chips of the mods beneath it only, so `"ashpack@ashpack"` must be the first entry. When it is not, the drawer's Home page says so and offers `↑ move AshPack first`, which rewrites the order and puts `/reload-plugins` in the prompt box.

## Colors

The host reads the active skin's accent (`ashpack-skins`' `accent` state) for its `◆` and tab bar. A mod can do the same with `$.state.get({ plugin: 'ashpack-skins', key: 'accent' })`; the value is `''` while skins are off.
