# Curie status

## Current phase: 5 — proactive nudges

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

### Phase 4 — agent (verified; commit pending)

- Works in code: a commented tool loop under 150 lines, local task/timer tools, UI confirmation before agent deletions, minimal task context, dynamic date/time/timezone prompt, panel chat, and collapsed tool activity.
- Provider defaults were checked against official documentation on 2026-10-24: Gemini OpenAI-compatible chat and tools use gemini-3.8-flash; Groq uses openai/gpt-oss-120b. Free-tier API keys only; no automatic paid upgrade.
- Providers currently read GEMINI_API_KEY and GROQ_API_KEY from the launch environment. Settings-based encrypted key storage is Phase 7.
- Mocked tests cover single and multiple calls, tool error retry, max steps, 429/5xx/timeout fallback and cooldown, task minimization, and delete confirmation. A live provider call still needs an owner-supplied key.
- Test: npm test (33 passing); lint: npm run lint; format: Prettier; syntax build check: npm run build.
- GUI launch still needs verification on a machine where Electron starts; this host aborts even the Electron version command.

## Phase commits

- Phase 0: b8f1846 — scaffold Curie desktop app.
- Phase 1: ec89566 — add animated desktop pet window.
- Phase 2: f8669a9 — add persistent study timer.
- Phase 3: 564b2f7 — add task store and reminders.
- Phase 4: pending commit.
