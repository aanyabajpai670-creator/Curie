import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPushback, deferralCountOf } from '../src/core/reminder-reply.js';

const HOUR = 60 * 60 * 1000;
// Fixed "now" so every test is deterministic; buildPushback never calls Date.now().
const NOW = Date.parse('2026-10-31T12:00:00.000+05:30');

test('deferralCountOf sums snoozes and skips', () => {
  assert.equal(deferralCountOf({ snooze_count: 1, skip_count: 1 }), 2);
});

test('deferralCountOf counts only non-negative integers', () => {
  assert.equal(deferralCountOf({ snooze_count: -1, skip_count: 2.5 }), 0);
  assert.equal(deferralCountOf({ snooze_count: '3', skip_count: null }), 0);
  assert.equal(deferralCountOf(undefined), 0);
});

test('due in 1 hour with first deferral pushes back', () => {
  const task = { reminder: {}, due: new Date(NOW + HOUR).toISOString() };
  const result = buildPushback(task, NOW);
  assert.equal(result.pushBack, true);
  assert.equal(result.facts.snoozeNumber, 1);
});

test('due in 3 days with first deferral does not push back', () => {
  const task = { reminder: {}, due: new Date(NOW + 3 * 24 * HOUR).toISOString() };
  assert.equal(buildPushback(task, NOW).pushBack, false);
});

test('no due date pushes back only from the third deferral', () => {
  // deferralCount 1 -> this is the 2nd deferral (n = 2): no pushback without a due date.
  assert.equal(buildPushback({ reminder: { snooze_count: 1 } }, NOW).pushBack, false);
  // deferralCount 2 -> this is the 3rd deferral (n = 3): always push back.
  assert.equal(buildPushback({ reminder: { snooze_count: 1, skip_count: 1 } }, NOW).pushBack, true);
});

test('invalid due string is treated as no due date', () => {
  const secondDeferral = buildPushback({ reminder: { skip_count: 1 }, due: 'not a date' }, NOW);
  assert.equal(secondDeferral.pushBack, false);
  assert.equal(secondDeferral.facts.hasDueDate, false);
  // Same invalid string, but the 3rd deferral still pushes back, like a missing due date.
  const thirdDeferral = buildPushback({ reminder: { snooze_count: 2 }, due: 'garbage' }, NOW);
  assert.equal(thirdDeferral.pushBack, true);
});