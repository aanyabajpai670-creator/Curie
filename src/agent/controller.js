import { runAgentLoop } from './loop.js';
import { buildSystemPrompt, TOOL_DEFINITIONS } from './prompts.js';

const MAX_USER_MESSAGE_LENGTH = 2000;

export function createAgentController({
  providerClient,
  taskService,
  executeTool,
  timeZone = () => 'Asia/Kolkata',
  clock = Date.now,
}) {
  async function send(userText) {
    if (typeof userText !== 'string' || !userText.trim()) {
      throw new TypeError('Write a message first.');
    }
    if (userText.length > MAX_USER_MESSAGE_LENGTH) {
      throw new TypeError('Messages must be 2,000 characters or fewer.');
    }

    const activeTasks = taskService
      .list()
      .filter((task) => task.status !== 'done')
      .slice(0, 20)
      .map(({ id, title, subject, due, estimateMinutes, status }) => ({
        id,
        title,
        subject,
        due,
        estimateMinutes,
        status,
      }));
    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt({
          now: clock(),
          timeZone: typeof timeZone === 'function' ? timeZone() : timeZone,
          tasks: activeTasks,
        }),
      },
      { role: 'user', content: userText.trim() },
    ];

    return runAgentLoop({
      messages,
      tools: TOOL_DEFINITIONS,
      executeTool,
      requestCompletion: (conversation, definitions) =>
        providerClient.complete(conversation, definitions),
    });
  }

  return { send };
}
