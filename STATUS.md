# Curie status

## Current phase: 9 — owner documentation (complete)

### Phase 0 — scaffold (committed as b8f1846)

- Works: project folders, Electron entry point, isolated preload bridge, renderer placeholder, npm package and lockfile, lint/test/build scripts, MIT license, environment example, and sprite credit placeholder.
- Test, lint, and syntax build passed.
- Launch note: npm start reaches the installed Electron binary, but this machine's binary aborts with SIGABRT before reporting an app error. Even electron --version aborts, so GUI launch could not be verified here.

### Phase 1 — pet window (committed as ec89566)

- Works in code: frameless transparent always-on-top pet window, drag position saved under Electron userData, all-workspace visibility on macOS, JSON-configured sprite animation, left-click ACTIVE/CALM toggle, right-click menu, and tray menu with **Open panel**.
- The supplied 12-frame sprite is installed at assets/pink_slime_sheet_16px.png.
- Placeholder: alert, sleep, and done effects reuse existing frames until the owner draws custom frames.

### Phase 2 — study timer (committed as f8669a9)

- Works in code: configurable 25/5 minute work and break lengths; start, pause, resume, reset, skip, and status; persisted active deadlines and paused time; restart and sleep catch-up; native end notifications; tray and panel controls; and pet state updates.
- The pure timer uses an injectable clock. Timer tests cover transitions, pause/resume, reset, skip, restart, and catch-up after drift.

### Phase 3 — tasks and reminders (committed as 564b2f7)

- Works in code: validated JSON task CRUD under Electron userData; exact-time and minutes-before-due reminders; 30-second checks plus launch/resume catch-up; missed labels; 10-minute snooze, done, and dismiss actions; native notifications; alert pet state; and task list controls with delete confirmation.
- Due/reminder timestamps require ISO forms with a timezone and normalize to UTC for scheduling.

### Phase 4 — agent (committed as 8a9e630)

- Works in code: a commented tool loop under 150 lines, local task/timer tools, UI confirmation before agent deletions, minimal task context, dynamic date/time/timezone prompt, panel chat, and collapsed tool activity.
- Provider defaults were checked against official documentation on 2026-10-24: Gemini OpenAI-compatible chat and tools use gemini-3.8-flash; Groq uses openai/gpt-oss-120b. Free-tier API keys only; no automatic paid upgrade.
- Providers can read keys from the launch environment or from encrypted Settings storage.
- Mocked tests cover single and multiple calls, tool error retry, max steps, 429/5xx/timeout fallback and cooldown, task minimization, and delete confirmation. A live provider call still needs an owner-supplied key.
- Test: npm test (33 passing); lint: npm run lint; format: Prettier; syntax build check: npm run build.
- GUI launch still needs verification on a machine where Electron starts; this host aborts even the Electron version command.

## Phase commits

- Phase 0: b8f1846 — scaffold Curie desktop app.
- Phase 1: ec89566 — add animated desktop pet window.
- Phase 2: f8669a9 — add persistent study timer.
- Phase 3: 564b2f7 — add task store and reminders.
- Phase 4: 8a9e630 — add provider-backed study agent.
- Phase 5: 93dda0a — add local deadline nudges.
- Phase 6: 685555c — add optional focus shortcut automation.
- Phase 7: 0ecf23f — add encrypted app settings.
- Phase 7 follow-up: 9e91dac — add configurable chat request limits.
- Phase 8: c7db7f5 — package unsigned macOS and Windows builds.
- Phase 9: owner documentation and manual checklist (current HEAD).

### Phase 8 — packaging (committed as c7db7f5)

- electron-builder 26 targets unsigned macOS DMG/ZIP and Windows NSIS installers. No signing or notarization account is used.
- Electron was updated to 45.0.0 after the prior runtime's high-severity audit findings; current dependency audit reports zero vulnerabilities.
- README includes unsigned installation and Google AI Studio key setup instructions.
- Built `Curie-0.1.0-universal.dmg` and `Curie-0.1.0-universal-mac.zip` for Intel and Apple Silicon, plus `Curie Setup 0.1.0.exe` for Windows x64. Builder logs confirm signing was skipped.
- Electron's packaged binary still exits with SIGABRT when invoked on this host; package generation succeeds but GUI launch remains unverified.

### Phase 5 — proactive nudges (committed as 93dda0a)

- Local 30-minute checks compare remaining estimated work with task deadlines. Quiet hours default to 23:00–07:00 Asia/Kolkata, nudges cap at 3 per local day, and each task is nudged at most once per day. State is saved locally; nudges use a plain template and make no LLM calls.
- Tests cover deadline pressure, quiet hours, timezone, daily cap, duplicate suppression, and restart persistence (40 passing overall).

### Phase 6 — focus mode (committed as 685555c)

- Optional macOS Shortcuts integration can run user-configured start/end shortcuts with work timer transitions. It is disabled by default and uses `execFile` with argument arrays, so shortcut names are not interpreted by a shell.
- Missing shortcuts or failed commands produce one setup notification per shortcut name. Other platforms and blank names are no-ops.
- Tests cover disabled and non-macOS behavior, safe argument passing, and one-time setup hints.
- Shortcut names and enablement are configurable in Settings.

### Phase 7 — settings (complete; commits 0ecf23f and 9e91dac)

- Settings UI covers work and break lengths, timezone, quiet hours, local nudge frequency and daily cap, rolling chat limits per hour and 24 hours, provider model names, encrypted Gemini/Groq keys, macOS shortcut names, pet size, and launch at login.
- Electron `safeStorage` protects stored provider keys; Curie refuses key storage when OS-backed encryption is unavailable. Keys are never returned to the renderer.
- Timer changes affect future sessions and preserve a paused countdown. Provider and nudge configuration updates while the app is running.
- Electron 45 exits with SIGABRT even for `--version`; GUI launch and visual settings review remain unverified on this host.

### Phase 9 — owner documentation (complete)

- Added `docs/ARCHITECTURE.md`, `docs/HOW_THE_AGENT_WORKS.md`, `docs/LEARN.md`, and `docs/MANUAL_TEST_CHECKLIST.md`.
- Owner TODO markers remain for rewriting the prompt/tool descriptions, replacing placeholder animation frames, tuning the nudge rule, and filling in sprite credit details.
- Test: `npm test` (48 passing); lint: `npm run lint`; syntax build: `npm run build`; formatting: Prettier; dependency audit: zero vulnerabilities.
- `npm start` and visual/manual feature checks remain unverified because Electron 45 exits with SIGABRT on this host. Installer generation succeeded for universal macOS and Windows x64 targets.

## Pet behavior follow-up (commits a5de374, 8bcab82, 5c360c0)

- Works in code: left click toggles ACTIVE and CALM, with `CALM pending` shown through the blink and settle to neutral frame 0 or 6. The canvas no longer opens the panel; the right-click menu and tray menu do.
- The pet has five sprite pixels of hop headroom by default. `assets/behaviour.json` sets the eased lift profile and 600–1600 ms active rests. The renderer interpolates lift at up to 60 fps while sprite frames still advance every 80 ms. A grounded shadow shrinks and fades during flight.
- ACTIVE rests and breathes between hops. WANDER moves horizontally only while airborne and hops continuously during travel. CALM holds a neutral frame, breathes, and suppresses hopping.
- Updated automated suite: 64 passing; `npm run lint`, `npm run build`, and `git diff --check` pass. The preview server was checked in a browser: real canvas clicks changed the readout through CALM pending to CALM and back to ACTIVE.
- Electron desktop interaction remains unverified on this host because its installed binary exits with SIGABRT. Hand checks are listed in `docs/BEHAVIOUR_HAND_TESTS.md`.

## Desktop reliability follow-up (commits efe28ba, 4a575a2, eb1f0ed, 65dc593; final docs/doctor/smoke changes pending commit)

### Verified by tests

- `PetPositionController` owns native pet position writes; unit tests cover pointer-relative drag, work-area union clamping, integer coordinates, stale restore rejection, drag suspension, and persistence on drag end.
- Main-process gaze logic is pure and tested for heartbeat resend, NaN/out-of-display cursor handling, far-left to right recovery, tick exception containment, hysteresis, and renderer watchdog centering.
- Downward gaze draws only the lower two eye cells and is gated by the vertical dead zone/hysteresis.
- `npm test` passes (79 tests); `npm run doctor` passes, syntax-checking 32 source files and verifying 11 IPC routes. Lint and syntax build pass.
- The requested Electron smoke test launched the real app and exercised drag through the renderer preload IPC. Exact result: `before={"x":40,"y":80,"width":160,"height":210}`, `after={"x":100,"y":130,"width":160,"height":210}`, `passed=true`, Electron exit `code=0 signal=null`, and `curie.log errors: none`. It printed Electron's existing insecure Content-Security-Policy warning.

### NOT verified in a running GUI

- The smoke verified Electron launch, native window bounds, and drag IPC only. Visual hop timing, wandering, debug overlay placement/refresh, multi-display behavior, and live gaze recovery remain unverified in a running GUI.
- The latest `npm run preview` attempt also could not bind `127.0.0.1:4173` in the sandbox (`EPERM`), so no new visual preview check was made for these changes.

### How to read the debug overlay

- `pet window` gives the native window rectangle; `display` and `workArea` show the display currently matched to it.
- `cursor` is the raw screen point, and `vector from centre` is cursor minus pet-window centre. `gaze` is the main-process quantized direction (`dx`, `dy`), where each axis is -1, 0, or +1.
- `last gaze received` is the renderer acknowledgment age. It should remain below 250 ms while heartbeats are flowing; near 1000 ms, the renderer watchdog eases the eyes to centre.
- The final five `position writes` list newest last with their source: `drag`, `wander`, `clamp`, or `restore`.

## Calm ownership repair (implementation complete; commit pending)

### Verified by tests

- Main-process `PetCalmController` is the sole desktop calm owner. Click IPC, menu checkbox, `Ctrl+Option+C`, timer focus, and the legacy behavior API route through the same `setCalm(value, source)` adapter; source-tagged events are allowlisted in `curie.log`.
- Fake-clock tests cover 60 seconds without wander writes after a click, no hop starts while calm, neutral-frame blink settling, delayed first wander after reactivation, all trigger sources, timer-focus restoration with manual override, and heartbeat repair after a dropped state message.
- `npm test` passes (87 tests); `npm run doctor` checks 33 source files and verifies 14 IPC routes; lint, syntax build, and `git diff --check` pass.

### NOT verified in a running GUI

- The reported desktop bug was observed by the owner before this repair. The repaired click-to-calm flow, menu/shortcut/timer triggers, immediate native movement stop, and renderer settling have not been visually rechecked in Electron. The post-repair confidence comes from pure fake-clock tests and static IPC checks.
- Debug overlay text and `curie.log` source-tag output have not been inspected in a post-repair GUI run.
