// Draws the mods' real cards for the README loops, from the repo's own renderers: the
// Activity page (ashpack-status) and the skins' code, table, diff, terminal and chart cards.
// Run from this folder: bun scripts/gen-assets.ts
import { mkdirSync, writeFileSync } from 'node:fs'

import { callsSvg, chartSvg, heroSvg, NO_HISTORY, sessionTiles, shownOf, tilesSvg, turnLabel, turnOf, withTurn } from '../../../plugins/ashpack-status/hooks/activity.ts'
import { barPx, barSvg, COLORS, isBar, statusChips } from '../../../plugins/ashpack-status/hooks/format.ts'
import { codeSvg, diffFence, diffSvg, shellOf, tableOf, tableSvg, terminalSvg } from '../../../plugins/ashpack-skins/hooks/cards.ts'
import { chartCard } from '../../../plugins/ashpack-skins/hooks/charts.ts'
import { toolIcon } from '../../../plugins/ashpack-skins/hooks/icons.ts'
import { parseChart } from '../../../plugins/ashpack-skins/hooks/mermaid.ts'
import { paletteOf, SKINS } from '../../../plugins/ashpack-skins/hooks/skins.ts'

const OUT = 'assets/cards'
mkdirSync(OUT, { recursive: true })
const sizes: Record<string, { width: number; height: number }> = {}
// Saved without their SMIL: a video frame must come from the timeline alone, not the browser's clock.
const save = (name: string, card: { source: string; width?: number; height: number }, width: number) => {
  writeFileSync(`${OUT}/${name}.svg`, card.source.replace(/<animate\b[^>]*\/>/g, ''))
  sizes[name] = { width: card.width ?? width, height: card.height }
}

// ── the Activity page, as the desktop app draws it in dark mode ──
const c = { ...COLORS, bg: '#262624', text: '#ecebe6' }
const W = 440
const T0 = Date.parse('2026-10-10T10:00:00Z')
type Kind = 'read' | 'edit' | 'command' | 'search' | 'web' | 'agent' | 'skill' | 'tool'
const call = (id: string, kind: Kind, target: string, state: 'ok' | 'failed' | 'running', ms?: number, size?: { added: number; removed: number }) => ({ id, kind, target, state, ...(ms === undefined ? {} : { ms }), ...size })
const usage = (n: number) => ({ input_tokens: 2000, output_tokens: 1400 * n, cache_read_input_tokens: 30000, cache_creation_input_tokens: 4000 })
const past = (n: number, prompt: string, ms: number, calls: ReturnType<typeof call>[], costUsd: number) =>
  turnOf({ n, prompt, startedAt: T0 + n * 300_000, steps: [], calls }, { ms, outcome: 'answer', costUsd, usage: usage(n) })
let h = NO_HISTORY
const reads = (k: number) => Array.from({ length: k }, (_, i) => call(`r${i}`, 'read', `src/file${i}.ts`, 'ok', 120))
h = withTurn(h, past(1, 'check the repo layout', 45_000, reads(3), 0.08))
h = withTurn(h, past(2, 'fix the chips', 312_000, [...reads(6), call('e', 'edit', 'src/chips.ts', 'ok', 900, { added: 40, removed: 12 }), call('c', 'command', 'npm test', 'ok', 8400)], 0.42))
h = withTurn(h, past(3, 'why is the popup gone', 22_000, [], 0.03))
h = withTurn(h, past(4, 'tidy the README', 96_000, [...reads(2), call('e', 'edit', 'README.md', 'ok', 600, { added: 18, removed: 9 })], 0.12))
h = withTurn(h, past(5, 'add the repo chips', 380_000, [...reads(9), call('e1', 'edit', 'src/chips.ts', 'ok', 1100, { added: 214, removed: 12 }), call('e2', 'edit', 'src/format.ts', 'ok', 700, { added: 60, removed: 8 }), call('c1', 'command', 'npm test', 'failed', 9100), call('c2', 'command', 'npm test', 'ok', 8700), call('s', 'search', 'chipOrder in src', 'ok', 300)], 0.61))
const liveCalls = [
  call('a', 'read', 'src/auth.ts', 'ok', 120),
  call('b', 'search', 'refreshToken in src', 'ok', 340),
  call('d', 'edit', 'src/auth.ts', 'ok', 1200, { added: 4, removed: 1 }),
  call('e', 'command', 'npm test', 'running'),
]
const live = { n: 6, prompt: 'fix the login bug', startedAt: T0 + 2_000_000, steps: [{ id: 'e', label: 'Running npm test' }], calls: liveCalls }
const now = live.startedAt + 95_000
for (const [name, s] of [
  ['hero-live', shownOf(live, h.turns, null)],
  ['hero-turn5', shownOf(null, h.turns, 5)],
] as const) save(name, heroSvg(s, c, W), W)
const doneCalls = liveCalls.map(x => (x.state === 'running' ? { ...x, state: 'ok' as const, ms: 8200 } : x))
const done = turnOf({ ...live, calls: doneCalls }, { ms: 130_000, outcome: 'answer', costUsd: 0.21, usage: usage(6) })
save('hero-done', heroSvg(shownOf(null, [...h.turns, done], null), c, W), W)
save('calls-live', callsSvg(liveCalls, 0, c, W), W)
save('calls-done', callsSvg(doneCalls, 0, c, W), W)
save('calls-turn5', callsSvg(h.turns[4]!.calls.slice(-4), h.turns[4]!.calls.length - 4, c, W), W)
const totals = { ...h.totals, since: T0 - 3_000_000 }
save('tiles', tilesSvg(sessionTiles(totals, live, now, c, 3.84), 41, c, W), W)
// The tiles counting up: the renderer's own drawing at eight steps toward the final values.
const STEPS = 8
for (let k = 0; k < STEPS; k++) {
  const f = 1 - (1 - (k + 1) / STEPS) ** 2 // ease-out, ending on the real values
  const part = {
    ...totals,
    turns: Math.round(totals.turns * f),
    workMs: totals.workMs * f,
    calls: Math.round(totals.calls * f),
    failed: Math.round(totals.failed * f),
    added: Math.round(totals.added * f),
    removed: Math.round(totals.removed * f),
    files: totals.files.slice(0, Math.round(totals.files.length * f)),
    since: now - (now - (totals.since ?? now)) * f,
  }
  const a = k === STEPS - 1 ? live : { ...live, calls: live.calls.slice(0, Math.round(live.calls.length * f)) }
  save(`tiles-${k}`, tilesSvg(sessionTiles(part, a, now, c, 3.84 * f), Math.round(41 * f), c, W), W)
}
const bars = [...h.turns, { n: 6, prompt: live.prompt, ms: 95_000, calls: liveCalls, isLive: true }]
save('timeline', chartSvg(bars, c, W, null), W)
save('timeline-turn5', chartSvg(bars, c, W, 5), W)

// The turn list's rows, newest first, once turn 6 is done; and with turn 5 picked.
const finished = [...h.turns, done]
const rowsOf = (pick: number) => [...finished].reverse().slice(0, 4).map(t => `${t.n === pick ? '▸' : ' '} ${turnLabel(t, 46)}`)
writeFileSync(`${OUT}/rows.json`, `${JSON.stringify({ now: rowsOf(6), turn5: rowsOf(5) }, null, 2)}\n`)

// ── the skins' cards, each in its skin's dark palette ──
const pal = (id: string, light = false) => paletteOf(SKINS.find(s => s.id === id)!, light)
const CW = 700
const diff = diffFence(['--- a/src/auth.ts', '+++ b/src/auth.ts', '@@ -12,6 +12,9 @@ export async function login(user: User) {', '   const token = await fetchToken(user)', '-  if (!token) return null', '+  if (!token || isExpired(token)) {', '+    return refresh(user)', '+  }', '   return session(token)', ' }'].join('\n'))!
save('dracula-diff', diffSvg(diff, 'src/auth.ts', pal('dracula'), CW), CW)
const shell = shellOf({ stdout: '> app@1.4.0 test\n> vitest run\n\n ✓ auth/login.test.ts (6)\n ✓ auth/token.test.ts (4)\n ✗ auth/refresh.test.ts (1 failed)\n\n Tests  1 failed | 10 passed (11)\n', stderr: '', interrupted: false }, 'npm test', true)!
save('dracula-terminal', terminalSvg(shell, pal('dracula'), CW), CW)
const code = [
  'export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {',
  '  let last: unknown',
  '  for (let i = 0; i < tries; i++) {',
  '    try {',
  '      return await fn()',
  '    } catch (err) {',
  '      last = err // wait longer each time',
  '      await new Promise(r => setTimeout(r, 2 ** i * 100))',
  '    }',
  '  }',
  '  throw last',
  '}',
].join('\n')
save('tokyo-code', codeSvg('ts', code, pal('tokyo-night'), CW), CW)
save('tokyo-table', tableSvg(tableOf('| File | What it does | Size |\n|---|---|---|\n| cards.ts | draws the code, table and diff cards | 271 lines |\n| markdown.ts | reads a reply into blocks | 114 lines |\n| charts.ts | turns mermaid into charts | 456 lines |'), pal('tokyo-night'), CW), CW)
const flow = chartCard(parseChart('flowchart TD\n  A{Check request} -->|valid| B[Serve the page]\n  A -->|expired| C[Refresh the token]\n  A -->|missing| D[Ask to sign in]')!, pal('github'), CW)!
save('github-flow', flow, CW)
const xy = chartCard(parseChart('xychart-beta\n  title "Tests passing"\n  x-axis [Mon, Tue, Wed, Thu, Fri]\n  y-axis "tests" 0 --> 120\n  bar [42, 58, 71, 96, 112]')!, pal('github'), CW)!
save('github-bars', xy, CW)

// ── tool-row icons, per skin that shows them ──
const icons = (id: string) => {
  const p = pal(id)
  writeFileSync(`${OUT}/${id}-icon-read.svg`, toolIcon('read', p.blue, false))
  writeFileSync(`${OUT}/${id}-icon-write.svg`, toolIcon('write', p.yellow, false))
  writeFileSync(`${OUT}/${id}-icon-run.svg`, toolIcon('run', p.green, false))
  writeFileSync(`${OUT}/${id}-icon-run-busy.svg`, toolIcon('run', p.muted, true))
}
icons('catppuccin')

// ── the status chips as the desktop app shows them (it names the model itself): spans,
// the bars as the images it draws ──
const chipNow = T0
const chips = statusChips(
  {
    model: 'claude-opus-5-5', effort: 'high', contextPercent: 24, folder: 'app', costUsd: 1.24, startedAt: chipNow - 23 * 60_000, repo: {},
    rateLimits: [
      { kind: 'five_hour', percentUsed: 70, resetsAt: new Date(chipNow + 16 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(chipNow + (3 * 24 + 4) * 3_600_000).toISOString() },
    ],
    git: { branch: 'main', dirty: 1, ahead: 1, behind: 0, staged: 0, changed: 1, untracked: 0, conflicts: 0 },
  },
  chipNow, 6, COLORS, false, ['branch', 'context', 'session', 'week', 'spend'],
)
const chipSpans = chips.map(({ id, cell }) => ({
  id,
  spans: cell.map((sp, i) => {
    if (!isBar(sp)) return sp
    const file = `bar-${id}-${i}.svg`
    writeFileSync(`${OUT}/${file}`, barSvg(sp.bar, sp.width, sp.color))
    return { bar: file, width: barPx(sp.width), height: 7 }
  }),
}))
writeFileSync(`${OUT}/chips.json`, `${JSON.stringify(chipSpans, null, 2)}\n`)

// ── the skins' palettes, for the pieces drawn as HTML (prompt outline, rows, alerts, tasks) ──
const palettes = Object.fromEntries(['catppuccin', 'dracula', 'nord', 'tokyo-night', 'gruvbox', 'github'].map(id => [id, { dark: pal(id), light: pal(id, true) }]))
writeFileSync(`${OUT}/palettes.json`, `${JSON.stringify(palettes, null, 2)}\n`)

writeFileSync(`${OUT}/sizes.json`, `${JSON.stringify(sizes, null, 2)}\n`)
console.log(Object.entries(sizes).map(([k, v]) => `${k} ${v.width}×${v.height}`).join('\n'))
