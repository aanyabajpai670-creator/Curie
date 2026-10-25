import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyTimer } from '../src/core/timer.js';

function harness(config = {}, initialState) {
  let now = 1_000;
  const timer = new StudyTimer({ clock: () => now, config: { focusMinutes: 1, shortBreakMinutes: 1, longBreakMinutes: 2, longBreakEvery: 4, ...config }, initialState });
  return { timer, advance: (ms) => { now += ms; }, now: () => now };
}

test('four focus sessions select three short breaks then a long break', () => {
  const { timer, advance } = harness();
  const phases = [];
  for (let focus = 0; focus < 4; focus += 1) {
    phases.push(timer.startFocus().phase);
    advance(60_000);
    const endedFocus = timer.status();
    phases.push(endedFocus.phase);
    assert.equal(endedFocus.status, 'running');
    advance(endedFocus.remainingMs);
    assert.equal(timer.status().status, 'idle');
  }
  assert.deepEqual(phases, ['FOCUS', 'SHORT_BREAK', 'FOCUS', 'SHORT_BREAK', 'FOCUS', 'SHORT_BREAK', 'FOCUS', 'LONG_BREAK']);
  assert.equal(timer.status().completedSessions, 4);
  assert.equal(timer.status().cycleCount, 1);
});

test('pause and resume preserve the exact remaining time', () => {
  const { timer, advance } = harness();
  timer.startFocus();
  advance(20_123);
  timer.pause();
  advance(90_000);
  assert.equal(timer.status().remainingMs, 39_877);
  timer.resume();
  assert.equal(timer.status().remainingMs, 39_877);
});

test('skip advances to break and break end returns to idle without auto-starting focus', () => {
  const { timer } = harness();
  assert.equal(timer.startFocus().phase, 'FOCUS');
  assert.equal(timer.skip().phase, 'SHORT_BREAK');
  assert.equal(timer.skip().status, 'idle');
  assert.equal(timer.status().phase, 'IDLE');
});

test('long-break completion and stop after a completed focus emit one done cue', () => {
  const timer = harness().timer;
  for (let focus = 0; focus < 4; focus += 1) {
    timer.startFocus();
    timer.skip();
    if (focus < 3) timer.skip();
  }
  const longBreakEnd = timer.skip();
  assert.equal(longBreakEnd.events.filter((event) => event.type === 'session-complete').length, 1);
  assert.equal(timer.skip().events.filter((event) => event.type === 'session-complete').length, 0);

  const second = harness().timer;
  second.startFocus();
  second.skip();
  assert.equal(second.stop().events.filter((event) => event.type === 'session-complete').length, 1);
  assert.equal(second.stop().events.filter((event) => event.type === 'session-complete').length, 0);
});

test('a 40 minute sleep catch-up reaches idle and reports the elapsed boundaries', () => {
  const { timer, advance, now } = harness();
  timer.startFocus();
  const saved = timer.serialize();
  advance(40 * 60_000);
  const restored = new StudyTimer({ clock: () => now(), config: { focusMinutes: 1, shortBreakMinutes: 1 }, initialState: saved });
  const status = restored.status();
  assert.equal(status.status, 'idle');
  assert.deepEqual(status.events.filter((event) => event.type === 'phase-ended').map((event) => event.phase), ['FOCUS', 'SHORT_BREAK']);
});

test('paused state restores exact remaining time even after a long restart', () => {
  const { timer, advance, now } = harness();
  timer.startFocus();
  advance(30_000);
  timer.pause();
  const restored = new StudyTimer({ clock: () => now() + 3_600_000, config: { focusMinutes: 1 }, initialState: timer.serialize() });
  assert.equal(restored.status().status, 'paused');
  assert.equal(restored.status().remainingMs, 30_000);
  restored.resume();
  assert.equal(restored.status().remainingMs, 30_000);
});

test('invalid persisted state falls back to a clean idle timer', () => {
  const { timer } = harness({}, { status: 'running', phase: 'FOCUS', endAt: null, completedSessions: -1 });
  assert.equal(timer.status().status, 'idle');
  assert.equal(timer.status().phase, 'IDLE');
});
