import { createTaskStore } from '../core/tasks.js';
import { checkReminders, resolveReminder } from '../core/scheduler.js';

export function createTaskService({
  filePath,
  clock = Date.now,
  onReminder = () => {},
  onUpdate = () => {},
}) {
  const store = createTaskStore({ filePath, clock });
  let interval;
  let pending = store
    .list()
    .filter(
      (task) =>
        task.status !== 'done' &&
        task.reminder?.firedAt &&
        !task.reminder.dismissed,
    )
    .map((task) => ({
      task,
      scheduledAt: task.reminder.firedAt,
      missed: true,
    }));

  function snapshot() {
    return { tasks: store.list(), reminders: [...pending] };
  }

  function check() {
    const result = checkReminders(store.list(), clock());
    store.replaceAll(result.tasks);
    pending.push(...result.fired);
    result.fired.forEach(onReminder);
    onUpdate(snapshot());
    return snapshot();
  }

  function resolve(taskId, action) {
    store.replaceAll(resolveReminder(store.list(), taskId, action, clock()));
    pending = pending.filter((item) => item.task.id !== taskId);
    onUpdate(snapshot());
    return snapshot();
  }

  function start() {
    if (interval) return;
    check();
    interval = setInterval(check, 30_000);
  }

  function stop() {
    clearInterval(interval);
    interval = undefined;
  }

  function remove(taskId) {
    store.delete(taskId);
    pending = pending.filter((item) => item.task.id !== taskId);
    onUpdate(snapshot());
  }

  return {
    list: store.list,
    add: (input) => {
      const task = store.add(input);
      check();
      return task;
    },
    update: (id, changes) => {
      const task = store.update(id, changes);
      check();
      return task;
    },
    complete(id) {
      const task = store.complete(id);
      pending = pending.filter((item) => item.task.id !== id);
      onUpdate(snapshot());
      return task;
    },
    delete: remove,
    resolve,
    pending: () => [...pending],
    check,
    start,
    stop,
  };
}
