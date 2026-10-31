// Local, deterministic day planning.
// The model decomposes a request into named blocks with durations; this module
// owns the arithmetic: it stacks the blocks into real times, inserts breaks,
// refuses to run past the day or quiet hours, and refuses to double-book work
// that already has a block. No provider call is involved.

import { isQuietTime } from './nudges.js';
import { localParts } from './reminder-plan.js';

const MINUTE = 60_000;
const MAX_BLOCKS = 12;
const MIN_BLOCK = 5;
const MAX_BLOCK = 240;

export function buildDayPlan({
  title = '',
  startIso,
  blocks = [],
  subject = '',
  breakMinutes = 5,
  now = Date.now(),
  timeZone = 'Asia/Kolkata',
  quietHours = { start: '23:00', end: '07:00' },
  busy = [],
} = {}) {
  const planTitle = optionalText(title, 'title', 200) || 'Day plan';
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) throw new TypeError('start_iso must be a valid ISO timestamp.');
  if (start < now - 5 * MINUTE) throw new TypeError('start_iso must not be in the past.');
  if (!Array.isArray(blocks) || blocks.length === 0) throw new TypeError('Give at least one block.');
  if (blocks.length > MAX_BLOCKS) throw new TypeError(`A day plan can hold at most ${MAX_BLOCKS} blocks.`);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 30) {
    throw new TypeError('break_minutes must be an integer from 0 to 30.');
  }
  const startParts = localParts(start, timeZone);
  if (isQuietTime(startParts.hour * 60 + startParts.minute, quietHours)) {
    throw new TypeError('start_iso falls inside quiet hours.');
  }

  const normalizedBusy = busy
    .map((item) => ({
      start: Date.parse(item.start),
      end: Date.parse(item.end),
      title: optionalText(item.title, 'busy title', 200) || 'another block',
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);

  const children = [];
  let cursor = start;
  for (const [index, block] of blocks.entries()) {
    const blockTitle = requiredText(block?.title, `blocks[${index}].title`, 200);
    const minutes = block?.minutes;
    if (!Number.isInteger(minutes) || minutes < MIN_BLOCK || minutes > MAX_BLOCK) {
      throw new TypeError(`blocks[${index}].minutes must be an integer from ${MIN_BLOCK} to ${MAX_BLOCK}.`);
    }
    const blockStart = cursor;
    const blockEnd = cursor + minutes * MINUTE;
    const endParts = localParts(blockEnd, timeZone);
    if (endParts.year !== startParts.year || endParts.month !== startParts.month || endParts.day !== startParts.day) {
      throw new TypeError(`“${blockTitle}” runs past midnight. Shorten the plan or drop a block.`);
    }
    if (isQuietTime(endParts.hour * 60 + endParts.minute, quietHours)) {
      throw new TypeError(`“${blockTitle}” runs into quiet hours (${quietHours.start}–${quietHours.end}). Shorten the plan or drop a block.`);
    }
    const conflict = normalizedBusy.find((item) => blockStart < item.end && blockEnd > item.start);
    if (conflict) {
      throw new TypeError(`“${blockTitle}” overlaps ${conflict.title}. Pick a later start or drop a block.`);
    }
    children.push({
      title: blockTitle,
      subject: optionalText(block?.subject, `blocks[${index}].subject`, 120) || optionalText(subject, 'subject', 120),
      estimateMinutes: minutes,
      due: new Date(blockEnd).toISOString(),
      blockStart: new Date(blockStart).toISOString(),
      blockEnd: new Date(blockEnd).toISOString(),
      reminder: { at: new Date(blockStart).toISOString() },
    });
    cursor = index < blocks.length - 1 ? blockEnd + breakMinutes * MINUTE : blockEnd;
  }

  const totalMinutes = children.reduce((sum, child) => sum + child.estimateMinutes, 0);
  return {
    parent: { title: planTitle, estimateMinutes: totalMinutes, notes: 'Day plan' },
    children,
    totalMinutes,
    startIso: new Date(start).toISOString(),
    endIso: children.at(-1).blockEnd,
  };
}

function requiredText(value, name, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new TypeError(`${name} must be 1 to ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalText(value, name, maxLength) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new TypeError(`${name} must be at most ${maxLength} characters.`);
  }
  return value.trim();
}
