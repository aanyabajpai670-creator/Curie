import { evaluatePushback } from './pushback.js';

const ACK = /^(?:ok(?:ay)?|got it|understood|thanks|thank you)[.!]?$/i;
const DONE = /^(?:done|dun|finished|finised|finshed|completed)[.!]?$/i;
const SKIP = /^(?:skip|dismiss|ignore)[.!]?$/i;
const SNOOZE = /^(?:snooze|snoz|snooz)(?:\s+(?:(?:in\s+)?\d+\s*(?:m|min|mins|minute|minutes|h|hr|hour|hours)?))?[.!]?$/i;
const SHORT_DURATION = /^(?:in\s+)?\d+\s*(?:m|min|mins|minute|minutes|h|hr|hour|hours)[.!]?$/i;

export function matchReminderReply(value) {
  let text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return { route: 'model' };
  let confirmed = false;
  if (/\s+(?:anyway|confirmed?)[.!]?$/i.test(text)) {
    confirmed = true;
    text = text.replace(/\s+(?:anyway|confirmed?)[.!]?$/i, '').trim();
  }
  const local = (result) => (confirmed ? { ...result, confirm: true } : result);
  if (!text) return { route: 'model' };
  if (text.includes('?') || /^(?:why|what|how|can|could|should|would|do|does|is)\b/i.test(text)) return { route: 'model' };
  if (ACK.test(text)) return local({ route: 'local', action: 'shown' });
  if (DONE.test(text)) return local({ route: 'local', action: 'done' });
  if (SKIP.test(text)) return local({ route: 'local', action: 'skip' });
  if (SNOOZE.test(text) || SHORT_DURATION.test(text)) {
    const match = text.match(/(?:in\s+)?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)?/i);
    const amount = match ? Number(match[1]) : 10;
    const unit = match?.[2]?.toLowerCase() || 'min';
    const minutes = unit.startsWith('h') ? amount * 60 : amount;
    if (minutes >= 1 && minutes <= 24 * 60) return local({ route: 'local', action: 'snooze', minutes });
  }
  return { route: 'model' };
}

export function groupDueReminders(reminders = []) {
  const items = reminders.map(({ task, missed, scheduledAt }) => ({ id: task.id, title: task.title, due: scheduledAt, missed: Boolean(missed) }));
  return { count: items.length, missedCount: items.filter((item) => item.missed).length, items };
}

// A counter only counts when it is a non-negative integer; strings, negatives,
// fractions, null and undefined all count as 0 so persisted junk can't inflate it.
function nonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function deferralCountOf(reminder) {
  return nonNegativeInt(reminder?.snooze_count) + nonNegativeInt(reminder?.skip_count);
}

// Pure: `now` is passed in so tests decide what "now" means. An unparseable
// due date becomes null, which evaluatePushback treats as "no due date".
export function buildPushback(task, now) {
  const deferralCount = deferralCountOf(task?.reminder);
  const parsed = task?.due ? Date.parse(task.due) : NaN;
  const dueInMs = Number.isNaN(parsed) ? null : parsed - now;
  return evaluatePushback({ deferralCount, dueInMs });
}

export function reminderContext(task, reminder, pushback = { pushBack: false }) {
  return {
    title: task.title,
    due: reminder.scheduledAt || task.reminder?.dueAt || task.reminder?.at || null,
    deferral_count: deferralCountOf(task.reminder),
    pushback,
    facts: { task_id: task.id, status: task.status, subject: task.subject || null },
  };
}

export function reminderReplyFailure(error) {
  const message = String(error?.message || error || 'Unknown provider error');
  return /Both providers|provider|network|timed out|rate limit|HTTP \d{3}|API key|missing key/i.test(message)
    ? "Can't think right now, use the buttons."
    : 'Curie could not process that reply. Please try again or use the buttons.';
}
