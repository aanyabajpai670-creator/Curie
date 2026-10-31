import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDayPlan } from '../src/core/day-plan.js';

const NOW = Date.parse('2026-10-28T04:30:00Z'); // 10:00 IST
const TIME_ZONE = 'Asia/Kolkata';
const QUIET = { start: '23:00', end: '07:00' };

function plan(overrides = {}) {
  return buildDayPlan({
    title: 'Physics today',
    startIso: '2026-10-28T04:30:00Z',
    blocks: [
      { title: 'Physics: MEC', minutes: 90 },
      { title: 'Physics: Waves', minutes: 60 },
    ],
    now: NOW,
    timeZone: TIME_ZONE,
    quietHours: QUIET,
    ...overrides,
  });
}

test('blocks are stacked in order with a real break between them', () => {
  const result = plan();
  assert.equal(result.children.length, 2);
  assert.equal(result.totalMinutes, 150);
  assert.equal(result.children[0].blockStart, '2026-10-28T04:30:00.000Z');
  assert.equal(result.children[0].blockEnd, '2026-10-28T06:00:00.000Z');
  assert.equal(result.children[1].blockStart, '2026-10-28T06:05:00.000Z');
  assert.equal(result.children[1].blockEnd, '2026-10-28T07:05:00.000Z');
  assert.equal(result.endIso, '2026-10-28T07:05:00.000Z');
  assert.equal(result.parent.title, 'Physics today');
  assert.equal(result.parent.estimateMinutes, 150);
});

test('every block gets its own reminder at its start time', () => {
  const result = plan();
  for (const block of result.children) {
    assert.equal(block.reminder.at, block.blockStart);
    assert.equal(block.due, block.blockEnd);
  }
});

test('a plan that runs into quiet hours is rejected with the block name', () => {
  assert.throws(
    () => plan({
      startIso: '2026-10-28T17:00:00Z', // 22:30 IST
      blocks: [{ title: 'Late chapter', minutes: 45 }],
    }),
    /Late chapter.*quiet hours/,
  );
});

test('a plan that crosses midnight is rejected', () => {
  assert.throws(
    () => buildDayPlan({
      startIso: '2026-10-28T18:15:00Z', // 23:45 IST, outside default quiet for this check
      blocks: [{ title: 'Long set', minutes: 30 }],
      now: NOW,
      timeZone: TIME_ZONE,
      quietHours: { start: '23:00', end: '07:00' },
    }),
    /quiet hours/,
  );
});

test('overlapping work already on the calendar is rejected, not silently double-booked', () => {
  assert.throws(
    () => plan({ busy: [{ start: '2026-10-28T04:45:00Z', end: '2026-10-28T05:15:00Z', title: 'Existing class' }] }),
    /overlaps Existing class/,
  );
});

test('a past start, empty blocks, too many blocks, and bad durations are rejected', () => {
  assert.throws(() => plan({ startIso: '2026-10-27T04:30:00Z' }), /past/);
  assert.throws(() => plan({ blocks: [] }), /at least one block/);
  assert.throws(() => plan({ blocks: Array.from({ length: 13 }, (_, index) => ({ title: `Block ${index}`, minutes: 20 })) }), /at most 12/);
  assert.throws(() => plan({ blocks: [{ title: 'Tiny', minutes: 1 }] }), /5 to 240/);
  assert.throws(() => plan({ blocks: [{ title: '', minutes: 30 }] }), /title/);
  assert.throws(() => plan({ breakMinutes: 45 }), /break_minutes/);
});

test('a plan may start at a future time the user named', () => {
  const result = plan({ startIso: '2026-10-28T12:30:00Z' }); // 18:00 IST
  assert.equal(result.children[0].blockStart, '2026-10-28T12:30:00.000Z');
});

test('the same plan is deterministic for the same clock and inputs', () => {
  assert.deepEqual(plan(), plan());
});
