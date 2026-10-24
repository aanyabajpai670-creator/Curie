import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNudges, isQuietTime, localClock } from '../src/core/nudges.js';

function task(overrides = {}) {
  return {
    id: 'physics',
    title: 'Physics revision',
    due: '2026-10-24T11:00:00.000Z',
    estimateMinutes: 120,
    status: 'todo',
    ...overrides,
  };
}

test('deadline pressure queues a short nudge when remaining time is too short', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  const result = evaluateNudges([task()], now);
  assert.equal(result.nudges.length, 1);
  assert.match(result.nudges[0].message, /may need more time/);
});

test('tasks with enough time, missing estimates, or done status are skipped', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  const result = evaluateNudges(
    [
      task({ id: 'safe', due: '2026-10-26T10:00:00.000Z' }),
      task({ id: 'unknown', estimateMinutes: null }),
      task({ id: 'done', status: 'done' }),
    ],
    now,
  );
  assert.deepEqual(result.nudges, []);
});

test('quiet hours cover the overnight interval and exclude its end', () => {
  assert.equal(isQuietTime(23 * 60 + 30), true);
  assert.equal(isQuietTime(6 * 60 + 59), true);
  assert.equal(isQuietTime(7 * 60), false);
  assert.equal(isQuietTime(12 * 60), false);
});

test('Asia/Kolkata date and quiet-hour checks use the configured timezone', () => {
  const utc = Date.parse('2026-10-24T18:00:00Z');
  const local = localClock(utc, 'Asia/Kolkata');
  assert.equal(local.dateKey, '2026-10-24');
  assert.equal(local.minuteOfDay, 23 * 60 + 30);
  assert.equal(isQuietTime(local.minuteOfDay), true);
});

test('daily cap and duplicate suppression survive evaluations; next local day resets', () => {
  const now = Date.parse('2026-10-24T10:00:00Z');
  const result = evaluateNudges(
    [
      task({ id: 'one' }),
      task({ id: 'two', title: 'Chemistry', due: '2026-10-24T11:30:00Z' }),
      task({ id: 'three', title: 'History', due: '2026-10-24T11:00:00Z' }),
    ],
    now,
    { maxPerDay: 2 },
  );
  assert.equal(result.nudges.length, 2);
  const sameDay = evaluateNudges(
    [task({ id: 'four' })],
    now,
    { maxPerDay: 2 },
    result.state,
  );
  assert.equal(sameDay.nudges.length, 0);
  const nextDay = evaluateNudges(
    [task({ id: 'four' })],
    Date.parse('2026-10-25T10:00:00Z'),
    { maxPerDay: 2 },
    result.state,
  );
  assert.equal(nextDay.state.dateKey, '2026-10-25');
  assert.equal(nextDay.nudges.length, 1);
});

test('invalid quiet-hour values fail validation', () => {
  assert.throws(
    () => isQuietTime(100, { start: '24:00', end: '07:00' }),
    /HH:MM/,
  );
});
