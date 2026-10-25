import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReminderTime } from '../src/agent/reminder-time.js';

const now = Date.parse('2026-10-25T15:15:00+05:30');

test('local time phrases resolve against the Asia/Kolkata fake clock', () => {
  assert.equal(parseReminderTime('at 3:20 pm', now), '2026-10-25T09:50:00.000Z');
  assert.equal(parseReminderTime('in 2 minutes', now), '2026-10-25T09:47:00.000Z');
});

test('a time that has already passed today returns a visible validator error', () => {
  assert.throws(() => parseReminderTime('at 3:10 pm', now), /already passed today/i);
});
