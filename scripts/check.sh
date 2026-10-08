#!/usr/bin/env bash
# Validate, test and type-check every mod (or the ones named).
# Usage: scripts/check.sh [mod...]
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mods=("$@")
[[ ${#mods[@]} -eq 0 ]] && for d in plugins/*/; do mods+=("$(basename "$d")"); done

# The API types: CLAUDE_CODE_TYPES, else the newest copy Claude Code wrote.
types="${CLAUDE_CODE_TYPES:-}"
if [[ -z "$types" ]]; then
  types="$(ls -t plugins/*/.claude-plugin/types/claude-code/index.d.ts \
    /tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts \
    /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts 2>/dev/null | head -1)"
fi

failed=0
step() { # label, command...
  local label="$1"; shift
  if out="$("$@" 2>&1)"; then echo "  ✔ $label"; else echo "  ✘ $label"; echo "$out" | sed 's/^/    /'; failed=1; fi
}

step "marketplace" claude plugin validate .
for mod in "${mods[@]}"; do
  dir="plugins/$mod"
  [[ -d "$dir" ]] || { echo "✘ no plugins/$mod"; failed=1; continue; }
  echo "$mod"
  step "validate" claude plugin validate "$dir"
  if compgen -G "$dir/hooks/*.test.ts*" >/dev/null; then step "test" claude plugin test "$dir"; fi
  if [[ -n "$types" ]]; then
    tsconfig="$(mktemp -t ashpack-tsconfig).json"
    includes="\"$types\", \"$root/$dir/hooks\""
    [[ -d "$dir/types" ]] && includes="$includes, \"$root/$dir/types\""
    cat > "$tsconfig" <<JSON
{ "compilerOptions": { "target": "es2023", "lib": ["es2023"], "types": [], "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" },
  "include": [$includes] }
JSON
    step "types" npx -y -p typescript@5.6.3 tsc -p "$tsconfig"
    rm -f "$tsconfig"
  else
    echo "  - types skipped: no API types found (set CLAUDE_CODE_TYPES)"
  fi
done
exit $failed
