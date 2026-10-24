# Curie status

## Current phase: 0 — scaffold complete

- Works: project folders, Electron entry point, isolated preload bridge, plain renderer placeholder, npm package and lockfile, lint/test/build scripts, MIT license, environment example, and sprite credit placeholder.
- Stubbed: pet window, animation, timer, tasks, reminders, and agent features are scheduled for later phases.
- Required asset: `assets/pink_slime_sheet_16px.png` is not present in the supplied workspace or attachment directory yet.
- Run: `npm install`, then `npm start`.
- Test: `npm test`; lint: `npm run lint`; syntax build check: `npm run build`.
- Launch note: `npm start` reaches the installed Electron binary, but this machine's binary aborts with `SIGABRT` before reporting an app error. Even `electron --version` aborts, so the GUI launch could not be verified here.

## Phase commits

- Phase 0: pending commit.
