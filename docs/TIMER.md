# Study timer

The timer is pure state logic in `src/core/timer.js`. Electron's `timer-service.js` owns the one-second tick, atomic `userData/timer-state.json` writes, notifications, and updates to the tray, panel, debug overlay, and pet. The default schedule comes from `assets/timer.json`:

```json
{
  "focusMinutes": 25,
  "shortBreakMinutes": 5,
  "longBreakMinutes": 15,
  "longBreakEvery": 4
}
```

Running phases store an absolute `endAt`; remaining time is calculated from the current clock. Pausing stores `pausedAt` and the remaining duration at that instant. Ordinary ticks do not write the state file. Start, pause, resume, stop, skip, and phase transitions write only when the persisted timer state changes. A restart catches up elapsed boundaries and emits at most one notification for the catch-up pass.

## State diagram

```text
                         focus 1–3 ends
                      ┌──────────────────> SHORT_BREAK ──break ends──> IDLE
                      │
IDLE ──Start focus──> FOCUS
                      │
                      └─ focus 4, 8, ... ends ──> LONG_BREAK ──break ends──> IDLE

FOCUS / SHORT_BREAK / LONG_BREAK ──Pause──> paused current phase
paused current phase ──Resume──> running current phase
running or paused phase ──Skip──> next phase (or IDLE after a break)
any phase ──Stop──> IDLE
```

Break completion returns to IDLE. The timer waits for the user to start another focus instead of starting one automatically. The long-break counter advances after each completed focus; every fourth completed focus selects LONG_BREAK.

## Trigger table

| Trigger | Timer action | Pet and notification effect |
| --- | --- | --- |
| Native menu: Start focus | Start FOCUS when IDLE | With “Calm during focus” on, calls the main calm owner with source `timer` |
| Native menu: Pause / Resume | Pause or resume the current phase | Countdown preserves its remaining duration |
| Native menu: Skip phase | End the current phase immediately | Starts its next phase or returns to IDLE |
| Native menu: Stop | Return to IDLE | Emits the done placeholder once if a focus has completed |
| `Ctrl+Option+T` | Start from IDLE; pause while running; resume while paused | Same timer service actions as the menu |
| FOCUS ends | Start SHORT_BREAK, or LONG_BREAK every fourth focus | One phase-end notification and a short alert animation |
| Break ends | Return to IDLE | Alert animation; LONG_BREAK completion also plays the done placeholder |
| Timer wake/restart catch-up | Advance to the phase valid at the current time | One catch-up notification, even if more than one boundary elapsed |
| “Calm during focus” preference | Enable or disable timer-owned calm entry | At focus end, restore the previous calm mode only if no manual calm change happened during focus |
| “Show time on pet” preference | Toggle the countdown below the sprite | The label is visible only while a phase is running and ignores pointer input |

The tray tooltip/title shows the current phase and remaining time, with updates capped at once per second. The debug overlay shows the phase, absolute deadline, remaining milliseconds, pause timestamp, completed cycle count, the last five timer actions with their source, and the last notification result.

## Local verification

- `npm test` runs fake-clock transition, persistence, catch-up, pause/resume, cycle, and calm-lease tests without Electron.
- `npm run doctor` checks syntax and verifies that the timer menu, shortcut, preload, main IPC, pet countdown, and phase animation routes are connected.
- To try a short desktop run, temporarily set `focusMinutes` and `shortBreakMinutes` to `1` in `assets/timer.json`, launch with `npm start`, and follow the timer section in `docs/MANUAL_TEST_CHECKLIST.md`. Restore the defaults afterwards.
