import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkReminders,
  getScheduledAt,
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

test('exact-time reminder fires once and labels late catch-up', () => {
  const now = Date.parse('2026-11-10T12:05:00.000Z');
  const result = checkReminders([task], now);
  assert.equal(result.fired.length, 1);
  assert.equal(result.fired[0].missed, true);
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

test('snooze requeues for ten minutes and done/dismiss resolve reminders', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const snoozed = resolveReminder([task], task.id, 'snooze', now)[0];
  assert.equal(getScheduledAt(snoozed), now + 10 * 60_000);
  const completed = resolveReminder([task], task.id, 'done', now)[0];
  assert.equal(completed.status, 'done');
  assert.equal(getScheduledAt(completed), null);
  const dismissed = resolveReminder([task], task.id, 'dismiss', now)[0];
  assert.equal(dismissed.reminder.dismissed, true);
});
