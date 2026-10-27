import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkReminders,
  getScheduledAt,
  isReminderMissed,
  resolveReminder,
} from '../src/core/scheduler.js';

const task = {
  id: 'a',
  title: 'Review physics',
  status: 'todo',
  due: '2026-11-10T12:30:00.000Z',
  reminder: {
    at: '2026-11-10T12:00:00.000Z',
    minutesBefore: null,
    nextAt: null,
    firedAt: null,
    dismissed: false,
  },
};

test('reminder missed label distinguishes live due, startup/resume catch-up, and late display', () => {
  const due = Date.parse(task.reminder.at);
  assert.equal(isReminderMissed({ scheduledAt: due, now: due, source: 'tick' }), false);
  assert.equal(isReminderMissed({ scheduledAt: due, now: due + 4 * 60_000, source: 'tick' }), false);
  assert.equal(isReminderMissed({ scheduledAt: due, now: due + 1, source: 'startup' }), true);
  assert.equal(isReminderMissed({ scheduledAt: due, now: due + 1, source: 'resume' }), true);
  assert.equal(isReminderMissed({ scheduledAt: due, now: due + 5 * 60_000, shownAt: due + 5 * 60_000 }), false);
  assert.equal(isReminderMissed({ scheduledAt: due, now: due + 5 * 60_000 + 1, shownAt: due + 5 * 60_000 + 1 }), true);
  assert.equal(checkReminders([task], due, { source: 'tick' }).fired[0].missed, false);
  assert.equal(checkReminders([task], due + 1, { source: 'resume' }).fired[0].missed, true);
});

test('exact-time reminder fires once and stays Due now when promptly displayed', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  const result = checkReminders([task], now, { source: 'tick' });
  assert.equal(result.fired.length, 1);
  assert.equal(result.fired[0].missed, false);
  assert.equal(result.tasks[0].reminder.state, 'due');
  assert.equal(result.tasks[0].reminder.dueAt, task.reminder.at);
  assert.equal(checkReminders(result.tasks, now).fired.length, 0);
});

test('before-due reminder uses the due instant across timezone offsets', () => {
  const offsetTask = {
    ...task,
    due: '2026-11-10T18:00:00+05:30',
    reminder: {
      at: null,
      minutesBefore: 30,
      nextAt: null,
      firedAt: null,
      dismissed: false,
    },
  };
  assert.equal(getScheduledAt(offsetTask), Date.parse('2026-11-10T12:00:00Z'));
});

test('snooze and skip counters persist; skip leaves the linked task open', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const snoozed = resolveReminder([task], task.id, 'snooze', now)[0];
  assert.equal(snoozed.reminder.state, 'snoozed');
  assert.equal(snoozed.reminder.deferralCount, 1);
  assert.equal(snoozed.reminder.snooze_count, 1);
  assert.equal(getScheduledAt(snoozed), now + 10 * 60_000);
  const twentyMinuteSnooze = resolveReminder([task], task.id, 'snooze', now, 20)[0];
  assert.equal(getScheduledAt(twentyMinuteSnooze), now + 20 * 60_000);
  const completed = resolveReminder([task], task.id, 'done', now)[0];
  assert.equal(completed.status, 'done');
  assert.equal(completed.reminder.state, 'done');
  assert.equal(getScheduledAt(completed), null);
  const skipped = resolveReminder([snoozed], task.id, 'skip', now)[0];
  assert.equal(skipped.reminder.dismissed, true);
  assert.equal(skipped.reminder.state, 'dismissed');
  assert.equal(skipped.reminder.skip_count, 1);
  assert.equal(skipped.status, 'todo');
});

test('wall-clock jumps are classified as missed when the due reminder is displayed late', () => {
  const due = Date.parse(task.reminder.at);
  const exact = checkReminders([task], due).fired[0];
  assert.equal(exact.missed, false);
  const afterSleep = checkReminders([task], due + 8 * 60 * 60_000).fired[0];
  assert.equal(afterSleep.missed, false);
  assert.equal(isReminderMissed({ scheduledAt: afterSleep.scheduledAt, now: due + 8 * 60 * 60_000, shownAt: due + 8 * 60 * 60_000, source: 'tick' }), true);
  assert.equal(afterSleep.scheduledAt, task.reminder.at);
});
