import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentController } from '../src/agent/controller.js';

function build(seen) {
  return createAgentController({
    providerClient: {
      complete: async (messages, definitions) => {
        seen.push(definitions.map((tool) => tool.function.name));
        return { choices: [{ message: { content: 'ok' } }] };
      },
    },
    taskService: { list: () => [] },
    executeTool: async () => {},
  });
}

test('reminder window is never offered delete_task', async () => {
  const seen = [];
  await build(seen).send('dnt want to do it', { windowName: 'reminder' });
  assert.ok(seen[0].length > 0);
  assert.ok(!seen[0].includes('delete_task'));
  assert.ok(seen[0].includes('complete_task'));
});

test('ask and panel windows still get delete_task', async () => {
  const seen = [];
  await build(seen).send('delete my physics task', { windowName: 'ask' });
  await build(seen).send('delete my physics task', { windowName: 'panel' });
  assert.ok(seen[0].includes('delete_task'));
  assert.ok(seen[1].includes('delete_task'));
});
