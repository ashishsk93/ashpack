---
format: 1920x1080
duration: 39s
message: "AshPack makes Claude Code yours: one drawer for your mods, a live view of the work, and a skin over all of it"
arc: three loops, each Claim → Proof → Proof → Claim held (the last frame hands back to the first)
audience: developers who use Claude Code, browsing the AshPack repo
mode: collaborative
---

# AshPack README loops — v3

Three silent loops, one per README section, exported as animated WebP at 880 px wide.
Each is one composition file: `ashpack.html`, `status.html`, `skins.html`.

## Changes from v1

- "add the optional extra suggested for install cta" → A4 types the install command into the window's prompt.
- "in the ashpack skins, lets show a few different themes and a few items in each themes as well, in which we can show off all the custom components we get" → video C is now a five-skin tour, each skin showing a different set of the skin's components.

## Changes from v2

- On frame 13: "make this also as dark mode, light mode might not be appreciated too much, make everything dark mode for that matter." → C5 uses the GitHub skin's dark palette in the dark app; every frame of every loop is dark.

## Changes after the build

- On the status video: "when it starts the terminal is oddly zoomed in and then eventually zooms out to correct proportions, either keep it at that level or remove it from the window and have it come in." → B1 has no push-in: the window holds its normal proportions and the chips come in.

## Locked

- All 13 frame layouts, confirmed on storyboard v3 ("yes please start animating"). The build dresses and animates these layouts; it does not redraw them.

## Decisions

- **Message per loop.** A: *One drawer for all your mods.* B: *See what Claude is doing, and keep it.* C: *One pick recolours the whole conversation.*
- **Format.** 1920×1080, ~10.5–12 s each, no voiceover, no music, seamless loop: each video's last frame is its first.
- **The spine.** One Claude Code desktop window, pinned on the right 60% of the frame in every video, never cut away from. The mods move inside it; a column of editorial type on the left names what just changed. The window is the hero prop; the type is the narrator.
- **Concept angle.** The interface is the hero and the words are the voiceover: a heavy display line states the claim, a mono line annotates it like a terminal, and the UI proves it a beat later.
- **Truthfulness.** The Activity cards, the code and table cards and the charts are the mods' own SVG output (rendered from `activity.ts`, `cards.ts`, `charts.ts`). The chips, popup, drawer and tool rows are rebuilt from the mods' code (labels, colours, layout). The app window is a rebuild of the Claude Code desktop app in the style of the old README images; no capture was supplied.
- **Bans.** No glow halos, no purple-blue gradients, no floating bokeh, no breathing cards, no slow back-half pans, no bouncy overshoot, no stock icons, no invented features or numbers beyond the UI's own sample data. Two motion failures to avoid: the slideshow (a fresh card per beat) and the screensaver (motion that says nothing).
- **Held frames.** The last beat of each loop holds still on the claim for ~1 s before the loop restarts.

## Video direction

- **Palette (dark, tinted violet).** bg `#0e0c13`; window `#16141c`, chrome `#1d1a25`, hairline `#2c2836`; text `#ece9f3`, muted `#8e89a0`; accent `#8b5cf6` (AshPack's own ◆ colour), used on the eyebrow, the ◆, the focal UI state and one word per statement. Inside the window, the mods' real colours: ok `#1a9450`, warn `#a87700`, hot `#e5484d`, blue `#2f7bf0`; skins video uses each skin's real palette.
- **Type.** Display: Archivo Black (statements, 104 px, −0.04em). Mono: JetBrains Mono 400/700 (eyebrows, annotations, code, chips). UI: Inter 400/700 for the app's own chrome and transcript, faithful to the product.
- **Motion grammar.** `power3.out` long-tail settles; no overshoot. Statements enter by per-line rise (`waterfall-entry`) and swap by velocity-matched cut (`kinetic-beat-slam` register kept calm). UI changes are reveals on their beat, never front-loaded. A visible cursor drives clicks (`cursor-click-ripple`). Holds are still; the only aliveness is the popup's wave and the live dot.
- **Rhythm.** Every loop: claim (2–2.6 s) → proof (3 s) → proof (3–4 s) → held claim (~1–2 s).
- **Legibility floor.** At 880 px the canvas shrinks to 46%: statements ≥ 96 px, annotations ≥ 30 px, UI text ≥ 22 px.

## Frame 1 — A1 · Every mod, one strip

- video: ashpack.html
- src: compositions/ashpack.html
- duration: 2.6s
- poster: 2.2s
- transition_in: cut
- status: animated
- blueprint: kinetic-type-beats (Adapt) + grid-card-assemble (chips)
- scene: Window holds a turn; five chips fly into one strip above the prompt while "Every mod." swaps to "One drawer."

On screen: eyebrow "◆ ASHPACK · THE HOST"; statement "Every mod." then, by in-place swap, "One drawer."; annotation "one strip above the prompt". In the window: the transcript ("fix the login bug", "Reading the auth module first.", Read / Edit / Bash rows), the prompt "Type / for commands", footer "⏵⏵ auto mode on" … "◆ AshPack ▸". The chips "◆ Opus 5.5 · ◕ high", "⎇ main ●1", "ctx 24%", "session 70% ↻16m", "baton · 2 waiting" assemble left to right into one row above the prompt. Why: the hook states the value (all mods meet in one place) before any proof.

## Frame 2 — A2 · A tab per mod

- video: ashpack.html
- src: compositions/ashpack.html
- duration: 3.0s
- poster: 4.6s
- transition_in: cut
- status: animated
- blueprint: cursor-ui-demo (Adapt)
- scene: The cursor clicks "◆ AshPack ▸"; the drawer docks in from the right with its tabs.

On screen: statement "A tab per mod."; annotation "/ashpack". The cursor travels to the footer button and clicks (ripple); the drawer slides in from the window's right edge: header "◆ AshPack · your mods, one place", tabs "Home · Status · Activity · Skins · Baton", Home's page list. Why: proof of the claim's mechanism, the drawer.

## Frame 3 — A3 · Settings, one click away

- video: ashpack.html
- src: compositions/ashpack.html
- duration: 3.0s
- poster: 7.6s
- transition_in: cut
- status: animated
- blueprint: cursor-ui-demo (Adapt), tab swaps as hard cuts
- scene: The cursor steps through the tabs; each page swaps in place.

On screen: statement "Each mod keeps its page."; annotation "Status · Skins · Activity". Status page (Compact mode ● ON, Status chips ● ON with the chip rows), then Skins page (skin cards in their colours), then Activity (turn card). The tab underline slides to each. Why: shows breadth: every mod's settings, one place.

## Frame 4 — A4 · One drawer, one command (held)

- video: ashpack.html
- src: compositions/ashpack.html
- duration: 2.6s
- poster: 10.6s
- transition_in: cut
- status: animated
- blueprint: prompt-type-submit-generate (Adapt: the install-command end card, typed into the product's own prompt)
- scene: The drawer folds away; "One drawer." holds while the install command types into Claude Code's prompt.

On screen: statement "One drawer."; annotation "install it from the prompt". The drawer slides out; in the window's prompt box the line "/plugin install ashpack --marketplace ashishsk93/ashpack" types in behind a caret and holds ~1 s. The prompt then clears, matching frame 1's start. Why: lands the claim and hands the viewer the one action to take; closes the loop.

## Frame 5 — B1 · Know where you stand

- video: status.html
- src: compositions/status.html
- duration: 2.6s
- poster: 2.2s
- transition_in: cut
- status: animated
- blueprint: grid-card-assemble (Adapt) + stat-bars-and-fills
- scene: The window holds at its normal size; the chip row assembles by the prompt and the context and usage bars fill to their levels.

On screen: eyebrow "◆ ASHPACK-STATUS"; statement "Know where you stand."; annotation "model · branch · context · usage". Chips: "◆ Opus 5.5 · ◕ high", "⎇ main ●1 ↑1", "ctx ▰▰▱▱▱▱ 24%", "session ▰▰▰▰▱▱ 70% ↻16m", "app · $1.24 · 23m"; bars fill green and amber. Why: the first value, a glance tells you the state.

## Frame 6 — B2 · Watch it work

- video: status.html
- src: compositions/status.html
- duration: 3.0s
- poster: 4.6s
- transition_in: cut
- status: animated
- blueprint: agent-progress-theater (Adapt)
- scene: Tool rows fold away; the compact popup takes their place and narrates the work.

On screen: statement "Watch it work."; annotation "compact mode". The popup: "◆ AshPack  Fix the login bug  2/3 · 14s", the line swapping "▸ Reading auth.ts…" → "▸ Editing auth.ts…" → "▸ Running npm test…" beside the wave, and "Tasks 2/3". No call cards. Why: proof: the work is visible without the noise.

## Frame 7 — B3 · Every turn, kept

- video: status.html
- src: compositions/status.html
- duration: 3.8s
- poster: 8.0s
- transition_in: cut
- status: animated
- blueprint: dataviz-countup (Adapt) inside device-surface-showcase
- scene: The Activity page docks in; the turn card, its calls, the session tiles and the timeline build in order.

On screen: statement "Every turn, kept."; annotation "the Activity page". The mod's own cards: "TURN 6 · WORKING" with the wave; calls rows "✓ READ src/auth.ts", "✓ EDIT src/auth.ts +4 −1", "▸ RUN npm test"; tiles "SESSION 1h 02m", "TOOL CALLS 31", "LINES +892 −60", "SPEND $3.84" counting up; timeline bars rising. The turn finishes: "✓ TURN 6 · DONE · 2m 10s". Why: the second value, nothing vanishes when the popup closes.

## Frame 8 — B4 · Look back anytime (held)

- video: status.html
- src: compositions/status.html
- duration: 2.6s
- poster: 11.0s
- transition_in: cut
- status: animated
- blueprint: cursor-ui-demo (Adapt) then hold
- scene: The cursor clicks an earlier turn in the list; the card swaps to it; hold, then fold back to frame 5.

On screen: statement "Look back anytime."; turn rows "▸ #6 fix the login bug · 2m 10s · 9", "#5 add the repo chips · 6m 20s · 22", "#4 why is the popup gone · 22s · 0"; click #5, its card shows. Hold ~1 s. Why: closes on the keep-it promise.

## Frame 9 — C1 · Catppuccin: rows with icons

- video: skins.html
- src: compositions/skins.html
- duration: 2.8s
- poster: 2.2s
- transition_in: cut
- status: animated
- blueprint: fixed-anchor-cycle (Reproduce: "One pick." is the pinned anchor; the window's theme and content cycle beside it)
- scene: In Catppuccin, a turn plays: your prompt in its outline, a reply, and tool rows with line icons, then folded into one group row.

On screen: eyebrow "◆ ASHPACK-SKINS"; pinned statement "One pick."; token "/skin catppuccin"; annotation "tool rows with icons". Window: the prompt "fix the login bug" in a rounded outline; reply "Reading the auth module first."; rows "Read src/auth.ts", "Edit src/auth.ts +4 −1", "Run npm test" (its ring spinning, then a time); the run folds to "Read 3 · Run 2". Why: the hook: the skin is everywhere in a turn, down to the icons.

## Frame 10 — C2 · Dracula: diffs and terminal output

- video: skins.html
- src: compositions/skins.html
- duration: 2.8s
- poster: 5.0s
- transition_in: cut (theme-crossfade-morph)
- status: animated
- blueprint: fixed-anchor-cycle (cycle) + theme-crossfade-morph; cards rise in order
- scene: The window morphs to Dracula; an edit's diff card and a shell run's terminal card rise in.

On screen: token "/skin dracula"; annotation "diff cards · terminal cards". The mod's diff card ("src/auth.ts +4 −1", red and green lines) and terminal card ("$ npm test", output, a failing run in red). Why: proof: edits and commands read as cards, in the skin's colours.

## Frame 11 — C3 · Tokyo Night: code and tables

- video: skins.html
- src: compositions/skins.html
- duration: 2.8s
- poster: 7.8s
- transition_in: cut (theme-crossfade-morph)
- status: animated
- blueprint: fixed-anchor-cycle (cycle) + grid-card-assemble
- scene: The window morphs to Tokyo Night; a reply's code block and table rise in as cards.

On screen: token "/skin tokyo-night"; annotation "code cards · table cards". The mod's code card ("retry.ts", line numbers, coloured tokens) and table card (File · What · Size). Why: proof: replies are redrawn, not just recoloured.

## Frame 12 — C4 · Gruvbox: alerts and task lists

- video: skins.html
- src: compositions/skins.html
- duration: 2.6s
- poster: 10.4s
- transition_in: cut (theme-crossfade-morph)
- status: animated
- blueprint: fixed-anchor-cycle (cycle); items reveal in order
- scene: The window morphs to Gruvbox; an alert outline and a task list with its count appear.

On screen: token "/skin gruvbox"; annotation "alerts · task lists". A heading "Before you ship", a "Warning" alert in its outline ("Run the migration before you deploy."), a task list "✓ Read the code", "✓ Fix the token check", "○ Add a test", "○ Update the docs" under "2 of 4 done", a reply line and a two-line quote ("Keep the refresh path small. / One retry, then sign the user out."). Why: proof: markdown's extras get their own drawing.

## Frame 13 — C5 · GitHub: Mermaid as charts (close)

- video: skins.html
- src: compositions/skins.html
- duration: 3.2s
- poster: 13.2s
- transition_in: cut (theme-crossfade-morph)
- status: animated
- blueprint: compose (svg-path-draw for the flowchart edges + stat-bars-and-fills for the bar chart), ending in theme-crossfade-morph back to frame 9
- scene: The window morphs to GitHub (dark); a flowchart draws itself and a bar chart grows; the window morphs back to Catppuccin.

On screen: token "/skin github"; annotation "mermaid → 11 chart kinds". The mod's flowchart card (Check request → Serve the page / Refresh the token / Ask to sign in, labelled edges) and an xy bar chart card ("Tests passing"), in GitHub's dark palette. Then the window morphs back to Catppuccin, matching frame 9's start. Why: the last proof, and the loop's close.
