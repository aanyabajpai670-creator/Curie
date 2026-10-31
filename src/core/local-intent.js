// Local intent routing for small talk and status questions.
// These replies are cheap, offline and deterministic. Anything that needs
// interpretation (new tasks, dates, chapter ranges, ambiguity) returns null so
// the model handles it. The local layer owns the facts; the model never has to
// be called just to say hello.

const SIMPLE_GREETING = /^(?:hi+|hello+|hey+|yo|sup|good\s+(?:morning|afternoon|evening|night)|gm|gn)(?:[\s,]+(?:curie|there))?[!.…]*$/i;
const HOW_ARE_YOU = /^(?:how\s+are\s+you|how\s+is\s+it\s+going|how'?s\s+it\s+going|what'?s\s+up|wassup|you\s+(?:ok|okay))[?!. ]*$/i;
const GREET_AND_HOW = /^(?:hi+|hello+|hey+)[, ]+(?:how\s+are\s+you|how'?s\s+it\s+going)[?!. ]*$/i;
const THANKS = /^(?:thanks|thank\s+you|ty|thx|cheers)(?:\s+curie)?[!. ]*$/i;
const CAPABILITIES = /^(?:who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+do|help|capabilities)[?!. ]*$/i;
const DAY_STATUS = /^(?:(?:what'?s|what\s+is)\s+(?:on\s+my\s+plate|next|due|up(?:\s+today)?)|what\s+do\s+i\s+have(?:\s+(?:today|next))?|my\s+day|today'?s\s+plan|what\s+should\s+i\s+do(?:\s+next)?|status)[?!. ]*$/i;

export function routeLocalIntent(text, { tasks = [], now = Date.now(), timeZone = 'Asia/Kolkata' } = {}) {
  const value = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!value || value.length > 160) return null;

  if (HOW_ARE_YOU.test(value) || GREET_AND_HOW.test(value)) {
    return { kind: 'status', text: `Doing fine. ${summary(tasks, now, timeZone)}` };
  }
  if (SIMPLE_GREETING.test(value)) {
    return { kind: 'greeting', text: `${greeting(now, timeZone)} ${summary(tasks, now, timeZone)}` };
  }
  if (THANKS.test(value)) return { kind: 'thanks', text: 'Anytime.' };
  if (CAPABILITIES.test(value)) {
    return {
      kind: 'capabilities',
      text: 'I keep your tasks and reminders, plan your day into blocks, and nudge you before deadlines. I cannot read files, browse, or use other apps.',
    };
  }
  if (DAY_STATUS.test(value)) return { kind: 'day-status', text: summary(tasks, now, timeZone) };
  return null;
}

function greeting(now, timeZone) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  if (hour >= 5 && hour < 12) return 'Good morning.';
  if (hour >= 12 && hour < 17) return 'Good afternoon.';
  if (hour >= 17 && hour < 22) return 'Good evening.';
  return 'Still up?';
}

function summary(tasks, now, timeZone) {
  const open = (tasks || []).filter((task) => task?.status !== 'done');
  if (!open.length) return 'Nothing on the list right now.';
  const dayKey = localDate(now, timeZone);
  const today = open
    .filter((task) => task.due && localDate(Date.parse(task.due), timeZone) === dayKey)
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  const overdue = open.filter((task) => task.due && Date.parse(task.due) < now);
  const parts = [];
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (today.length) {
    const listed = today.slice(0, 3).map((task) => `${task.title} at ${clock(task.due, timeZone)}`);
    parts.push(`${today.length} today: ${listed.join(', ')}${today.length > 3 ? ', and more' : ''}`);
  } else if (!overdue.length) {
    parts.push(`nothing due today, ${open.length} open`);
  }
  return `${parts.join('. ')}.`;
}

function localDate(at, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

function clock(iso, timeZone) {
  return new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
