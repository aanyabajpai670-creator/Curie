import { TOOL_DEFINITIONS } from './prompts.js';
import { parseReminderTime } from './reminder-time.js';

export function createAgentTools({ taskService, timerService, clock = Date.now }) {
  function validateIso(value, name) {
    const match = typeof value === 'string' ? /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.exec(value) : null;
    if (!match || !Number.isFinite(Date.parse(value))) throw new TypeError(`${name} must be an ISO date/time with a timezone.`);
    const [, year, month, day, hour, minute, second = '0'] = match;
    const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month) || calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw new TypeError(`${name} must be a valid ISO date/time.`);
    if (Date.parse(value) < clock()) throw new TypeError(`${name} must be in the future.`);
    return value;
  }
  function normalizeReminderTime(value) {
    const input = typeof value === 'string' ? value.trim() : value;
    if (typeof input === 'string' && !/^\d{4}-\d\d-\d\dT/.test(input)) return parseReminderTime(input, clock());
    return validateIso(input, 'remind_at_iso');
  }
  function proposal(name, args) { return { [PROPOSAL]: { name, args, label: describe(name, args, taskService.list()) } }; }

  async function executeTool(name, args = {}) {
    if (!TOOL_DEFINITIONS.some((tool) => tool.function.name === name)) throw new Error('Unknown tool.');
    switch (name) {
      case 'add_task':
        assertArguments(args, ['title', 'due_iso', 'remind_at_iso'], ['title']);
        if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 200) throw new TypeError('Title must be 1–200 characters.');
        if (args.due_iso != null) validateIso(args.due_iso, 'due_iso');
        if (args.remind_at_iso != null) args.remind_at_iso = normalizeReminderTime(args.remind_at_iso);
        return proposal(name, { title: args.title.trim(), due_iso: args.due_iso ?? null, remind_at_iso: args.remind_at_iso ?? null });
      case 'list_tasks': {
        assertArguments(args, ['filter'], ['filter']);
        if (!['open', 'done', 'all'].includes(args.filter)) throw new TypeError('filter must be open, done, or all.');
        const tasks = taskService.list().filter((task) => args.filter === 'all' || (args.filter === 'done' ? task.status === 'done' : task.status !== 'done'));
        return tasks.sort((a, b) => (Date.parse(a.due) || Infinity) - (Date.parse(b.due) || Infinity)).slice(0, 50).map(publicTask);
      }
      case 'complete_task':
      case 'delete_task':
        assertArguments(args, ['id'], ['id']);
        requireExisting(taskService, args.id);
        return proposal(name, { id: args.id });
      case 'set_reminder':
        assertArguments(args, ['task_id', 'remind_at_iso'], ['task_id', 'remind_at_iso']);
        if (typeof args.task_id !== 'string' || !args.task_id) throw new TypeError('task_id is required.');
        requireExisting(taskService, args.task_id);
        args.remind_at_iso = normalizeReminderTime(args.remind_at_iso);
        return proposal(name, { task_id: args.task_id, remind_at_iso: args.remind_at_iso });
      case 'start_focus':
        assertArguments(args, [], []);
        return timerService.dispatch('startFocus', 'agent');
      default: throw new Error('Unknown tool.');
    }
  }

  function executeApprovedTool(name, args) {
    switch (name) {
      case 'add_task': return publicTask(taskService.add({ title: args.title, due: args.due_iso, reminder: args.remind_at_iso ? { at: args.remind_at_iso } : null }));
      case 'set_reminder': return publicTask(taskService.update(args.task_id, { reminder: { at: args.remind_at_iso } }));
      case 'complete_task': return publicTask(taskService.complete(args.id));
      case 'delete_task': taskService.delete(args.id); return { deleted: true };
      default: throw new Error('Unknown write tool.');
    }
  }

  return { definitions: TOOL_DEFINITIONS, executeTool, executeApprovedTool };
}

export const PROPOSAL = '__curieProposal';

function requireExisting(service, id) {
  if (typeof id !== 'string' || !service.list().some((task) => task.id === id)) throw new Error('Task not found.');
}
function assertArguments(args, allowed, required) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('Tool arguments must be a JSON object.');
  const missing = required.find((key) => !Object.hasOwn(args, key));
  if (missing) throw new TypeError(`${missing} is required.`);
  const extra = Object.keys(args).find((key) => !allowed.includes(key));
  if (extra) throw new TypeError(`Unexpected argument: ${extra}.`);
}
function publicTask({ id, title, due, status, reminder }) { return { id, title, due, status, reminder: reminder ? { at: reminder.at } : null }; }
function describe(name, args, tasks) {
  const title = name === 'add_task' ? args.title : tasks.find((task) => task.id === (args.id ?? args.task_id))?.title ?? 'task';
  if (name === 'add_task') return args.remind_at_iso ? `Add task and remind you: ${title}, ${formatDate(args.remind_at_iso)}${args.due_iso ? `, due ${formatDate(args.due_iso)}` : ''}` : `Add task: ${title}${args.due_iso ? `, due ${formatDate(args.due_iso)}` : ''}`;
  if (name === 'set_reminder') return `Remind you: ${title}, ${formatDate(args.remind_at_iso)}`;
  return `${name === 'delete_task' ? 'Delete' : 'Mark done'}: ${title}`;
}
function formatDate(value) { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(Date.parse(value)); }
