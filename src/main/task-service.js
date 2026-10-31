import { createTaskStore, normalizeTask } from '../core/tasks.js';
import { checkReminders, isReminderMissed, resolveReminder } from '../core/scheduler.js';
import { estimateEffortMinutes, planReminders } from '../core/reminder-plan.js';

export function createTaskService({ filePath, clock = Date.now, onReminder = () => {}, onUpdate = () => {}, log = () => {}, planConfig = () => ({}) }) {
  const store = createTaskStore({ filePath, clock });
  let interval;

  // Normalize older reminder records once on startup so the persisted lifecycle is explicit.
  const initial = store.list();
  const migrated = initial.map((task) => normalizeTask({ ...task, reminder: task.status === 'done' && task.reminder ? { ...task.reminder, state: 'done' } : task.reminder }, { clock, existing: task }));
  if (JSON.stringify(initial) !== JSON.stringify(migrated)) {
    store.replaceAll(migrated);
    for (const task of migrated) if (task.reminder) log(`reminder.migrated.${safe(task.id)}.${task.reminder.state}.snooze-count-${task.reminder.snooze_count}.skip-count-${task.reminder.skip_count}`);
  }

  // Existing tasks saved before automatic planning get a plan on upgrade.
  // Past-due tasks are skipped; their deadline has already passed.
  function backfill() {
    for (const task of store.list()) {
      if (task.status === 'done' || !task.due) continue;
      let current = task;
      if (current.estimateMinutes == null) {
        current = store.update(current.id, { estimateMinutes: estimateEffortMinutes(current) });
      }
      if (!current.reminder && Date.parse(current.due) > clock()) autoPlan(current);
    }
  }

  backfill();

  let pending = store.list()
    .filter((task) => task.status !== 'done' && ['due', 'shown'].includes(task.reminder?.state))
    .map((task) => {
      const scheduledAt = task.reminder.dueAt || task.reminder.at || task.reminder.firedAt;
      return { task, scheduledAt, missed: Boolean(task.reminder.missed) || isReminderMissed({ scheduledAt, now: clock(), source: 'startup' }) };
    });

  for (const task of store.list()) logScheduled(task);

  function logScheduled(task) {
    const due = task.reminder?.nextAt || task.reminder?.at || task.reminder?.schedule?.[0];
    if (task.status !== 'done' && due && ['pending', 'snoozed'].includes(task.reminder?.state)) {
      log(`reminder.scheduled.${safe(task.id)}.${safe(due)}`);
    }
  }

  // A due date with no reminder now gets a local plan. Together with the
  // effort estimate this is what makes a small task nudge once and a big
  // multi-day task nudge repeatedly.
  function withEffort(input) {
    const task = input && typeof input === 'object' ? input : {};
    if (!task.due || task.estimateMinutes != null) return input;
    return { ...task, estimateMinutes: estimateEffortMinutes(task) };
  }

  function autoPlan(task) {
    if (!task || task.reminder || !task.due) return task;
    const times = planReminders(task, { now: clock(), ...planConfig() });
    if (!times.length) return task;
    const planned = store.update(task.id, { reminder: { schedule: times, auto: true } });
    log(`reminder.planned.${safe(task.id)}.${times.length}.${safe(times[0])}`);
    return planned;
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

  // A day plan is one parent plus child blocks. Acting on the parent should act
  // on the whole plan, otherwise finishing or deleting the plan leaves child
  // blocks behind with their own reminders still armed.
  function descendants(taskId) {
    const byParent = new Map();
    for (const task of store.list()) {
      if (!task.parentId) continue;
      if (!byParent.has(task.parentId)) byParent.set(task.parentId, []);
      byParent.get(task.parentId).push(task);
    }
    const found = [];
    const seen = new Set([taskId]);
    const queue = [...(byParent.get(taskId) || [])];
    while (queue.length) {
      const task = queue.shift();
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      found.push(task);
      queue.push(...(byParent.get(task.id) || []));
    }
    return found;
  }

  function start() { if (!interval) { check('startup'); interval = setInterval(() => check('tick'), 30_000); } }
  function stop() { clearInterval(interval); interval = undefined; }
  function remove(taskId) {
    const parent = store.list().find((task) => task.id === taskId);
    if (!parent) store.delete(taskId); // Keep the store's missing-task error.
    const removed = [parent, ...descendants(taskId)].filter(Boolean);
    for (const task of removed) store.delete(task.id);
    const removedIds = new Set(removed.map((task) => task.id));
    pending = pending.filter((item) => !removedIds.has(item.task.id));
    for (const task of removed) {
      if (task.reminder) log(`reminder.dismissed.${safe(task.id)}.${safe(new Date(clock()).toISOString())}`);
    }
    onUpdate(snapshot());
  }

  return {
    list: store.list,
    add(input) {
      const task = autoPlan(store.add(withEffort(input)));
      const due = task.reminder?.nextAt || task.reminder?.at || task.reminder?.schedule?.[0];
      if (due) { log(`reminder.saved.${safe(task.id)}.${safe(due)}`); logScheduled(task); }
      check();
      return task;
    },
    update(id, changes) {
      const patch = changes && typeof changes === 'object' ? changes : {};
      const existing = store.list().find((task) => task.id === id);
      const merged = existing ? { ...existing, ...patch } : null;
      let input = patch;
      if (merged?.due && merged.estimateMinutes == null) input = { ...input, estimateMinutes: estimateEffortMinutes(merged) };
      let task = store.update(id, input);
      if (task.due && Object.hasOwn(patch, 'due') && !Object.hasOwn(patch, 'reminder')) {
        if (task.reminder?.auto) task = autoPlan(store.update(id, { reminder: null }));
        else if (!task.reminder) task = autoPlan(task);
      }
      const due = task.reminder?.nextAt || task.reminder?.at || task.reminder?.schedule?.[0];
      if (due && ['pending', 'snoozed'].includes(task.reminder.state)) { log(`reminder.saved.${safe(task.id)}.${safe(due)}`); logScheduled(task); }
      check();
      return task;
    },
    complete(id) {
      const children = descendants(id);
      const task = store.complete(id);
      const done = [task, ...children.map((child) => store.complete(child.id))];
      const ids = new Set(done.map((item) => item.id));
      pending = pending.filter((item) => !ids.has(item.task.id));
      for (const item of done) if (item.reminder) log(`reminder.done.${safe(item.id)}.${safe(new Date(clock()).toISOString())}`);
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
