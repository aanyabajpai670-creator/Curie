// Local, deterministic reminder planning.
// Curie estimates how heavy a task is, then spreads reminders across the time
// left: a small task gets one nudge close to its deadline, a big multi-day task
// gets a rhythm of reminders (up to twice a day). No provider call is made.

import { isQuietTime } from './nudges.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_REMINDERS = 40;
const FINAL_MIN_LEAD_MS = 5 * MINUTE;
const DEFAULT_QUIET_HOURS = { start: '23:00', end: '07:00' };

// Effort is judged from scope words first and the title second. The numbers are
// intentionally blunt; they only decide reminder spacing, not a billed estimate.
export function estimateEffortMinutes(task = {}) {
  const explicit = task.estimateMinutes ?? task.estimate_minutes;
  if (Number.isInteger(explicit) && explicit > 0) return clamp(explicit, 5, 2400);

  const text = [task.title, task.subject, task.notes]
    .filter((value) => typeof value === 'string')
    .join(' ');
  const countNear = (pattern) => {
    const match = text.match(pattern);
    return match ? clamp(Number(match[1] || 1), 1, 8) : 0;
  };

  let minutes = 0;
  const chapters = countNear(/(\d+)\s+(?:\w+\s+){0,3}(?:chapters?|units?|topics?)/i);
  if (chapters) minutes += chapters * 90;
  else if (/\b(?:chapters?|units?|topics?)\b/i.test(text)) minutes += 90;

  const mocks = countNear(/(\d+)\s+(?:\w+\s+){0,3}(?:mocks?|mock\s+tests?|papers?|exams?)/i);
  if (mocks) minutes += mocks * 120;
  else if (/\bmocks?\b|sample\s+paper|practice\s+test/i.test(text)) minutes += 120;

  if (/numerical|derivation|problem\s+set|exercise/i.test(text)) minutes += 60;
  if (/essay|draft|report|document|article|write|assignment/i.test(text)) minutes += 60;
  if (/\blab\b|experiment|project/i.test(text)) minutes += 120;
  if (/revise|review|read|notes/i.test(text)) minutes += 45;
  if (!minutes) minutes = 60;

  return clamp(Math.round(minutes / 15) * 15, 15, 2400);
}

// Returns ISO reminder instants, ascending, all after `now` and before `due`.
// A task without a due date gets no automatic plan.
export function planReminders(task, { now = Date.now(), timeZone = 'Asia/Kolkata', quietHours = DEFAULT_QUIET_HOURS } = {}) {
  if (!task || typeof task.due !== 'string') return [];
  const dueAt = Date.parse(task.due);
  if (!Number.isFinite(dueAt) || dueAt <= now + MINUTE) return [];

  const effort = estimateEffortMinutes(task);
  const remaining = dueAt - now;
  const leadMs = effort >= 480 ? 4 * HOUR : effort >= 240 ? 3 * HOUR : 2 * HOUR;
  const soloAt = Math.max(now + FINAL_MIN_LEAD_MS, dueAt - leadMs);

  // Small or imminent work: one reminder shortly before the deadline.
  if (remaining <= 12 * HOUR || effort <= 120) {
    return soloAt < dueAt ? [new Date(soloAt).toISOString()] : [];
  }

  // Longer work: a daily rhythm, twice a day when the task is heavy.
  const days = clamp(Math.ceil(remaining / DAY), 1, 60);
  const perDay = effort >= 480 ? 2 : 1;
  const hours = perDay === 2 ? [11, 18] : [18];
  const lastSlot = dueAt - Math.min(leadMs, 3 * HOUR);
  const candidates = [];

  for (let offset = 0; offset < days; offset += 1) {
    const day = localDay(now, offset, timeZone);
    for (const hour of hours) {
      const at = zonedTime(day.year, day.month, day.day, hour, 0, timeZone);
      if (at <= now + FINAL_MIN_LEAD_MS || at >= lastSlot) continue;
      if (isQuietTime(localMinuteOfDay(at, timeZone), quietHours)) continue;
      candidates.push(at);
    }
  }

  const picked = candidates.length > MAX_REMINDERS
    ? evenlyPick(candidates.sort((a, b) => a - b), MAX_REMINDERS)
    : candidates.sort((a, b) => a - b);

  const finalAt = moveOutOfQuiet(Math.max(now + FINAL_MIN_LEAD_MS, dueAt - leadMs), timeZone, quietHours);
  if (finalAt < dueAt && !picked.some((at) => Math.abs(at - finalAt) < 30 * MINUTE)) picked.push(finalAt);

  return [...new Set(picked.sort((a, b) => a - b))].slice(-MAX_REMINDERS).map((at) => new Date(at).toISOString());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function evenlyPick(sorted, count) {
  if (count >= sorted.length) return sorted;
  if (count <= 1) return [sorted[sorted.length - 1]];
  const picked = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(sorted[Math.round((index * (sorted.length - 1)) / (count - 1))]);
  }
  return picked;
}

export function localParts(at, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') };
}

function localDay(at, offsetDays, timeZone) {
  const parts = localParts(at, timeZone);
  const midday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12) + offsetDays * DAY);
  return { year: midday.getUTCFullYear(), month: midday.getUTCMonth() + 1, day: midday.getUTCDate() };
}

export function localMinuteOfDay(at, timeZone) {
  const parts = localParts(at, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function zonedTime(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = localParts(guess, timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess = wall - (asUtc - Math.floor(guess / MINUTE) * MINUTE);
  }
  return guess;
}

function moveOutOfQuiet(at, timeZone, quietHours) {
  if (!isQuietTime(localMinuteOfDay(at, timeZone), quietHours)) return at;
  const parts = localParts(at, timeZone);
  const end = parseClock(quietHours.end);
  const dayOffset = end.hour * 60 + end.minute <= parts.hour * 60 + parts.minute ? 1 : 0;
  const day = localDay(at, dayOffset, timeZone);
  return zonedTime(day.year, day.month, day.day, end.hour, end.minute, timeZone) + MINUTE;
}

function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return { hour: 7, minute: 0 };
  return { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) };
}
