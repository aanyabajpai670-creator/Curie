import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyTimer } from '../src/core/timer.js';

function harness(initialState) {
  let now = 1_000;
  const timer = new StudyTimer({ clock: () => now, workMinutes: 1, breakMinutes: 1, initialState });
  return { timer, advance: (ms) => { now += ms; }, now: () => now };
}

test('start, pause, resume, and status preserve remaining time', () => {
  const { timer, advance } = harness();
  assert.equal(timer.start().status, 'running');
  advance(20_000);
  assert.equal(timer.status().remainingSeconds, 40);
  assert.equal(timer.pause().status, 'paused');
  advance(30_000);
  assert.equal(timer.status().remainingSeconds, 40);
  assert.equal(timer.resume().status, 'running');
  assert.equal(timer.status().remainingSeconds, 40);
});

test('reset returns to an idle work session', () => {
  const { timer, advance } = harness();
  timer.start();
  advance(10_000);
  const reset = timer.reset();
  assert.equal(reset.status, 'idle');
  assert.equal(reset.phase, 'work');
  assert.equal(reset.remainingSeconds, 60);
});

test('work end starts a break and break end finishes the cycle', () => {
  const { timer, advance } = harness();
  timer.start();
  advance(60_000);
  const workEnd = timer.status();
  assert.equal(workEnd.phase, 'break');
  assert.equal(workEnd.status, 'running');
  assert.equal(workEnd.events[0].phase, 'work');
  advance(60_000);
  assert.equal(timer.status().status, 'done');
  assert.equal(timer.status().phase, 'work');
});

test('skip moves work to break and skipped break ends the cycle', () => {
  const { timer } = harness();
  timer.start();
  assert.equal(timer.skip().phase, 'break');
  assert.equal(timer.skip().status, 'done');
});

test('a restored running deadline catches up after a long sleep', () => {
  const { timer, advance } = harness();
  timer.start();
  const saved = timer.serialize();
  advance(125_000);
  const restored = new StudyTimer({
    clock: () => 126_000,
    workMinutes: 1,
    breakMinutes: 1,
    initialState: saved,
  });
  const status = restored.status();
  assert.equal(status.status, 'done');
  assert.equal(status.completedSessions, 1);
  assert.equal(status.events.length, 2);
  assert.deepEqual(status.events.map((event) => event.phase), ['work', 'break']);
});

test('persisted pause survives restart without counting sleep time', () => {
  const { timer, advance, now } = harness();
  timer.start();
  advance(30_000);
  const paused = timer.pause();
  const restored = new StudyTimer({
    clock: () => now() + 3_600_000,
    workMinutes: 1,
    breakMinutes: 1,
    initialState: timer.serialize(),
  });
  assert.equal(restored.status().status, 'paused');
  assert.equal(restored.status().remainingSeconds, 30);
  assert.equal(paused.status, 'paused');
});

test('invalid persisted state falls back to a clean timer', () => {
  const { timer } = harness({ status: 'running', phase: 'work', endsAt: null, remainingMs: -1 });
  assert.equal(timer.status().status, 'idle');
});
