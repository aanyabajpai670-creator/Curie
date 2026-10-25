import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTimerService } from '../src/main/timer-service.js';

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-timer-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('timer service persists state changes atomically and restores after restart', (t) => {
  const userDataPath = tempDirectory(t);
  let now = 10_000;
  const first = createTimerService({ userDataPath, config: { focusMinutes: 1 }, clock: () => now });
  first.dispatch('startFocus');
  now += 12_000;
  first.dispatch('pause');
  const second = createTimerService({ userDataPath, config: { focusMinutes: 1 }, clock: () => now + 50_000 });
  const restored = second.dispatch('status');
  assert.equal(restored.status, 'paused');
  assert.equal(restored.remainingSeconds, 48);
  assert.ok(Number.isFinite(restored.pausedAt));
});

test('40 minute catch-up sends exactly one notification and logs the recovered phases', (t) => {
  const userDataPath = tempDirectory(t);
  let now = 0;
  const notifications = [];
  const service = createTimerService({
    userDataPath,
    config: { focusMinutes: 25 / 60, shortBreakMinutes: 5 / 60 },
    clock: () => now,
    notify: (event) => { notifications.push(event); return true; },
  });
  service.dispatch('startFocus');
  now = 40 * 60_000;
  const recovered = service.refresh();
  assert.equal(recovered.status, 'idle');
  assert.equal(notifications.length, 1);
  assert.equal(recovered.lastNotification.shown, true);
  assert.equal(recovered.timerEvents.at(-1).source, 'timer');
});

test('a missing or corrupted state file falls back to IDLE with a log line', (t) => {
  const userDataPath = tempDirectory(t);
  const lines = [];
  createTimerService({ userDataPath, log: (line) => lines.push(line) });
  assert.ok(lines.includes('timer.state.missing'));
  fs.writeFileSync(path.join(userDataPath, 'timer-state.json'), '{broken', 'utf8');
  const second = createTimerService({ userDataPath, log: (line) => lines.push(line) });
  assert.equal(second.status().phase, 'IDLE');
  assert.ok(lines.includes('timer.state.corrupt'));
});

test('ordinary ticks do not write state while start, pause, and resume do', (t) => {
  const userDataPath = tempDirectory(t);
  let now = 0;
  let writes = 0;
  const service = createTimerService({
    userDataPath,
    config: { focusMinutes: 60 },
    clock: () => now,
    writeState: (directory, fileName, contents) => {
      writes += 1;
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, fileName), contents);
    },
  });
  service.dispatch('startFocus');
  assert.equal(writes, 1);
  for (let second = 1; second <= 60; second += 1) {
    now = second * 1000;
    service.refresh();
  }
  assert.equal(writes, 1);
  service.dispatch('pause');
  service.dispatch('resume');
  assert.equal(writes, 3);
});

test('timer action errors are logged and do not escape the service boundary', (t) => {
  const userDataPath = tempDirectory(t);
  const lines = [];
  const service = createTimerService({ userDataPath, log: (line) => lines.push(line) });
  assert.equal(service.dispatch('not-an-action').status, 'idle');
  assert.ok(lines.some((line) => line.startsWith('timer.error.not-an-action')));
});
