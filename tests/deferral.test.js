import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDeferral, assessDeferralGroup, formatMinutes } from '../src/core/deferral.js';

const MINUTE = 60_000;

test('snoozing a task that cannot fit before its deadline is strong pushback', () => {
  const result = assessDeferral({ action: 'snooze', title: 'Submit article', estimateMinutes: 120, dueInMs: 35 * MINUTE, snoozeMinutes: 10 });
  assert.equal(result.level, 'strong');
  assert.equal(result.requireConfirm, true);
  assert.match(result.message, /needs about 2h/);
  assert.match(result.message, /35m before the deadline/);
  assert.match(result.message, /25m left/);
  assert.equal(result.facts.slackMinutes, -95);
});

test('an overdue task with effort left is strong pushback', () => {
  const result = assessDeferral({ action: 'snooze', estimateMinutes: 30, dueInMs: -5 * MINUTE });
  assert.equal(result.level, 'strong');
  assert.match(result.message, /0m before the deadline/);
});

test('a tight but feasible plan warns without blocking', () => {
  const result = assessDeferral({ action: 'snooze', estimateMinutes: 120, dueInMs: 150 * MINUTE, snoozeMinutes: 10 });
  assert.equal(result.level, 'warn');
  assert.equal(result.requireConfirm, false);
  assert.match(result.message, /1h 40m|2h 20m/);
});

test('plenty of slack produces no pushback', () => {
  const result = assessDeferral({ action: 'snooze', estimateMinutes: 60, dueInMs: 8 * 60 * MINUTE });
  assert.equal(result.level, 'none');
  assert.equal(result.message, '');
});

test('repeated deferrals escalate even when the deadline is far away', () => {
  assert.equal(assessDeferral({ action: 'skip', estimateMinutes: 60, dueInMs: 48 * 60 * MINUTE, deferralCount: 2 }).level, 'warn');
  assert.equal(assessDeferral({ action: 'skip', estimateMinutes: 60, dueInMs: 48 * 60 * MINUTE, deferralCount: 3 }).level, 'strong');
});

test('skip uses the time left without a snooze deduction', () => {
  const result = assessDeferral({ action: 'skip', estimateMinutes: 90, dueInMs: 60 * MINUTE, snoozeMinutes: 10 });
  assert.equal(result.level, 'strong');
  assert.match(result.message, /skipping this/);
  assert.equal(result.facts.snoozeMinutes, 0);
});

test('done is never pushed back on', () => {
  assert.equal(assessDeferral({ action: 'done', estimateMinutes: 120, dueInMs: 5 * MINUTE }).level, 'none');
});

test('tasks without an estimate or due date fall back to the deferral count', () => {
  assert.equal(assessDeferral({ action: 'snooze', deferralCount: 0 }).level, 'none');
  assert.equal(assessDeferral({ action: 'snooze', deferralCount: 2 }).level, 'warn');
  assert.equal(assessDeferral({ action: 'snooze', deferralCount: 3 }).level, 'strong');
});

test('messages use readable durations', () => {
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(60), '1h');
  assert.equal(formatMinutes(95), '1h 35m');
  assert.equal(formatMinutes(-30), '0m');
});

test('a group keeps the worst warning and says how many reminders it affects', () => {
  const results = [
    { id: 'a', title: 'Read notes', estimateMinutes: 30, dueInMs: 8 * 60 * MINUTE, deferralCount: 0 },
    { id: 'b', title: 'Submit article', estimateMinutes: 120, dueInMs: 35 * MINUTE, deferralCount: 0 },
  ];
  const group = assessDeferralGroup(results, { action: 'snooze', snoozeMinutes: 10 });
  assert.equal(group.level, 'strong');
  assert.equal(group.requireConfirm, true);
  assert.match(group.message, /^2 reminders\./);
  assert.match(group.message, /Submit article/);
  assert.equal(group.items.find((item) => item.id === 'a').level, 'none');
  assert.equal(group.items.find((item) => item.id === 'b').level, 'strong');
});

test('an empty or healthy group never pushes back', () => {
  assert.equal(assessDeferralGroup([], { action: 'snooze' }).level, 'none');
  const group = assessDeferralGroup([{ id: 'a', title: 'Read', estimateMinutes: 30, dueInMs: 48 * 60 * MINUTE, deferralCount: 0 }], { action: 'snooze' });
  assert.equal(group.level, 'none');
  assert.equal(group.message, '');
});
