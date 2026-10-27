import { createTaskStore, normalizeTask } from '../core/tasks.js';
import { checkReminders, isReminderMissed, resolveReminder } from '../core/scheduler.js';

export function createTaskService({ filePath, clock = Date.now, onReminder = () => {}, onUpdate = () => {}, log = () => {} }) {
  const store = createTaskStore({ filePath, clock });
  let interval;

  // Normalize older reminder records once on startup so the persisted lifecycle is explicit.
  const initial = store.list();
  const migrated = initial.map((task) => normalizeTask({ ...task, reminder: task.status === 'done' && task.reminder ? { ...task.reminder, state: 'done' } : task.reminder }, { clock, existing: task }));
  if (JSON.stringify(initial) !== JSON.stringify(migrated)) {
    store.replaceAll(migrated);
    for (const task of migrated) if (task.reminder) log(`reminder.migrated.${safe(task.id)}.${task.reminder.state}.snooze-count-${task.reminder.snooze_count}.skip-count-${task.reminder.skip_count}`);
  }

  let pending = store.list()
    .filter((task) => task.status !== 'done' && ['due', 'shown'].includes(task.reminder?.state))
    .map((task) => {
      const scheduledAt = task.reminder.dueAt || task.reminder.at || task.reminder.firedAt;
      return { task, scheduledAt, missed: Boolean(task.reminder.missed) || isReminderMissed({ scheduledAt, now: clock(), source: 'startup' }) };
    });

  for (const task of store.list()) logScheduled(task);

  function logScheduled(task) {
    const due = task.reminder?.nextAt || task.reminder?.at;
    if (task.status !== 'done' && due && ['pending', 'snoozed'].includes(task.reminder?.state)) {
      log(`reminder.scheduled.${safe(task.id)}.${safe(due)}`);
    }
  }

  function snapshot() { return { tasks: store.list(), reminders: [...pending] }; }

  function check(source = 'tick') {
    const now = clock();
    const result = checkReminders(store.list(), now, { source });
    store.replaceAll(result.tasks);
    pending.push(...result.fired.map((reminder) => ({ ...reminder, missed: reminder.missed })));
    result.fired.forEach((reminder) => {
      log(`scheduler.tick.${safe(reminder.task.id)}`);
      log(`reminder.due.${safe(reminder.task.id)}.${safe(reminder.scheduledAt)}`);
      try { onReminder(reminder); }
      catch (error) { log(`notification.failed.reminder.${safe(reminder.task.id)}.${safe(error?.message || error?.name || 'Error')}`); }
    });
    onUpdate(snapshot());
    return snapshot();
  }

  function resolveMany(taskIds, action, minutes = 10) {
    const ids = [...new Set(taskIds)].filter((id) => typeof id === 'string');
    const at = clock();
    let tasks = store.list();
    const testIds = new Set(tasks.filter((task) => ids.includes(task.id) && task.reminder?.is_test).map((task) => task.id));
    for (const id of ids) tasks = resolveReminder(tasks, id, action, at, minutes);
    const resolvedTasks = tasks;
    tasks = tasks.filter((task) => !testIds.has(task.id));
    store.replaceAll(tasks);
    pending = pending.filter((item) => !ids.includes(item.task.id));
    for (const id of ids) {
      const task = resolvedTasks.find((item) => item.id === id);
      if (action === 'snooze') log(`reminder.snoozed.${safe(id)}.${safe(task?.reminder?.nextAt)}`);
      else if (action === 'skip' || action === 'dismiss') log(`reminder.skipped.${safe(id)}.${safe(new Date(at).toISOString())}.skip-count-${task?.reminder?.skip_count ?? 0}`);
      else log(`reminder.done.${safe(id)}.${safe(new Date(at).toISOString())}`);
      if (action === 'snooze') log(`reminder.snooze-count.${safe(id)}.${task?.reminder?.snooze_count ?? 0}`);
      if (testIds.has(id)) log(`reminder.test-removed.${safe(id)}`);
    }
    onUpdate(snapshot());
    return snapshot();
  }

  function resolve(taskId, action, minutes = 10) {
    resolveMany([taskId], action, minutes);
    return store.list().find((task) => task.id === taskId);
  }

  function markShown(taskIds) {
    const ids = [...new Set(taskIds)].filter((id) => typeof id === 'string');
    const at = new Date(clock()).toISOString();
    const missedById = new Map(pending.filter((item) => ids.includes(item.task.id)).map((item) => [item.task.id, item.missed || isReminderMissed({ scheduledAt: item.scheduledAt, shownAt: clock(), now: clock(), source: 'tick' })]));
    const tasks = store.list().map((task) => {
      if (!ids.includes(task.id) || !task.reminder || !['due', 'shown'].includes(task.reminder.state)) return task;
      const missed = missedById.get(task.id) ?? Boolean(task.reminder.missed);
      if (task.reminder.state === 'due') log(`reminder.bubble-shown.${safe(task.id)}.${safe(at)}.missed-${missed ? 'yes' : 'no'}`);
      return { ...task, reminder: { ...task.reminder, state: 'shown', missed } };
    });
    store.replaceAll(tasks);
    pending = pending.map((item) => ({ ...item, missed: missedById.get(item.task.id) ?? item.missed, task: tasks.find((task) => task.id === item.task.id) ?? item.task }));
    onUpdate(snapshot());
    return snapshot();
  }

  function start() { if (!interval) { check('startup'); interval = setInterval(() => check('tick'), 30_000); } }
  function stop() { clearInterval(interval); interval = undefined; }
  function remove(taskId) {
    const removed = store.list().find((task) => task.id === taskId);
    store.delete(taskId);
    pending = pending.filter((item) => item.task.id !== taskId);
    if (removed?.reminder) log(`reminder.dismissed.${safe(taskId)}.${safe(new Date(clock()).toISOString())}`);
    onUpdate(snapshot());
  }

  return {
    list: store.list,
    add(input) {
      const task = store.add(input);
      const due = task.reminder?.at || task.reminder?.nextAt;
      if (due) { log(`reminder.saved.${safe(task.id)}.${safe(due)}`); logScheduled(task); }
      check();
      return task;
    },
    update(id, changes) {
      const task = store.update(id, changes);
      const due = task.reminder?.at || task.reminder?.nextAt;
      if (due && ['pending', 'snoozed'].includes(task.reminder.state)) { log(`reminder.saved.${safe(task.id)}.${safe(due)}`); logScheduled(task); }
      check();
      return task;
    },
    complete(id) {
      const task = store.complete(id);
      pending = pending.filter((item) => item.task.id !== id);
      if (task.reminder) log(`reminder.done.${safe(id)}.${safe(new Date(clock()).toISOString())}`);
      onUpdate(snapshot());
      return task;
    },
    delete: remove,
    resolve,
    resolveMany,
    markShown,
    pending: () => [...pending],
    check,
    start,
    stop,
  };
}

function safe(value) { return String(value ?? 'none').replace(/[^a-z0-9_-]/gi, '_').slice(0, 100); }
