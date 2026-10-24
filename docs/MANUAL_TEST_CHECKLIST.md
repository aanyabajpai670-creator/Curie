# Manual test checklist (about 30 minutes)

Run `npm start` from the project folder on a machine where Electron starts. For packaging, use `npm run package:mac` on macOS or `npm run package:win` for the Windows x64 NSIS artifact. Use a throwaway task list; test deletes only on tasks you are happy to remove.

## 0–4 min: pet and window

- [ ] The slime appears, animates without smoothing, and stays above normal windows.
- [ ] Drag it to another position, quit, relaunch, and confirm it returns there.
- [ ] Click it to open/close the panel. Right-click and tray menus show the expected timer and open actions.
- [ ] Confirm the panel can resize and Settings expands.

## 4–9 min: timer and persistence

- [ ] In Settings, temporarily set work and break to one minute; save.
- [ ] Start, pause, wait ten seconds, resume, then confirm remaining time continues from the paused value.
- [ ] Reset and skip a work phase; confirm the break begins. Wait for a notification or skip the break.
- [ ] Start another work phase, quit Curie, relaunch, and confirm the running timer catches up from its saved deadline.
- [ ] Put the computer to sleep across a timer boundary, wake it, and confirm phase/notification catch-up. A short sleep is enough to check resume handling; for a missed boundary, temporarily use a short timer and wait.

## 9–14 min: tasks, reminders, nudges

- [ ] Add a task with a subject, estimate, due time, and a reminder a minute before due. Check it off, add another, and delete that one with confirmation.
- [ ] Set a reminder at a time a minute ahead. Confirm the native notification and panel actions: Snooze, Done, and Dismiss.
- [ ] Snooze once and verify it reappears after ten minutes; then mark it done.
- [ ] For a nudge check, add an estimated task whose due time is less than its estimate away. Temporarily set quiet hours to a non-current interval and max nudges to 1. Confirm one local nudge appears and repeats are suppressed for that task/day.
- [ ] Restore your normal timer, quiet hours, and nudge limit.

## 14–20 min: settings and local privacy

- [ ] Change timezone, quiet-hour boundaries, nudge interval, daily nudge cap, pet scale, and timer lengths; restart and confirm saved values persist.
- [ ] Enter an invalid timezone or quiet-hour time and confirm Settings reports an error without accepting the change.
- [ ] Save a provider key, restart, and confirm Settings reports that a key is saved without revealing its value. Remove the key and confirm the saved indicator clears.
- [ ] Inspect the settings JSON in Electron's user data directory: API key text must not appear in plaintext. Do not copy real keys into screenshots or logs.
- [ ] Set chat limits to 1 per hour and 1 per 24 hours; after one chat request, confirm the next one is blocked with a clear message. Restore the limits.

## 20–25 min: chat and failure cases

- [ ] With a valid free-tier key and internet access, ask Curie to add a task with an estimate and date. Confirm the task appears and the response does not claim success before the task is saved.
- [ ] Ask Curie to delete a test task. Confirm it prompts before deleting; cancel and confirm the task remains.
- [ ] Enter a deliberately invalid key. Confirm a clear authentication error and no API key in the error text or logs. Remove the bad key.
- [ ] Disconnect the network and send a chat message. Confirm chat reports failure, while timer controls and local task list still work. Reconnect after the check.
- [ ] Remove all keys and try chat. Confirm Curie explains that a Gemini or Groq key is needed.

## 25–30 min: shortcuts and release files

- [ ] Leave Shortcuts disabled and start a work phase; confirm no shortcut runs.
- [ ] On macOS only, enable shortcuts with a nonexistent name. Confirm the setup hint appears once and the timer keeps working.
- [ ] If a harmless test Shortcut is available, configure it and confirm it runs on work start and work end/reset. Clear the names after testing.
- [ ] Check that the macOS DMG/ZIP are unsigned and universal, and that the Windows setup file is x64 and unsigned. Install only on a test machine/VM or a system where you accept the unsigned-app warning.
- [ ] Restore preferred settings and remove throwaway tasks and reminder entries.
