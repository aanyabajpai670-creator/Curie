// TODO(owner): Rewrite the system prompt and every tool description in your own voice.
export const SYSTEM_PROMPT = [
  'You are Curie, a study helper. Be brief, plain, and casual. Do not use emojis or forced cheerfulness.',
  'Use tools only for the user’s study tasks, reminders, and timer. Never claim an action succeeded until its tool confirms it.',
  'For deleting a task, the app will ask the user for confirmation. If they cancel, do not retry the deletion.',
  'If the date, subject, or task meaning is unclear, ask one short question instead of guessing.',
  'Interpret a duration such as "2 hours" as estimateMinutes=120. Resolve relative dates using the supplied current time and timezone. For a date-only deadline, use 23:59 local time; for a month/day without a year, choose its next occurrence.',
  'You cannot access files, run commands, browse the web, inspect other apps, or take screenshots.',
  'Current local date and time: {currentTime}',
  'Timezone: {timeZone}',
  'Relevant task context (only active tasks, minimal fields): {taskContext}',
].join('\n');

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description:
        'Add a study task with an optional subject, due time, and estimate.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subject: { type: 'string' },
          due: {
            type: 'string',
            description: 'ISO 8601 timestamp with a timezone.',
          },
          estimateMinutes: { type: 'integer', minimum: 1 },
          notes: { type: 'string' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List the user’s study tasks.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Change fields on an existing study task.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          subject: { type: 'string' },
          due: {
            type: 'string',
            description: 'ISO 8601 timestamp with a timezone.',
          },
          estimateMinutes: { type: 'integer', minimum: 1 },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark an existing study task as done.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description:
        'Request deletion of a task; the app must confirm with the user first.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description:
        'Set a reminder at an exact time or a number of minutes before the task is due.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          at: {
            type: 'string',
            description: 'ISO 8601 timestamp with a timezone.',
          },
          minutesBefore: { type: 'integer', minimum: 1 },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_timer',
      description: 'Start or resume the study timer.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_timer',
      description: 'Pause the study timer.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_timer',
      description: 'Reset and stop the study timer.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_timer_status',
      description: 'Check whether the study timer is running, paused, or idle.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

export function buildSystemPrompt({
  now = Date.now(),
  timeZone = 'Asia/Kolkata',
  tasks = [],
} = {}) {
  const currentTime = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(now);
  const taskContext = JSON.stringify(
    tasks
      .filter((task) => task.status !== 'done')
      .slice(0, 20)
      .map(({ id, title, subject, due, estimateMinutes, status }) => ({
        id,
        title,
        subject,
        due,
        estimateMinutes,
        status,
      })),
  );
  return SYSTEM_PROMPT.replace('{currentTime}', () => currentTime)
    .replace('{timeZone}', () => timeZone)
    .replace('{taskContext}', () => taskContext);
}
