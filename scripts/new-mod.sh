#!/usr/bin/env bash
# Scaffold a mod in plugins/<name> and list it in the marketplace.
# Usage: scripts/new-mod.sh <name> ["one-line description"] [--page]
#   --page  the mod gets a page in the AshPack drawer (a pane of its own without the host)
set -euo pipefail

page=0
args=()
for a in "$@"; do
  if [[ "$a" == "--page" ]]; then page=1; else args+=("$a"); fi
done
name="${args[0]:-}"
desc="${args[1]:-A Claude Code mod.}"
label="$(printf "%s" "${name:0:1}" | tr "[:lower:]" "[:upper:]")${name:1}" # the page's tab: Hello-page
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/plugins/$name"

[[ "$name" =~ ^[a-z][a-z0-9-]*$ ]] || { echo "usage: $0 <name> [description]  (name: lowercase, digits, dashes)" >&2; exit 1; }
[[ -e "$dir" ]] && { echo "plugins/$name already exists" >&2; exit 1; }

mkdir -p "$dir/.claude-plugin" "$dir/hooks"

NAME="$name" DESC="$desc" node -e '
const { NAME, DESC } = process.env
process.stdout.write(JSON.stringify({ name: NAME, version: "0.1.0", description: DESC, author: { name: "Ashish S Kumar" } }, null, 2) + "\n")
' > "$dir/.claude-plugin/plugin.json"

echo '{ "modules": ["./register.tsx"] }' > "$dir/hooks/hooks.json"

if [[ $page -eq 1 ]]; then
cat > "$dir/hooks/register.tsx" <<TS
import type { Register } from 'claude-code'

// $name: a page in the AshPack drawer (see ADOPTING.md), or a pane of its own without it.
const DRAWER = 'ashpack' // the AshPack drawer's pane, where this mod is a page
const PANE = '$name' // this mod's own pane, for sessions without the host
const HOST = 'ashpack@ashpack'

export const register: Register = on => {
  on('session.start', async (\$, e, next) => {
    await \$.command.register({ name: '$name', description: 'Open the $name page' })
    return next(e)
  })

  on('command.run', { command: '$name' }, async \$ => {
    const settings = await \$.settings.read()
    const hasHost = (settings.enabledPlugins as Record<string, unknown> | undefined)?.[HOST] === true
    // A command hook may not run another command: hand off just after.
    if (hasHost) \$.clock.after(0, () => void \$.command.run({ command: 'ashpack', args: '$name' }))
    else await \$.ui.open({ id: PANE, title: '$name', focus: true, closeOnEscape: true })
    return {}
  })

  // The page: keyed for the host to find in the drawer; the same tree in the own pane.
  on('ui.render', { component: 'Pane', requestId: [DRAWER, PANE] }, async (\$, e, next) => {
    const below = e.requestId === DRAWER ? await next(e) : null // the pages of the mods after this one
    const { Box, Text } = \$.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Box key="ashpack-page:$label" flexDirection="column">
          <Text>Hello from $name.</Text>
        </Box>
      </Box>
    )
  })

  // A chip in the strip above the prompt: keyed for the host to lift; a row of its own without it.
  on('ui.render', { component: 'AbovePrompt' }, async (\$, e, next) => {
    const below = await next(e)
    const { Box, Text } = \$.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box key="ashpack-chip:$name">
          <Text dimColor>$name</Text>
        </Box>
        {below}
      </Box>
    )
  })
}
TS

cat > "$dir/hooks/$name.test.tsx" <<TS
import { expect, test } from 'claude-code/testing'

test('the page is keyed for the AshPack drawer, and the chip for its strip', async (\$, on) => {
  on('ui.render', { component: 'Pane', requestId: 'ashpack' }, (\$, e) => {
    const { Box } = \$.ui.resolve(e)
    return <Box />
  })
  const pane = await \$.ui.mount({
    plugin: '$name',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'ashpack',
    props: { title: 'AshPack', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 12, contentRows: 12 } } as never,
  })
  expect(JSON.stringify(await pane.drawn())).toContain('"key":"ashpack-page:$label"')
  await pane.unmount()
})
TS
else
cat > "$dir/hooks/register.tsx" <<TS
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async (\$, e, next) => {
    await \$.command.register({ name: '$name', description: 'Say hello from $name' })
    return next(e)
  })

  on('command.run', { command: '$name' }, async () => ({ text: 'Hello from $name.' }))
}
TS

cat > "$dir/hooks/$name.test.ts" <<TS
import { expect, test } from 'claude-code/testing'

test('/$name answers', async \$ => {
  const result = await \$.command.run({ command: '$name', args: '' } as never)
  expect(result.text).toBe('Hello from $name.')
})
TS
fi

# List it in the marketplace.
MARKET="$root/.claude-plugin/marketplace.json" NAME="$name" DESC="$desc" node -e '
const fs = require("fs")
const { MARKET, NAME, DESC } = process.env
const m = JSON.parse(fs.readFileSync(MARKET, "utf8"))
m.plugins = [...(m.plugins ?? []), { name: NAME, source: `./plugins/${NAME}`, description: DESC }]
fs.writeFileSync(MARKET, JSON.stringify(m, null, 2) + "\n")
'

echo "Created plugins/$name and listed it in .claude-plugin/marketplace.json."
echo "Next: scripts/check.sh $name, then: claude plugin install $name@ashpack"
