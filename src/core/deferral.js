// Local, deterministic deferral check.
// Before Curie lets a reminder be snoozed or skipped, it compares the effort
// still needed with the time actually left. No provider call is involved.

const MINUTE = 60_000;

export function assessDeferral({
  action = 'snooze',
  title = 'This task',
  estimateMinutes = null,
  dueInMs = null,
  snoozeMinutes = 10,
  deferralCount = 0,
} = {}) {
  const hasDue = Number.isFinite(dueInMs);
  const estimate = Number.isInteger(estimateMinutes) && estimateMinutes > 0 ? estimateMinutes : null;
  const available = hasDue ? Math.floor(dueInMs / MINUTE) : null;
  const snooze = action === 'snooze' ? Math.max(0, Math.floor(snoozeMinutes)) : 0;
  const after = available === null ? null : available - snooze;
  const slack = estimate !== null && after !== null ? after - estimate : null;

  let level = 'none';
  if (action === 'done') {
    level = 'none';
  } else if (slack !== null) {
    if (slack < 0) level = 'strong';
    else if (deferralCount >= 3) level = 'strong';
    else if (deferralCount >= 2 && slack < estimate * 0.25) level = 'strong';
    else if (slack < estimate * 0.2) level = 'warn';
    else if (deferralCount >= 2) level = 'warn';
  } else if (deferralCount >= 3) {
    level = 'strong';
  } else if (deferralCount >= 2) {
    level = 'warn';
  }

  return {
    level,
    requireConfirm: level === 'strong',
    facts: { estimateMinutes: estimate, availableMinutes: available, slackMinutes: slack, snoozeMinutes: snooze, deferralCount: Math.max(0, Math.floor(deferralCount)) },
    message: level === 'none' ? '' : describe({ action, level, title, estimate, available, after, snooze, deferralCount }),
  };
}

function describe({ action, level, title, estimate, available, after, snooze, deferralCount }) {
  const name = shortTitle(title);
  const verb = action === 'snooze' ? `snoozing ${snooze}m` : action === 'skip' ? 'skipping this' : 'putting this off';
  const left = available === null ? null : `${formatMinutes(available)} before the deadline`;
  const need = estimate === null ? 'more time than that' : `about ${formatMinutes(estimate)} of work`;

  if (level === 'strong' && estimate !== null && available !== null) {
    const next = after <= 0 ? 'no time left' : `${formatMinutes(after)} left`;
    return `“${name}” needs ${need}. You have ${left}, so ${verb} leaves ${next}. Snooze anyway, or start a 10-minute step?`
      .replace('Snooze anyway', action === 'snooze' ? 'Snooze anyway' : 'Skip anyway');
  }
  if (level === 'strong') {
    return `“${name}” has been put off ${deferralCount} times and still has no clear time left. ${capitalize(verb)}?`;
  }
  if (estimate !== null && available !== null) {
    return `“${name}” needs ${need} and you have ${left}. ${capitalize(verb)} leaves ${after <= 0 ? 'nothing' : formatMinutes(after)}. Still ${action === 'skip' ? 'skip' : 'snooze'}?`;
  }
  return `“${name}” has been put off ${deferralCount} times. Still ${action === 'skip' ? 'skip' : 'snooze'}?`;
}

// One reminder bubble can hold several tasks. Assess each, keep the worst
// warning, and lead with the count so the message stays honest when a snooze
// affects more than one deadline. Pure: the caller passes the clock-derived
// `dueInMs` for each item.
export function assessDeferralGroup(items = [], options = {}) {
  const ranked = items.map((item) => ({
    id: item.id,
    title: item.title,
    ...assessDeferral({ ...options, title: item.title, estimateMinutes: item.estimateMinutes, dueInMs: item.dueInMs, deferralCount: item.deferralCount }),
  }));
  const rank = { none: 0, warn: 1, strong: 2 };
  const worst = ranked.reduce((current, item) => (rank[item.level] > rank[current.level] ? item : current), { level: 'none', message: '' });
  const count = ranked.length;
  const message = count > 1 && worst.message ? `${count} reminders. ${worst.message}` : worst.message;
  return {
    level: worst.level,
    requireConfirm: worst.level === 'strong',
    message,
    facts: worst.facts || {},
    items: ranked,
  };
}

export function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function shortTitle(value) {
  const text = String(value ?? '').trim() || 'This task';
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
