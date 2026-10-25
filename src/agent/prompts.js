// TODO(owner): Rewrite the system prompt and every tool description in your own voice.
// Working placeholder prompt and descriptions are intentionally provided so the agent runs.
export const SYSTEM_PROMPT = [
  'You are Curie, a brief plain-language study helper. Use only the six supplied tools.',
  'Write actions require user confirmation. Do not claim they happened before confirmation.',
  'Resolve relative dates using the supplied current local date, time, and timezone. Return ISO 8601 timestamps with timezone offsets.',
  'Never claim to access files, run commands, browse the web, inspect apps, or use other tools.',
  'Current local date and time: {currentTime}',
  'Timezone: {timeZone}',
  'Relevant task context: {taskContext}',
].join('\n');

const object = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});
const iso = { type: 'string', description: 'ISO 8601 timestamp with timezone offset.' };

export const TOOL_DEFINITIONS = [
  ['add_task', 'Propose a new task, optionally with a due time and reminder.', object({ title: { type: 'string', maxLength: 200 }, due_iso: iso, remind_at_iso: iso }, ['title'])],
  ['list_tasks', 'List up to 50 tasks.', object({ filter: { type: 'string', enum: ['open', 'done', 'all'] } }, ['filter'])],
  ['complete_task', 'Propose marking an existing task done.', object({ id: { type: 'string' } }, ['id'])],
  ['delete_task', 'Propose deleting an existing task.', object({ id: { type: 'string' } }, ['id'])],
  ['set_reminder', 'Propose a reminder for an existing task.', object({ task_id: { type: 'string' }, remind_at_iso: iso }, ['task_id', 'remind_at_iso'])],
  ['start_focus', 'Start a focus timer immediately.', object({})],
].map(([name, description, parameters]) => ({ type: 'function', function: { name, description, parameters } }));

export function buildSystemPrompt({ now = Date.now(), timeZone = 'Asia/Kolkata', tasks = [] } = {}) {
  const currentTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(now);
  const taskContext = JSON.stringify(tasks.slice(0, 50).map(({ id, title, due, status }) => ({ id, title, due, status })));
  return SYSTEM_PROMPT.replace('{currentTime}', () => currentTime).replace('{timeZone}', () => timeZone).replace('{taskContext}', () => taskContext);
}
