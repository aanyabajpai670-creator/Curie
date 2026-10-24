const SNOOZE_MS = 10 * 60_000;

export function checkReminders(tasks, now = Date.now()) {
  const updatedTasks = [];
  const fired = [];

  for (const task of tasks) {
    const scheduledAt = getScheduledAt(task);
    if (task.status === 'done' || scheduledAt == null || scheduledAt > now) {
      updatedTasks.push(task);
      continue;
    }

    const updated = {
      ...task,
      reminder: {
        ...task.reminder,
        nextAt: null,
        firedAt: new Date(now).toISOString(),
      },
    };
    updatedTasks.push(updated);
    fired.push({
      task: updated,
      missed: scheduledAt < now,
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
  }

  return { tasks: updatedTasks, fired };
}

export function resolveReminder(tasks, taskId, action, now = Date.now()) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || !task.reminder) throw new Error('Reminder not found');
  if (!['snooze', 'done', 'dismiss'].includes(action))
    throw new TypeError('Unknown reminder action');

  const updated = {
    ...task,
    status: action === 'done' ? 'done' : task.status,
    reminder: {
      ...task.reminder,
      nextAt:
        action === 'snooze' ? new Date(now + SNOOZE_MS).toISOString() : null,
      firedAt: action === 'snooze' ? null : task.reminder.firedAt,
      dismissed: action === 'snooze' ? false : true,
    },
  };
  return tasks.map((item) => (item.id === taskId ? updated : item));
}

export function getScheduledAt(task) {
  const reminder = task.reminder;
  if (!reminder || reminder.dismissed || reminder.firedAt) return null;
  if (reminder.nextAt) return Date.parse(reminder.nextAt);
  if (reminder.at) return Date.parse(reminder.at);
  if (reminder.minutesBefore && task.due) {
    return Date.parse(task.due) - reminder.minutesBefore * 60_000;
  }
  return null;
}

export const snoozeDurationMs = SNOOZE_MS;
