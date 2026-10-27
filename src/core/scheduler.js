const SNOOZE_MS = 10 * 60_000;
export const REMINDER_MISSED_THRESHOLD_MS = 5 * 60_000;

export function isReminderMissed({ scheduledAt, now = Date.now(), source = 'tick', shownAt } = {}) {
  const due = typeof scheduledAt === 'number' ? scheduledAt : Date.parse(scheduledAt);
  if (!Number.isFinite(due) || due > now) return false;
  if (source === 'startup' || source === 'resume') return true;
  return Number.isFinite(shownAt) && shownAt - due > REMINDER_MISSED_THRESHOLD_MS;
}

export function checkReminders(tasks, now = Date.now(), { source = 'tick' } = {}) {
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
        dueAt: new Date(scheduledAt).toISOString(),
        state: 'due',
        missed: isReminderMissed({ scheduledAt, now, source }),
        dismissed: false,
      },
    };
    updatedTasks.push(updated);
    fired.push({
      task: updated,
      missed: isReminderMissed({ scheduledAt, now, source }),
      scheduledAt: new Date(scheduledAt).toISOString(),
    });
  }

  return { tasks: updatedTasks, fired };
}

export function resolveReminder(tasks, taskId, action, now = Date.now(), snoozeMinutes = 10) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || !task.reminder) throw new Error('Reminder not found');
  if (!['snooze', 'done', 'dismiss', 'skip'].includes(action))
    throw new TypeError('Unknown reminder action');
  if (action === 'snooze' && (!Number.isInteger(snoozeMinutes) || snoozeMinutes < 1 || snoozeMinutes > 24 * 60))
    throw new TypeError('Snooze duration must be from 1 minute to 24 hours');

  const skipping = action === 'skip' || action === 'dismiss';
  const snoozeCount = Number.isInteger(task.reminder.snooze_count) ? task.reminder.snooze_count : task.reminder.deferralCount || 0;
  const skipCount = Number.isInteger(task.reminder.skip_count) ? task.reminder.skip_count : 0;
  const updated = {
    ...task,
    status: action === 'done' ? 'done' : task.status,
    reminder: {
      ...task.reminder,
      nextAt: action === 'snooze' ? new Date(now + snoozeMinutes * 60_000).toISOString() : null,
      firedAt: action === 'snooze' ? null : task.reminder.firedAt,
      dueAt: action === 'snooze' ? null : task.reminder.dueAt,
      dismissed: action === 'snooze' ? false : true,
      state: action === 'snooze' ? 'snoozed' : action === 'done' ? 'done' : 'dismissed',
      deferralCount: action === 'snooze' ? snoozeCount + 1 : snoozeCount,
      snooze_count: action === 'snooze' ? snoozeCount + 1 : snoozeCount,
      skip_count: skipping ? skipCount + 1 : skipCount,
    },
  };
  return tasks.map((item) => (item.id === taskId ? updated : item));
}

export function getScheduledAt(task) {
  const reminder = task.reminder;
  if (!reminder || ['due', 'shown', 'dismissed', 'done'].includes(reminder.state) || reminder.dismissed || reminder.firedAt) return null;
  if (reminder.nextAt) return Date.parse(reminder.nextAt);
  if (reminder.at) return Date.parse(reminder.at);
  if (reminder.minutesBefore && task.due) {
    return Date.parse(task.due) - reminder.minutesBefore * 60_000;
  }
  return null;
}

export const snoozeDurationMs = SNOOZE_MS;
