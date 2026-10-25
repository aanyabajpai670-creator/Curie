import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCursorToDisplays,
  createGazeWatchdog,
  createPetGazeController,
  createResilientTick,
  shouldSendGaze,
} from '../src/core/pet-gaze.js';

const bounds = { x: 100, y: 50, width: 100, height: 100 };

test('a gaze heartbeat recovers a dropped unchanged message', () => {
  const first = { dx: -1, dy: 0 };
  const watchdog = createGazeWatchdog();
  watchdog.receive({ dx: 0, dy: 0 }, 0);
  assert.equal(shouldSendGaze(first, { dx: 0, dy: 0 }, 1, 0), true);
  // The change packet is dropped. The unchanged heartbeat is sent again after 250ms.
  assert.equal(shouldSendGaze(first, first, 250, 1), false);
  assert.equal(shouldSendGaze(first, first, 251, 1), true);
  watchdog.receive(first, 251);
  assert.deepEqual(watchdog.update(252), { dx: -1, dy: 0, timedOut: false, shouldReport: false });
});

test('a polling tick that throws once is caught and later ticks still run', () => {
  let calls = 0;
  const failures = [];
  const safeTick = createResilientTick(() => {
    calls += 1;
    if (calls === 1) throw new Error('temporary');
    return 'alive';
  }, (error) => failures.push(error.message));
  assert.equal(safeTick(), undefined);
  assert.equal(safeTick(), 'alive');
  assert.deepEqual(failures, ['temporary']);
  assert.equal(calls, 2);
});

test('non-finite and out-of-display cursor points are handled safely', () => {
  const displays = [
    { bounds: { x: 0, y: 0, width: 500, height: 400 } },
    { bounds: { x: 500, y: 0, width: 500, height: 400 } },
  ];
  assert.equal(clampCursorToDisplays({ x: NaN, y: 0 }, displays), null);
  assert.deepEqual(clampCursorToDisplays({ x: -100, y: 450 }, displays), { x: 0, y: 399, clamped: true });
  assert.deepEqual(clampCursorToDisplays({ x: 750, y: 50 }, displays), { x: 750, y: 50, clamped: false });
});

test('moving from far left to far right changes gaze in one main-process update', () => {
  const gaze = createPetGazeController();
  assert.deepEqual(gaze.update({ x: -1000, y: 96 }, bounds), { dx: -1, dy: 0 });
  assert.deepEqual(gaze.update({ x: 1000, y: 96 }, bounds), { dx: 1, dy: 0 });
});

test('the renderer watchdog eases stale gaze to centre after 1000ms', () => {
  const watchdog = createGazeWatchdog({ timeoutMs: 1000, easeMs: 200 });
  watchdog.receive({ dx: -1, dy: 1 }, 0);
  assert.deepEqual(watchdog.update(999), { dx: -1, dy: 1, timedOut: false, shouldReport: false });
  assert.deepEqual(watchdog.update(1000), { dx: -1, dy: 1, timedOut: true, shouldReport: true });
  assert.deepEqual(watchdog.update(1100), { dx: -1, dy: 1, timedOut: true, shouldReport: false });
  assert.deepEqual(watchdog.update(1200), { dx: 0, dy: 0, timedOut: true, shouldReport: false });
});
