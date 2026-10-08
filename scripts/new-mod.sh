#!/usr/bin/env bash
# Scaffold a mod in plugins/<name> and list it in the marketplace.
# Usage: scripts/new-mod.sh <name> ["one-line description"]
set -euo pipefail

name="${1:-}"
desc="${2:-A Claude Code mod.}"
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
