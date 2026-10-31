import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const VALID_STATUS = new Set(['todo', 'doing', 'done']);

export function createTaskStore({
  filePath,
  clock = Date.now,
  idGenerator = randomUUID,
}) {
  if (!filePath) throw new TypeError('filePath is required');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function list() {
    return readTasks(filePath);
  }

  function add(input) {
    const task = normalizeTask(input, { clock, idGenerator });
    const tasks = list();
    tasks.push(task);
    writeTasks(filePath, tasks);
    return task;
  }

  function update(id, changes) {
    const tasks = list();
    const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error('Task not found');
    const next = normalizeTask(
      { ...tasks[index], ...changes, id, createdAt: tasks[index].createdAt },
      {
        clock,
        idGenerator,
        existing: tasks[index],
      },
    );
    tasks[index] = next;
    writeTasks(filePath, tasks);
    return next;
  }

  function complete(id) {
    const task = list().find((item) => item.id === id);
    if (!task) throw new Error('Task not found');
    const reminder = task.reminder
      ? { ...task.reminder, dismissed: true, state: 'done', schedule: [] }
      : null;
    return update(id, { status: 'done', reminder });
  }

  function remove(id) {
    const tasks = list();
    const next = tasks.filter((task) => task.id !== id);
    if (next.length === tasks.length) throw new Error('Task not found');
    writeTasks(filePath, next);
  }

  function replaceAll(tasks) {
    writeTasks(
      filePath,
      tasks.map((task) =>
        normalizeTask(task, { clock, idGenerator, existing: task }),
      ),
    );
  }

  return { list, add, update, complete, delete: remove, replaceAll };
}

export function normalizeTask(
  input,
  { clock = Date.now, idGenerator = randomUUID, existing } = {},
) {
  if (!input || typeof input !== 'object')
    throw new TypeError('Task must be an object');
  const title = requiredText(input.title, 'title', 200);
  const subject = optionalText(input.subject, 'subject', 120);
  const notes = optionalText(input.notes, 'notes', 2000);
  const estimateMinutes =
    input.estimateMinutes == null
      ? null
      : positiveInteger(input.estimateMinutes, 'estimateMinutes');
  const status = input.status ?? 'todo';
  if (!VALID_STATUS.has(status))
    throw new TypeError('status must be todo, doing, or done');
  const due = optionalIso(input.due, 'due');
  const blockStart = optionalIso(input.blockStart, 'blockStart');
  const blockEnd = optionalIso(input.blockEnd, 'blockEnd');
  if ((blockStart === null) !== (blockEnd === null)) {
    throw new TypeError('blockStart and blockEnd must be set together');
  }
  if (blockStart && Date.parse(blockEnd) <= Date.parse(blockStart)) {
    throw new TypeError('blockEnd must be after blockStart');
  }
  const parentId =
    input.parentId == null || input.parentId === ''
      ? null
      : requiredText(input.parentId, 'parentId', 120);
  const createdAt =
    existing?.createdAt ??
    requiredIso(
      input.createdAt ?? new Date(clock()).toISOString(),
      'createdAt',
    );
  const reminderInput = Object.hasOwn(input, 'reminder')
    ? input.reminder
    : (existing?.reminder ?? null);
  const reminder = normalizeReminder(reminderInput);
  if (reminder?.minutesBefore && !due)
    throw new TypeError('A due date is required for a before-due reminder');

  return {
    id:
      existing?.id ??
      (typeof input.id === 'string' && input.id ? input.id : idGenerator()),
    title,
    subject,
    due,
    blockStart,
    blockEnd,
    parentId,
    estimateMinutes,
    status,
    createdAt,
    notes,
    reminder,
  };
}

function normalizeReminder(input) {
  if (input == null) return null;
  if (typeof input !== 'object')
    throw new TypeError('reminder must be an object');
  const at = input.at == null ? null : requiredIso(input.at, 'reminder.at');
  const minutesBefore =
    input.minutesBefore == null
      ? null
      : positiveInteger(input.minutesBefore, 'reminder.minutesBefore');
  const schedule = Array.isArray(input.schedule)
    ? [...new Set(
        input.schedule
          .filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
          .map((value) => new Date(value).toISOString()),
      )].sort()
    : [];
  if ((at === null) === (minutesBefore === null) && schedule.length === 0) {
    throw new TypeError('reminder needs one of at, minutesBefore, or schedule');
  }
  const state = ['pending', 'due', 'shown', 'dismissed', 'snoozed', 'done'].includes(input.state)
    ? input.state
    : input.dismissed ? 'dismissed' : input.nextAt ? 'snoozed' : input.firedAt ? 'due' : 'pending';
  const snoozeCount = Number.isInteger(input.snooze_count) && input.snooze_count >= 0
    ? input.snooze_count
    : Number.isInteger(input.deferralCount) && input.deferralCount >= 0 ? input.deferralCount : 0;
  const skipCount = Number.isInteger(input.skip_count) && input.skip_count >= 0
    ? input.skip_count
    : state === 'dismissed' ? 1 : 0;
  return {
    at,
    minutesBefore,
    schedule,
    auto: input.auto === true,
    nextAt:
      input.nextAt == null
        ? null
        : requiredIso(input.nextAt, 'reminder.nextAt'),
    firedAt:
      input.firedAt == null
        ? null
        : requiredIso(input.firedAt, 'reminder.firedAt'),
    dueAt: input.dueAt == null ? null : requiredIso(input.dueAt, 'reminder.dueAt'),
    dismissed: Boolean(input.dismissed),
    is_test: input.is_test === true,
    state,
    missed: Boolean(input.missed),
    deferralCount: snoozeCount,
    snooze_count: snoozeCount,
    skip_count: skipCount,
  };
}

function readTasks(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed))
      throw new Error('Task file must contain an array');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeTasks(filePath, tasks) {
  const temporary = filePath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(tasks, null, 2), 'utf8');
  fs.renameSync(temporary, filePath);
}

function requiredText(value, name, maxLength) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    throw new TypeError(name + ' must be 1 to ' + maxLength + ' characters');
  }
  return value.trim();
}

function optionalText(value, name, maxLength) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new TypeError(name + ' must be at most ' + maxLength + ' characters');
  }
  return value.trim();
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0)
    throw new TypeError(name + ' must be a positive integer');
  return value;
}

function optionalIso(value, name) {
  if (value == null || value === '') return null;
  return requiredIso(value, name);
}

function requiredIso(value, name) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(name + ' must be a valid ISO timestamp');
  }
  return new Date(value).toISOString();
}
