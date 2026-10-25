# Manual test checklist (about 30 minutes)

## Timer phase smoke test (about 3 minutes)

1. Before launching, save a copy of `assets/timer.json` and temporarily set `focusMinutes` and `shortBreakMinutes` to `1`. Leave `longBreakMinutes` and `longBreakEvery` as they are. Run `npm start`.
2. Open the pet's right-click menu and choose **Start focus**. Confirm the timer readout appears below the pet and counts down. With **Calm during focus** checked, the pet settles and breathes without hopping. Confirm the tray tooltip names FOCUS and shows the remaining time.
3. Pause from the menu, wait five seconds, then Resume. Confirm the remaining time resumes from the paused value. Wait for focus to end: confirm a native notification, a short alert animation, the timer readout changes to SHORT_BREAK, and the pet returns to ACTIVE movement.
4. Let the break end. Confirm the timer returns to IDLE and does not start another focus on its own. Press `Ctrl+Option+T` to start a new focus, press it again to pause, and once more to resume. Stop from the menu and confirm the time label disappears.
5. Restore the saved `assets/timer.json`. This hand test has not been run in a GUI as part of the timer implementation; record actual desktop results separately.

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
- [ ] Set the provider-call daily limit to 50; confirm the debug overlay reports the configured limit and actual provider calls. Restore it after testing.

## 20–25 min: chat and failure cases

- [ ] With a valid free-tier key and internet access, use **Ask Curie...** to add a task with a date. Confirm the preview first; cancel and verify no task was added. Repeat and confirm.
- [ ] Enter a deliberately invalid key. Confirm a clear authentication error and no API key in the error text or logs. Remove the bad key.
- [ ] Disconnect the network and send a chat message. Confirm chat reports failure, while timer controls and local task list still work. Reconnect after the check.
- [ ] Remove all keys and try chat. Confirm Curie explains that a Gemini or Groq key is needed.

## 25–30 min: shortcuts and release files

- [ ] Leave Shortcuts disabled and start a work phase; confirm no shortcut runs.
- [ ] On macOS only, enable shortcuts with a nonexistent name. Confirm the setup hint appears once and the timer keeps working.
- [ ] If a harmless test Shortcut is available, configure it and confirm it runs on work start and work end/reset. Clear the names after testing.
- [ ] Check that the macOS DMG/ZIP are unsigned and universal, and that the Windows setup file is x64 and unsigned. Install only on a test machine/VM or a system where you accept the unsigned-app warning.
- [ ] Restore preferred settings and remove throwaway tasks and reminder entries.

## Agent phase: five-minute manual test

- [ ] Open **API keys...** from the right-click menu. Confirm the privacy notice, enter a free-tier Gemini key, test it, save it, and verify the UI shows only key-present status. Test Groq separately if configured.
- [ ] Open **Ask Curie...** from the right-click menu. Ask “remind me tomorrow at 5pm to send the draft.” Confirm the proposed local date/time and choose **Cancel all**; verify no task/reminder was saved.
- [ ] Ask the same request again and choose **Confirm all**. Verify one task and explicit reminder exist. For the quiet-hours check, temporarily set quiet hours to cover the current time, create a one-minute explicit reminder, and verify it still fires.
- [ ] Ask Curie to complete or delete a throwaway task. Verify the change waits for confirmation. In separate attempts, press Escape and close the window; verify each cancels without writing. The five-minute unanswered timeout is covered with a fake clock in automated tests.
- [ ] Open Ask Curie with `Ctrl+Option+A` and confirm it is the same window. While a request is running, submit another and confirm the second is rejected plainly.
- [ ] Check the debug overlay for provider, iterations, tools, error category, daily/rolling-minute usage and limits, and key-present booleans. Confirm no key, user text, or model reply appears in it or `curie.log`.
- [ ] If testing fallback, temporarily make Gemini unavailable and confirm Groq succeeds; then test both providers unavailable and confirm Curie reports a plain failure without changing tasks.
