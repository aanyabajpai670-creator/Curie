# Pet behaviour

The sprite uses 12 frames of 16×16 pixels. Each frame lasts 80 ms. The window keeps a 16-cell width and reserves five extra sprite pixels above the ground for the default hop.

In the desktop app, main owns the calm state. The renderer receives the authoritative state over IPC whenever it changes and on a 250 ms heartbeat; it reports its current animation frame so main can complete a pending settle. A missed state message is repaired by the next heartbeat. Preview mode uses the same state-machine rules locally.

## Modes

| Mode | Motion | Face and gaze | How it changes |
| --- | --- | --- | --- |
| `ACTIVE` | Hops, then rests on frame 0 for a random interval from `restMs`. | Breathes, blinks, and tracks the cursor during rests. | Starts active; a left click begins calming. |
| `WANDER` | Hops continuously while travelling; horizontal position changes only during airborne frames 5–11. | Tracks the cursor. | Entered while there is a horizontal travel target; returns to `ACTIVE` when travel finishes. |
| `CALM pending` | Finishes the current hop to neutral frame 0 or 6, with a blink. | Blinks before settling. | Shown after a left click while the pet is waiting for its neutral frame. A second click returns to `ACTIVE`. |
| `CALM` | Holds the selected neutral frame; never hops. | Breathes, blinks, and tracks the cursor. | Reached when the blink finishes at the next neutral frame. A left click returns to `ACTIVE`. |

### Calm triggers

All triggers call the one main-process `setCalm(value, source)` function and are recorded in `userData/logs/curie.log` with their source. Main clears the wander target on entry and blocks wander ticks and position writes for both `CALM pending` and `CALM`. Leaving calm sets a fresh random wait using the configured `restMs` before another wander target can start.

| Trigger | Action | Log source |
| --- | --- | --- |
| Left click on the pet | Toggle CALM/ACTIVE | `click` |
| Right-click or tray menu **Calm** checkbox | Set the checkbox value | `menu` |
| `Ctrl+Option+C` (`Control+Alt+C` in Electron) | Toggle CALM/ACTIVE | `shortcut` |
| Timer enters its running work/focus phase | Save the prior calm setting and enter CALM | `timer-focus` |
| Timer leaves the work/focus phase | Restore the saved setting only if the user did not change it manually | `timer-focus-end` |
| Legacy `pet:behavior` state API | Map CALM states to calm and ACTIVE/WANDER states to active | `legacy-api` |

Left click toggles between active behavior and calm behavior. The pet opens its control panel from **Open panel** in the right-click menu or the tray menu.

## Hop and rest settings

`assets/behaviour.json` controls the frame rhythm and hop arc:

```json
{
  "frameSize": 16,
  "frameCount": 12,
  "frameMs": 80,
  "liftMax": 5,
  "liftPerFrame": [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 4, 2],
  "restMs": [600, 1600]
}
```

`liftMax` is the headroom, in sprite pixels. `liftPerFrame` gives the lift above the ground for each frame. The renderer still changes sprite frames every 80 ms, while the lift is smoothstepped between those samples at up to 60 renders per second. Frames 5–9 rise to the apex at frame 9; frames 10–11 descend to the landing. Frames 1–3 squash on the ground. A flat outline-colour shadow stays on the ground: it is about 10 pixels wide when landed and shrinks and fades as the pet rises.

`restMs` is `[minimum, maximum]` in milliseconds. The default rest interval is 600–1600 ms. `[0, 0]` disables rests and makes active hopping continuous. WANDER also hops continuously for the duration of travel. CALM suppresses the hop cycle entirely.

The pet window is 16 cells wide and `16 + liftMax` cells high. User scale presets remain 6×, 10×, and 14×.
