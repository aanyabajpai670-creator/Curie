import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateEffortMinutes, planReminders } from '../src/core/reminder-plan.js';

const NOW = Date.parse('2026-10-31T15:04:00.000Z'); // 20:34 IST
const TIME_ZONE = 'Asia/Kolkata';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function localHour(iso, timeZone = TIME_ZONE) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}

test('an explicit estimate wins over the scope heuristic', () => {
  assert.equal(estimateEffortMinutes({ title: 'Read a chapter', estimateMinutes: 30 }), 30);
  assert.equal(estimateEffortMinutes({ title: 'x'.repeat(10), estimate_minutes: 500 }), 500);
});

test('scope words raise the estimate above a title-only guess', () => {
  const small = estimateEffortMinutes({ title: 'Submit geostrata article' });
  const big = estimateEffortMinutes({ title: 'Prepare 4 new physics chapters, give mocks, practice numericals and derivations' });
  assert.ok(small > 0 && small <= 120, `small was ${small}`);
  assert.ok(big >= 480, `big was ${big}`);
});

test('a task due in under an hour still gets one reminder soon', () => {
  const due = new Date(NOW + 56 * 60_000).toISOString();
  const plan = planReminders({ title: 'Submit geostrata article', due }, { now: NOW, timeZone: TIME_ZONE });
  assert.equal(plan.length, 1);
  const delay = Date.parse(plan[0]) - NOW;
  assert.ok(delay >= 5 * 60_000 && delay < 56 * 60_000, `delay was ${delay}`);
});

test('a small task days away reminds close to the deadline, not now', () => {
  const due = new Date(NOW + 3 * DAY).toISOString();
  const plan = planReminders({ title: 'Complete the document draft', due, estimateMinutes: 90 }, { now: NOW, timeZone: TIME_ZONE });
  assert.equal(plan.length, 1);
  const hoursBefore = (Date.parse(due) - Date.parse(plan[0])) / HOUR;
  assert.ok(hoursBefore >= 1.9 && hoursBefore <= 2.1, `hours before was ${hoursBefore}`);
});

test('a heavy multi-day task gets a spread of reminders, never more than twice a day', () => {
  const due = new Date(NOW + 23 * DAY).toISOString();
  const task = { title: 'Prepare 4 new physics chapters, give mocks, practice numericals and derivations', due };
  const plan = planReminders(task, { now: NOW, timeZone: TIME_ZONE });

  assert.ok(plan.length >= 20 && plan.length <= 40, `plan length was ${plan.length}`);
  assert.deepEqual(plan, [...new Set(plan)].sort((a, b) => Date.parse(a) - Date.parse(b)));
  for (const iso of plan) {
    const at = Date.parse(iso);
    assert.ok(Number.isFinite(at));
    assert.ok(at > NOW && at < Date.parse(due));
  }

  const perDay = new Map();
  for (const iso of plan) {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(iso));
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  assert.ok([...perDay.values()].some((count) => count >= 2), 'expected at least one day with two reminders');
  assert.ok([...perDay.values()].every((count) => count <= 2), 'never more than two reminders a day');
});

test('quiet hours are never used for planned reminders', () => {
  const due = new Date(NOW + 10 * DAY).toISOString();
  const quietHours = { start: '11:00', end: '19:00' };
  const plan = planReminders(
    { title: 'Prepare 4 chapters', due, estimateMinutes: 600 },
    { now: NOW, timeZone: TIME_ZONE, quietHours },
  );
  assert.ok(plan.length > 0);
  for (const iso of plan) {
    const hour = localHour(iso);
    assert.ok(hour < 11 || hour >= 19, `${iso} landed at ${hour}:00 local`);
  }
});

test('no due date, a past due date, or too little time produces no plan', () => {
  assert.deepEqual(planReminders({ title: 'Something' }, { now: NOW }), []);
  assert.deepEqual(planReminders({ title: 'Late', due: new Date(NOW - HOUR).toISOString() }, { now: NOW }), []);
  assert.deepEqual(planReminders({ title: 'Now', due: new Date(NOW + 30_000).toISOString() }, { now: NOW }), []);
});

test('planning is deterministic for the same clock and settings', () => {
  const task = { title: 'Prepare 4 chapters and mocks', due: new Date(NOW + 12 * DAY).toISOString() };
  assert.deepEqual(
    planReminders(task, { now: NOW, timeZone: TIME_ZONE }),
    planReminders(task, { now: NOW, timeZone: TIME_ZONE }),
  );
});
