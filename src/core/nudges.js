const DEFAULTS = Object.freeze({
  timeZone: 'Asia/Kolkata',
  quietHours: { start: '23:00', end: '07:00' },
  maxPerDay: 3,
  frequencyMinutes: 30,
});

// TODO(owner): Tune the deadline-pressure rule against your real study habits.

export function evaluateNudges(
  tasks,
  now = Date.now(),
  config = {},
  previousState,
) {
  const settings = { ...DEFAULTS, ...config };
  if (!Number.isInteger(settings.maxPerDay) || settings.maxPerDay < 0) {
    throw new TypeError('maxPerDay must be a non-negative integer');
  }
  if (
    !Number.isInteger(settings.frequencyMinutes) ||
    settings.frequencyMinutes < 1
  ) {
    throw new TypeError('frequencyMinutes must be a positive integer');
  }
  const local = localClock(now, settings.timeZone);
  const state = normalizeState(previousState, local.dateKey);

  if (
    isQuietTime(local.minuteOfDay, settings.quietHours) ||
    settings.maxPerDay === 0 ||
    state.count >= settings.maxPerDay
  ) {
    return { nudges: [], state };
  }

  const nudges = [];
  for (const task of tasks) {
    if (
      task.status === 'done' ||
      !task.due ||
      !Number.isInteger(task.estimateMinutes) ||
      task.estimateMinutes <= 0 ||
      state.taskIds.includes(task.id)
    )
      continue;

    const dueAt = Date.parse(task.due);
    if (!Number.isFinite(dueAt) || dueAt - now >= task.estimateMinutes * 60_000)
      continue;

    nudges.push({
      taskId: task.id,
      title: task.title,
      message: task.title + ' may need more time before its deadline.',
      dueAt: task.due,
    });
    state.taskIds.push(task.id);
    state.count += 1;
    if (state.count >= settings.maxPerDay) break;
  }
  return { nudges, state };
}

export function isQuietTime(minuteOfDay, hours = DEFAULTS.quietHours) {
  const start = parseTime(hours.start);
  const end = parseTime(hours.end);
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

export function localClock(timestamp, timeZone = DEFAULTS.timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    dateKey: values.year + '-' + values.month + '-' + values.day,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

function normalizeState(state, dateKey) {
  if (
    !state ||
    state.dateKey !== dateKey ||
    !Number.isInteger(state.count) ||
    !Array.isArray(state.taskIds)
  ) {
    return { dateKey, count: 0, taskIds: [] };
  }
  return { dateKey, count: state.count, taskIds: [...state.taskIds] };
}

function parseTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new TypeError('Quiet-hour times must use HH:MM format');
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export const DEFAULT_NUDGE_SETTINGS = DEFAULTS;
