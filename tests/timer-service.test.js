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

test('timer service persists actions and restores them after restart', (t) => {
  const userDataPath = tempDirectory(t);
  let now = 10_000;
  const first = createTimerService({ userDataPath, workMinutes: 1, clock: () => now });
  first.dispatch('start');
  now += 12_000;
  first.dispatch('pause');

  const second = createTimerService({ userDataPath, workMinutes: 1, clock: () => now + 50_000 });
  const restored = second.dispatch('status');
  assert.equal(restored.status, 'paused');
  assert.equal(restored.remainingSeconds, 48);
});

test('timer service emits catch-up events after a missed deadline', (t) => {
  const userDataPath = tempDirectory(t);
  let now = 0;
  const events = [];
  const service = createTimerService({
    userDataPath,
    workMinutes: 1,
    breakMinutes: 1,
    clock: () => now,
    notify: (event) => events.push(event),
  });
  service.dispatch('start');
  now = 125_000;
  const recovered = service.refresh();
  assert.equal(recovered.status, 'done');
  assert.deepEqual(events.map((event) => event.phase), ['work', 'break']);
});

test('timer settings update future durations and preserve a paused countdown', (t) => {
  const userDataPath = tempDirectory(t);
  let now = 0;
  const service = createTimerService({ userDataPath, workMinutes: 25, clock: () => now });
  service.dispatch('start');
  now = 60_000;
  service.dispatch('pause');
  const remaining = service.dispatch('status').remainingSeconds;
  service.configure(40, 8);
  assert.equal(service.dispatch('status').remainingSeconds, remaining);
  service.dispatch('reset');
  assert.equal(service.dispatch('status').remainingSeconds, 40 * 60);
});
