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
- [ ] Add a task with a due time but no reminder, about ten minutes ahead. Confirm the panel's Saved reminders shows one planned reminder and it appears in the bubble shortly before the deadline. Skip it and confirm the task stays open.
- [ ] Add a task due in a few days with a large scope in the title, such as "prepare 4 chapters and give mocks". Check `curie.log` for `reminder.planned` and confirm the panel shows the next planned time with a `(+N more)` count.
- [ ] Set a reminder at a time a minute ahead. Confirm it appears as Due now in the bubble and panel; try Snooze, Done, and Skip.
- [ ] Snooze once and verify it reappears after ten minutes; then mark it done.
- [ ] For a nudge check, add an estimated task whose due time is less than its estimate away. Temporarily set quiet hours to a non-current interval and max nudges to 1. Confirm one local nudge appears and repeats are suppressed for that task/day.
- [ ] Restore your normal timer, quiet hours, and nudge limit.

### Reminder bubble and replies (about 5 minutes)

- [ ] Add a throwaway reminder for one minute ahead. Confirm the saved reminder appears in the panel with its due time, then wait for the grouped frosted bubble beside the pet.
- [ ] Verify the bubble stays on screen and offers Done, Snooze, and Skip. Snooze for 20 minutes using the reply box and confirm the short “Snoozed” result remains visible; use the bubble test item to show it again if needed.
- [ ] Create two reminders due together and confirm one bubble groups them. Quit Curie before one reminder is due, wait past its time, relaunch, and confirm it is labeled missed and remains actionable.
- [ ] Type “done” and confirm the reminder closes and the task completes. Create another reminder and try an ambiguous reply; with a configured key, confirm Curie replies with reminder context and any task write still requires the Confirm button.
- [ ] On a throwaway task, click Skip twice across two newly scheduled reminders and confirm the task stays open. Check its saved JSON for `skip_count`; similarly snooze once and check `snooze_count` increments.
- [ ] Drag the pet and check that the bubble follows. Check it over light and dark wallpaper, in a full-screen space, after sleep/wake, and after closing/reopening it. These visual/OS checks have not been run by Codex.
- [ ] Open **Test reminder bubble** from the right-click menu and confirm the preview opens. Check `curie.log` for `reminder.saved`, `reminder.scheduled`, `reminder.due`, `reminder.bubble-shown`, and any model-route event; there should be no macOS reminder notification dependency.

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

## Pushback, in-app delivery, local intent, and day plans (about 10 minutes)

- [ ] Add a throwaway task due in 35 minutes with an estimate of 120 minutes. When its reminder appears, press **Snooze 10 min**. Confirm the bubble shows the real numbers (needs about 2h, 35m before the deadline, 25m left after snoozing) and offers **Snooze anyway**, **Start 10 min**, and **Keep working**. Confirm nothing resolves until you choose.
- [ ] Type `snooze 10` in the reminder bubble for the same task. Confirm Curie pushes back instead of snoozing, then type `snooze anyway` and confirm it snoozes. Repeat with `skip` / `skip anyway`.
- [ ] Press **Start 10 min** in the pushback panel. Confirm the focus timer starts and the task stays open.
- [ ] Add a timed task, let its reminder appear, and close the bubble. Confirm the pet shows a pink count badge and clicking it reopens the bubble.
- [ ] Create a nudge by adding an estimated task whose deadline is closer than its estimate, with quiet hours temporarily not covering now. Confirm the nudge appears in the panel's **From Curie** list and as a pet badge, with no macOS notification. Press **Got it** and confirm the badge count drops.
- [ ] Send `hi`, `thanks`, `how are you`, and `what is next` in the panel. Confirm replies are instant, sensible, and add no provider-call log lines. Send `hi, here is my work today: ... schedule my day` and confirm it goes to the model.
- [ ] Ask Curie to “schedule my day: 3 physics chapters from MEC to EM waves, starting now”. Confirm one confirmation card lists three blocks with realistic minutes. Confirm and check the panel: one parent plan, three indented child tasks with time ranges and block-start reminders.
- [ ] Ask for a plan that cannot fit before quiet hours. Confirm Curie reports the overrun or drops blocks rather than squeezing them in, and that no card is saved when it rejects the plan.
- [ ] Finish the parent plan from the panel and confirm every child block is also marked done. Repeat with a second plan, deleting the parent instead, and confirm no child block or block reminder is left behind.
