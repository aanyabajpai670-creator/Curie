import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePushback } from '../src/core/pushback.js';

const H = 60 * 60 * 1000;
const pb = (deferralCount, dueInMs) => evaluatePushback({ deferralCount, dueInMs }).pushBack;

test('1st snooze: push back only if overdue or due within 2h', () => {
  assert.equal(pb(0, 5 * H), false);
  assert.equal(pb(0, 1 * H), true);
  assert.equal(pb(0, -1), true);
});

test('2nd snooze: push back if overdue or due within 24h', () => {
  assert.equal(pb(1, 30 * H), false);
  assert.equal(pb(1, 20 * H), true);
  assert.equal(pb(1, -1), true);
});

test('3rd snooze and beyond: always push back', () => {
  assert.equal(pb(2, 500 * H), true);
  assert.equal(pb(6, null), true);
});

test('no due date: push back only from the 3rd snooze', () => {
  assert.equal(pb(0, null), false);
  assert.equal(pb(1, null), false);
  assert.equal(pb(0, undefined), false);
  assert.equal(pb(2, null), true);
});

test('boundaries are strict: exactly 2h and 24h count as within', () => {
  assert.equal(pb(0, 2 * H), true);
  assert.equal(pb(0, 2 * H + 1), false);
  assert.equal(pb(1, 24 * H), true);
  assert.equal(pb(1, 24 * H + 1), false);
});

test('bad deferralCount is treated as zero', () => {
  assert.equal(pb(-5, 5 * H), false);
  assert.equal(pb(undefined, 5 * H), false);
});

test('facts contain only numbers, booleans or null', () => {
  const { facts } = evaluatePushback({ deferralCount: 1, dueInMs: 3 * H });
  for (const v of Object.values(facts)) {
    assert.ok(typeof v === 'number' || typeof v === 'boolean' || v === null);
  }
});

test('is pure: same input gives same output', () => {
  assert.deepEqual(
    evaluatePushback({ deferralCount: 2, dueInMs: H }),
    evaluatePushback({ deferralCount: 2, dueInMs: H }),
  );
});
