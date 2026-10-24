# Curie status

## Current phase: 3 — tasks and reminders

### Phase 0 — scaffold (committed as b8f1846)

- Works: project folders, Electron entry point, isolated preload bridge, plain renderer placeholder, npm package and lockfile, lint/test/build scripts, MIT license, environment example, and sprite credit placeholder.
- Test, lint, and syntax build passed.
- Launch note: npm start reaches the installed Electron binary, but this machine's binary aborts with SIGABRT before reporting an app error. Even electron --version aborts, so GUI launch could not be verified here.

### Phase 1 — pet window (committed as ec89566)

- Works in code: frameless transparent always-on-top pet window, drag positioning saved under Electron userData, all-workspace visibility on macOS, JSON-configured five-state sprite animation, click-to-toggle control panel, right-click menu, and tray menu.
- Pet size uses a configurable 6× sprite scale. The supplied sprite is installed at assets/pink_slime_sheet_16px.png.
- Placeholder: alert, sleep, and done effects reuse existing frames until the owner draws custom frames. Panel task and chat controls are still placeholders for later phases.

### Phase 2 — study timer (implementation committed after verification)

- Works in code: configurable 25/5 minute work and break lengths, start/pause/resume/reset/skip/status, persisted active deadlines and paused remaining time, restart and sleep catch-up, native end notifications, tray and panel controls, and pet state updates.
- The pure timer uses an injectable clock. Tests cover transitions, pause/resume, reset, skip, restart, and catch-up after drift.
- Test: npm test (11 passing); lint: npm run lint; syntax build check: npm run build.
- GUI launch still needs verification on a machine where Electron starts; this host aborts even the Electron version command.

## Phase commits

- Phase 0: b8f1846 — scaffold Curie desktop app.
- Phase 1: ec89566 — add animated desktop pet window.
- Phase 2: pending commit.
