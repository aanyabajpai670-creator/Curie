# Curie status

## Current phase: 1 — pet window

### Phase 0 — scaffold (committed as b8f1846)

- Works: project folders, Electron entry point, isolated preload bridge, plain renderer placeholder, npm package and lockfile, lint/test/build scripts, MIT license, environment example, and sprite credit placeholder.
- Test, lint, and syntax build passed.
- Launch note: npm start reaches the installed Electron binary, but this machine's binary aborts with SIGABRT before reporting an app error. Even electron --version aborts, so GUI launch could not be verified here.

### Phase 1 — implementation ready

- Works in code: frameless transparent always-on-top pet window, drag positioning saved under Electron userData, all-workspace visibility on macOS, JSON-configured five-state sprite animation, click-to-toggle control panel, right-click menu, and tray menu.
- Pet size uses a configurable 6× sprite scale. The supplied sprite is installed at assets/pink_slime_sheet_16px.png.
- Placeholder: alert, sleep, and done effects reuse existing frames until the owner draws custom frames. Panel controls are still placeholders for Phase 2 and later.
- Run: npm install, then npm start.
- Test: npm test; lint: npm run lint; syntax build check: npm run build.
- GUI launch still needs verification on a machine where Electron can start; this environment aborts even the Electron version command.

## Phase commits

- Phase 0: b8f1846 — scaffold Curie desktop app.
- Phase 1: pending commit.
