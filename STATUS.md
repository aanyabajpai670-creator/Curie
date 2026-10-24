# Curie status

## Current phase: 9 — owner documentation (implementation in progress)

### Phase 0 — scaffold (committed as b8f1846)

- Works: project folders, Electron entry point, isolated preload bridge, renderer placeholder, npm package and lockfile, lint/test/build scripts, MIT license, environment example, and sprite credit placeholder.
- Test, lint, and syntax build passed.
- Launch note: npm start reaches the installed Electron binary, but this machine's binary aborts with SIGABRT before reporting an app error. Even electron --version aborts, so GUI launch could not be verified here.

### Phase 1 — pet window (committed as ec89566)

- Works in code: frameless transparent always-on-top pet window, drag position saved under Electron userData, all-workspace visibility on macOS, JSON-configured five-state sprite animation, click-to-toggle panel, right-click menu, and tray menu.
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

### Phase 8 — packaging (complete; packaging commit pending)

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
- GUI launch and visual settings review remain unverified until runtime startup is checked with Electron 45.

### Phase 9 — owner documentation (implementation in progress)

- Architecture, agent walkthrough, learning guide, and 30-minute manual test checklist are being added.
