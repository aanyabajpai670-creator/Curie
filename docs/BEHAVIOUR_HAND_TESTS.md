# Pet behaviour hand tests

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
