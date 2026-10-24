import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentLoop } from '../src/agent/loop.js';

function call(id, name, args = {}) {
  return {
    role: 'assistant',
    tool_calls: [
      {
        id,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

test('agent loop returns a plain response without tools', async () => {
  const result = await runAgentLoop({
    messages: [],
    tools: [],
    executeTool: async () => {},
    requestCompletion: async () => ({
      choices: [{ message: { content: 'Hi.' } }],
    }),
  });
  assert.equal(result.text, 'Hi.');
  assert.deepEqual(result.toolCalls, []);
});

test('agent loop handles a single tool call and its final answer', async () => {
  const replies = [
    call('one', 'list_tasks'),
    { role: 'assistant', content: 'You have two tasks.' },
  ];
  const result = await runAgentLoop({
    messages: [],
    tools: [],
    executeTool: async () => ['a', 'b'],
    requestCompletion: async () => ({
      choices: [{ message: replies.shift() }],
    }),
  });
  assert.equal(result.text, 'You have two tasks.');
  assert.deepEqual(result.toolCalls, ['list_tasks']);
});

test('agent loop runs multiple tool calls from one response', async () => {
  const first = {
    role: 'assistant',
    tool_calls: [
      { id: 'a', function: { name: 'start_timer', arguments: '{}' } },
      { id: 'b', function: { name: 'list_tasks', arguments: '{}' } },
    ],
  };
  let executed = 0;
  let requested = false;
  const result = await runAgentLoop({
    messages: [],
    tools: [],
    executeTool: async () => {
      executed += 1;
      return 'ok';
    },
    requestCompletion: async () => {
      if (!requested) {
        requested = true;
        return { choices: [{ message: first }] };
      }
      return { choices: [{ message: { content: 'Done.' } }] };
    },
  });
  assert.equal(executed, 2);
  assert.deepEqual(result.toolCalls, ['start_timer', 'list_tasks']);
});

test('tool errors are returned to the model, which can retry', async () => {
  let modelStep = 0;
  let executionCount = 0;
  let sawError = false;
  const result = await runAgentLoop({
    messages: [],
    tools: [],
    executeTool: async () => {
      if (executionCount++ === 0) throw new Error('Invalid due date');
      return { updated: true };
    },
    requestCompletion: async (messages) => {
      modelStep += 1;
      if (modelStep === 1)
        return { choices: [{ message: call('bad', 'update_task') }] };
      if (modelStep === 2) {
        sawError = messages.some(
          (message) =>
            message.role === 'tool' &&
            message.content.includes('Invalid due date'),
        );
        return { choices: [{ message: call('retry', 'update_task') }] };
      }
      return { choices: [{ message: { content: 'Updated it.' } }] };
    },
  });
  assert.equal(sawError, true);
  assert.equal(result.text, 'Updated it.');
});

test('loop stops at the configured max step count', async () => {
  let requests = 0;
  const result = await runAgentLoop({
    messages: [],
    tools: [],
    maxSteps: 2,
    executeTool: async () => 'ok',
    requestCompletion: async () => {
      requests += 1;
      return { choices: [{ message: call(String(requests), 'list_tasks') }] };
    },
  });
  assert.equal(requests, 2);
  assert.match(result.text, /2 tool steps/);
});
