import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDueReminders, matchReminderReply, reminderContext, reminderReplyFailure } from '../src/core/reminder-reply.js';

test('local reminder matcher accepts whole short commands only', () => {
  const cases = [
    ['snooze', { route: 'local', action: 'snooze', minutes: 10 }],
    ['snooze 20 min', { route: 'local', action: 'snooze', minutes: 20 }],
    ['done', { route: 'local', action: 'done' }],
    ['ok', { route: 'local', action: 'shown' }],
    ['finished', { route: 'local', action: 'done' }],
    ['finised', { route: 'local', action: 'done' }],
    ['skip', { route: 'local', action: 'skip' }],
    ['dismiss', { route: 'local', action: 'skip' }],
    ['snooze 20', { route: 'local', action: 'snooze', minutes: 20 }],
    ['snoz 20 min', { route: 'local', action: 'snooze', minutes: 20 }],
    ['in 1 hour', { route: 'local', action: 'snooze', minutes: 60 }],
    ['20 minutes', { route: 'local', action: 'snooze', minutes: 20 }],
    ['got it', { route: 'local', action: 'shown' }],
    ['okay', { route: 'local', action: 'shown' }],
  ];
  for (const [text, expected] of cases) assert.deepEqual(matchReminderReply(text), expected, text);
  for (const text of ['why would you allow me to snooze', 'can i snooze?', "don't snooze it", '?']) {
    assert.deepEqual(matchReminderReply(text), { route: 'model' }, text);
  }
});

test('ambiguous reminder replies route to the agent model', () => {
  assert.deepEqual(matchReminderReply('I am worried I will not finish before class'), { route: 'model' });
  assert.deepEqual(matchReminderReply('could you help me choose what to do first?'), { route: 'model' });
});

test('reminder context has the agreed shape and safe pushback default', () => {
  const value = reminderContext({ id: 't-1', title: 'Read notes', status: 'todo', subject: 'Biology' }, { scheduledAt: '2026-10-26T10:00:00Z' });
  assert.deepEqual(value, { title: 'Read notes', due: '2026-10-26T10:00:00Z', deferral_count: 0, pushback: { pushBack: false }, facts: { task_id: 't-1', status: 'todo', subject: 'Biology' } });
});

test('provider failure has a clear offline fallback and no message text', () => {
  assert.equal(reminderReplyFailure(new Error('Both providers failed: rate limit / offline')), "Can't think right now, use the buttons.");
  assert.equal(reminderReplyFailure(new Error('Curie could not complete this request')), 'Curie could not process that reply. Please try again or use the buttons.');
});

test('due reminders group as one bubble with a missed count', () => {
  const group = groupDueReminders([
    { task: { id: 'a', title: 'Essay' }, scheduledAt: '2026-10-25T10:00:00Z', missed: true },
    { task: { id: 'b', title: 'Quiz' }, scheduledAt: '2026-10-26T10:00:00Z', missed: false },
  ]);
  assert.deepEqual(group, { count: 2, missedCount: 1, items: [
    { id: 'a', title: 'Essay', due: '2026-10-25T10:00:00Z', missed: true },
    { id: 'b', title: 'Quiz', due: '2026-10-26T10:00:00Z', missed: false },
  ] });
});

test('"snooze anyway" and "skip anyway" confirm after pushback', () => {
  assert.deepEqual(matchReminderReply('snooze anyway'), { route: 'local', action: 'snooze', minutes: 10, confirm: true });
  assert.deepEqual(matchReminderReply('snooze 20 min anyway'), { route: 'local', action: 'snooze', minutes: 20, confirm: true });
  assert.deepEqual(matchReminderReply('skip anyway'), { route: 'local', action: 'skip', confirm: true });
  assert.deepEqual(matchReminderReply('done anyway'), { route: 'local', action: 'done', confirm: true });
});
