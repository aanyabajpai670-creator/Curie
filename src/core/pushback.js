// Pure decision: should Curie push back on this snooze request?
// deferralCount = snoozes already used. n = the snooze being requested now.
// Boundaries are strict by choice: exactly 2h or 24h before due counts as "within".
const HOUR_MS = 60 * 60 * 1000;

export function evaluatePushback({ deferralCount, dueInMs } = {}) {
  const used = Number.isFinite(deferralCount) && deferralCount > 0 ? Math.floor(deferralCount) : 0;
  const n = used + 1;
  const hasDue = Number.isFinite(dueInMs);
  const overdue = hasDue && dueInMs < 0;

  let pushBack;
  if (n >= 3) pushBack = true;                        // 3rd snooze onward: always
  else if (!hasDue) pushBack = false;                 // no due date: only from the 3rd
  else if (n === 1) pushBack = dueInMs <= 2 * HOUR_MS;   // overdue counts (negative)
  else pushBack = dueInMs <= 24 * HOUR_MS;               // n === 2

  return {
    pushBack,
    facts: {
      snoozeNumber: n,
      hasDueDate: hasDue,
      overdue,
      hoursUntilDue: hasDue ? Math.round((dueInMs / HOUR_MS) * 10) / 10 : null,
    },
  };
}
