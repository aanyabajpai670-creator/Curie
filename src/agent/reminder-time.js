const TIME_ZONE = 'Asia/Kolkata';

export function parseReminderTime(value, now = Date.now(), timeZone = TIME_ZONE) {
  if (typeof value !== 'string') throw new TypeError('Reminder time must be a date and time.');
  const input = value.trim().toLowerCase();
  const current = localParts(now, timeZone);
  const relative = /^in\s+(\d+)\s+minutes?$/.exec(input);
  if (relative) return new Date(now + Number(relative[1]) * 60_000).toISOString();
  const clock = /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(input);
  if (!clock) throw new TypeError('Reminder time must include a time such as “at 3:20 pm” or “in 2 minutes”.');
  let hour = Number(clock[1]) % 12;
  if (clock[3] === 'pm') hour += 12;
  const minute = Number(clock[2] || 0);
  if (Number(clock[1]) < 1 || Number(clock[1]) > 12 || minute > 59) throw new TypeError('Reminder time is not valid.');
  const result = localDateTimeToEpoch(current.year, current.month, current.day, hour, minute, timeZone);
  if (result <= now) throw new TypeError('That time has already passed today. Choose a later time or another date.');
  return new Date(result).toISOString();
}

function localParts(epoch, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(epoch);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function localDateTimeToEpoch(year, month, day, hour, minute, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let index = 0; index < 2; index += 1) {
    const local = localParts(guess, timeZone);
    const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    guess += target - represented;
  }
  return guess;
}
