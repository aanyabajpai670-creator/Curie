# Pet behaviour hand tests

## Desktop reliability checks (about 2 minutes each)

### 1. Diagnostics overlay

1. Right-click the pet and choose **Debug overlay**. Confirm a monospace, click-through window appears just above the pet and refreshes its values several times per second.
2. Check that it shows pet bounds, display id/work area, raw cursor, vector, gaze offset, gaze receipt age, state, and up to five position writes with source labels.
3. Turn it off and on again. Quit and relaunch; confirm the checked state is remembered. Inspect `userData/logs/curie.log` for anomaly lines and confirm repeated anomalies are rate-limited.

### 2. Position ownership, drag, and wander

1. Turn on the overlay. Drag the pet by a large diagonal distance and release. It should track the cursor without snapping; the last position write should say `drag` or `clamp`. Drag it outside the central wander strip but within a display work area; it must stay there.
2. Drag across a display edge if you have multiple displays. Confirm it stays within the union of their work areas. Release and relaunch; only the released position should be restored.
3. Let the pet hop until it wanders. Confirm the overlay records `wander`, x changes only during airborne frames, and CALM or dragging pauses movement.

### 3. Gaze delivery and recovery

1. Enable the overlay. Move the cursor far left of the pet, then far right. The gaze should change from `dx=-1` to `dx=+1` within a poll/heartbeat; it must not remain stuck left.
2. Move the cursor near and around the vertical dead zone, then clearly above and below the pet. Confirm the displayed gaze follows the current main-process result. The receipt age should stay below 250 ms during normal operation.
3. The unit tests simulate a dropped message, out-of-display and NaN points, a throwing tick, and the 1000 ms watchdog timeout. On a live run, confirm `curie.log` gets a rate-limited watchdog anomaly if gaze messages stop.

### 4. Downward eye pose

1. Move the cursor just below the pet but within the vertical dead zone. The eyes should remain centered vertically.
2. Move clearly below. Both eyes should lower by one sprite row and show only their lower two cells; the top cell should disappear and the blush row should remain untouched.
3. Move back through the hysteresis zone and above the pet. Confirm the pose returns to center/up. Trigger a blink and confirm its existing one-row blink line is unchanged.

### 5. Static doctor and real Electron smoke

1. Run `npm run doctor`; it should report syntax checks and all IPC routes.
2. Run `node tests/electron-smoke.js` on a host where Electron can launch. The runner launches `npm start`, waits for the pet renderer, records bounds, calls the real preload drag IPC methods with controlled test cursor points, asserts changed bounds, checks `curie.log`, and exits the app. Keep its exact output with the test notes.

## Preview page

1. Run `npm run preview` and open the preview URL printed by the server. Use the default 10× scale.
2. Wait for `asset status: ready`. Watch several hops: the sprite should lift visibly, reach its apex around frames 9–10, land on frame 0, and show a ground shadow that shrinks and fades in the air.
3. During `ACTIVE`, confirm frame 0 rests last for a varying interval, then hopping resumes. Move the pointer around the pet during a rest and confirm its eyes follow. Set `restMs` to `[0, 0]` in `assets/behaviour.json`, reload, and confirm there is no rest between hops; restore `[600, 1600]` afterward.
4. Click the canvas itself with the left mouse button. The debug readout should change from `ACTIVE` or `WANDER` to `CALM pending`, then to `CALM` at frame 0 or 6. The eyes should blink during the transition. Confirm the pet holds that neutral frame and breathes without hopping. Click the canvas again; the readout should return to `ACTIVE` and hopping should resume.
5. Right-click the canvas and choose **Open panel**. Confirm the preview panel opens. Repeat with a size choice and confirm the pet width changes while the lift headroom remains.
6. Watch for `WANDER` during a travel interval. Confirm x movement occurs only on frames 5–11, y stays fixed, and hops continue without rests until travel ends.

The automated click test in `tests/pet-behavior.test.js` dispatches the same `pet.click` event emitted by the canvas interaction handler. The browser-preview step above verifies the actual DOM pointer path and its visible readout.

## Desktop app

1. Start the app with `npm start` on a machine where Electron launches. Confirm the pet window has the same apparent scale and hop as the preview.
2. Left-click the pet: it should calm after a blink and settle on frame 0 or 6. Left-click again to reactivate it.
3. Right-click the pet and choose **Open panel**. Confirm the control panel opens. Confirm the tray menu's **Open panel** item does the same.
4. Drag the pet while it is active. Confirm dragging works and WANDER motion pauses while dragging.
