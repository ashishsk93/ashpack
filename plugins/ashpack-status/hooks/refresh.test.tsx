import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// The status chips' refresh, and what draws again (or writes) for a turn's calls.

const T0 = Date.parse('2026-10-08T10:00:00Z')
const SESSION = { source: 'startup', cwd: '/repo' } as never
const MAIN = { columns: 160, rows: 50, isFullscreen: false } as never
const BAND = { hasSurvey: false, isWorking: true, maxRows: 14, bodyColumns: 120, scroll: { offset: 0, bodyRows: 14, contentRows: 0 }, view: {} } as never
const ALL_CHIPS = { hiddenChips: [], chipOrder: ['model', 'branch', 'context', 'session', 'week', 'spend', 'tree', 'lines', 'commit', 'pr'] }

// A drawn tree's text, children joined in order.
const flatten = (node: unknown): string => (typeof node === 'string' ? node : ((node as { children?: unknown[] })?.children ?? []).map(flatten).join(''))

// The session the chips read, and each command's output by its first two words (null: it
// fails), answered once `wait` lets it. Answers what ran, by those words.
function world(on: On, prints: Record<string, string | null>, wait: (words: string) => Promise<void> = async () => undefined): string[] {
  on('settings.read', () => ({ value: {} }))
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => e as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('turn.start', ($, e) => e as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('classic.Stop', () => ({}) as never)
  on('classic.UserPromptSubmit', () => ({}) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 1, tokens: 1, percent: 30 }, rateLimits: [] } }) as never)
  on('fs.list', () => ({ value: [] }) as never)
  const ran: string[] = []
  on('process.run', async ($, e) => {
    const words = e.argv.filter(a => a !== '--no-optional-locks').slice(0, 2).join(' ')
    ran.push(words)
    await wait(words)
    const out = prints[words]
    return { value: { exitCode: out === null ? 1 : 0, stdout: out ?? '', stderr: '' } } as never
  })
  return ran
}

// Counts the writes to each of the mod's values.
function writes(on: On): Record<string, number> {
  const count: Record<string, number> = {}
  on('state.set', ($, e, next) => {
    const { key } = e as { key: string }
    count[key] = (count[key] ?? 0) + 1
    return next(e)
  })
  return count
}

test('a burst of refresh asks folds into one more load; an unchanged refresh writes nothing', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  const set = writes(on)
  let release = (): void => undefined
  const gate = new Promise<void>(resolve => (release = resolve))
  let isHeld = true
  // The first `git status` waits for the test: the turn's end asks four times meanwhile.
  const ran = world(on, { 'git status': '# branch.head main\n' }, async () => {
    if (isHeld) await gate
  })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(ran).toEqual(['git status'])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await $.session.measure({} as never)
  await $.classic.Stop({ stop_hook_active: false } as never)
  await $.classic.UserPromptSubmit({ prompt: 'next' } as never)
  isHeld = false
  release()
  await clock.advance(0)
  expect(ran).toEqual(['git status', 'git status']) // the one under way, then one more for all four
  expect(set.status).toBe(1)

  // Nothing changed: the next refresh runs git and writes nothing.
  await $.classic.Stop({ stop_hook_active: false } as never)
  await clock.advance(0)
  expect(ran).toHaveLength(3)
  expect(set.status).toBe(1)
})

test('git runs only while a chip shows the repo', async ($, on) => {
  mock.store(on, { hiddenChips: ['branch', 'tree', 'lines', 'commit', 'pr'] })
  const clock = mock.clock(on, { now: T0 })
  const ran = world(on, { 'git status': '# branch.head main\n' })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(ran).toEqual([])
  // The chips off altogether: nothing either.
  await $.command.run({ command: 'ashstatus', args: 'chips' } as never)
  await clock.advance(30_000)
  expect(ran).toEqual([])
})

test('the repo chips: GitHub at most every 2 minutes and at once on a new branch; no gh, no PR', async ($, on) => {
  mock.store(on, ALL_CHIPS)
  const clock = mock.clock(on, { now: T0 })
  const prints: Record<string, string | null> = {
    'git status': '# branch.head main\n# stash 2\n',
    'git version': 'git version 2.47.1\n',
    'git rev-parse': '/repo/.git\n',
    'git diff': '',
    'git log': '1791387600\x1ffix: a thing\n',
    'gh pr': JSON.stringify({ number: 7, state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [] }),
  }
  const ran = world(on, prints)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const band = async () => {
    const mounted = await $.ui.mount({ plugin: 'ashpack-status', surface: 'desktop', component: 'AbovePrompt', viewport: MAIN, props: { ...(BAND as object), isWorking: false } as never })
    const text = flatten(await mounted.drawn())
    await mounted.unmount()
    return text
  }
  const times = (words: string) => ran.filter(w => w === words).length
  await $.session.start(SESSION)
  await clock.advance(0)
  let text = await band()
  expect(text).toContain('2 stashes')
  expect(text).toContain('PR #7 · approved')
  expect(times('git stash') + times('git version')).toBe(0) // `git status` said
  expect(times('gh pr')).toBe(1)

  // Within 2 minutes: GitHub is not asked again, nor is the git directory.
  await clock.advance(60_000) // two timer refreshes
  expect(times('git status')).toBe(3)
  expect(times('gh pr')).toBe(1)
  expect(times('git rev-parse')).toBe(1)
  await clock.advance(61_000)
  expect(times('gh pr')).toBe(2)

  // A new branch asks at once. No stash line: this git (2.47) prints one when there are any,
  // so there are none; its version is asked once.
  prints['git status'] = '# branch.head feature\n'
  await $.classic.Stop({ stop_hook_active: false } as never)
  await clock.advance(0)
  expect(times('gh pr')).toBe(3)
  expect(await band()).not.toContain('stash')
  await $.classic.Stop({ stop_hook_active: false } as never)
  await clock.advance(0)
  expect(times('git version')).toBe(1)
  expect(times('git stash')).toBe(0)
  // No `gh` (or no PR for the branch): the chip says so.
  prints['git status'] = '# branch.head (detached)\n'
  prints['gh pr'] = null
  await $.classic.Stop({ stop_hook_active: false } as never)
  await clock.advance(0)
  text = await band()
  expect(text).toContain('⎇ detached')
  expect(text).toContain('no PR')
})

test('a git before 2.35 prints no stashes: they are listed instead', async ($, on) => {
  mock.store(on, ALL_CHIPS)
  const clock = mock.clock(on, { now: T0 })
  const ran = world(on, { 'git status': '# branch.head main\n', 'git version': 'git version 2.30.1\n', 'git stash': 'stash@{0}: a\nstash@{1}: b\n', 'gh pr': null })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start(SESSION)
  await clock.advance(0)
  expect(ran).toContain('git stash')
  const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'AbovePrompt', viewport: MAIN, props: { ...(BAND as object), isWorking: false } as never })
  expect(flatten(await band.drawn())).toContain('2 stashes')
  await band.unmount()
})

test('compact mode off: a turn\'s calls never draw the band again, and nothing ticks', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  world(on, { 'git status': '# branch.head main\n' })
  const set = writes(on)
  let draws = 0
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    draws++
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('tool.call', () => ({ result: {} }) as never)
  await $.session.start(SESSION)
  await clock.advance(0)
  const band = await $.ui.mount({ plugin: 'ashpack-status', surface: 'terminal', component: 'AbovePrompt', viewport: MAIN, props: BAND })
  await band.drawn()
  const before = draws
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  for (const i of [1, 2, 3, 4, 5]) await $.tool.call({ tool: 'Read', file_path: `/repo/${i}.ts`, tool_use_id: `r${i}` } as never)
  // A subagent's calls write nothing while the popup is off.
  const activityWrites = set.activity ?? 0
  await $.tool.call({ tool: 'Read', file_path: '/repo/x.ts', tool_use_id: 's1', agentId: 'a1' } as never)
  expect(set.activity).toBe(activityWrites)
  await clock.advance(2000)
  await band.drawn()
  expect(draws).toBe(before)
  expect(set.frame).toBeUndefined()

  // Turned on mid-turn, the popup's wave ticks; off again, it stops.
  await $.command.run({ command: 'ashstatus', args: 'compact' } as never)
  await clock.advance(1000)
  const ticks = set.frame ?? 0
  expect(ticks).toBeGreaterThan(5)
  await $.tool.call({ tool: 'Read', file_path: '/repo/y.ts', tool_use_id: 's2', agentId: 'a1' } as never)
  expect(set.activity).toBe(activityWrites + 2) // now the subagent's call moves the popup's line
  await $.command.run({ command: 'ashstatus', args: 'compact' } as never)
  await clock.advance(1000)
  expect(set.frame).toBe(ticks)
  await band.unmount()
})

test('a new turn writes the task list only when it had one, all done', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: T0 })
  world(on, {})
  const set = writes(on)
  on('tool.call', () => ({ result: {} }) as never)
  await $.turn.start({ text: 'one', turnId: 't1' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await $.turn.start({ text: 'two', turnId: 't2' } as never)
  expect(set.plan).toBeUndefined()
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'a', status: 'completed', activeForm: 'A' }], tool_use_id: 'w1' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  await $.turn.start({ text: 'three', turnId: 't3' } as never)
  expect(set.plan).toBe(2) // the list, then cleared for the new turn
  await clock.advance(0)
})
