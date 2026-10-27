import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentController } from '../src/agent/controller.js';

test('controller injects local time and only minimal active task context per request', async () => {
  let sent;
  const controller = createAgentController({
    providerClient: {
      complete: async (messages) => {
        sent = messages;
        return { choices: [{ message: { content: 'Added.' } }] };
      },
    },
    taskService: {
      list: () => [
        {
          id: 'a',
          title: 'Physics ch 5',
          subject: 'Physics',
          due: '2026-11-10T12:00:00.000Z',
          estimateMinutes: 120,
          status: 'todo',
          notes: 'private detail',
        },
        { id: 'b', title: 'Finished', status: 'done' },
      ],
    },
    executeTool: async () => {},
    timeZone: 'Asia/Kolkata',
    clock: () => Date.parse('2026-10-24T10:00:00Z'),
  });
  const result = await controller.send('Add revision');
  assert.equal(result.text, 'Added.');
  assert.equal(sent.length, 3);
  assert.equal(sent[1].content, 'Add revision');
  assert.ok(sent[0].content.includes('Asia/Kolkata'));
  assert.match(sent[0].content, /Physics ch 5/);
  assert.doesNotMatch(sent[0].content, /private detail|Finished/);
});

test('controller rejects empty or oversized messages before contacting provider', async () => {
  let calls = 0;
  const controller = createAgentController({
    providerClient: {
      complete: async () => {
        calls += 1;
      },
    },
    taskService: { list: () => [] },
    executeTool: async () => {},
  });
  await assert.rejects(controller.send(' '), /Write a message/);
  await assert.rejects(controller.send('x'.repeat(2001)), /2,000/);
  assert.equal(calls, 0);
});

test('reminder context is passed into the existing agent loop as a separate system message', async () => {
  let sent;
  const context = { title: 'Read notes', due: '2026-10-26T10:00:00Z', deferral_count: 2, pushback: { pushBack: false }, facts: { task_id: 't1' } };
  const controller = createAgentController({ providerClient: { complete: async (messages) => { sent = messages; return { choices: [{ message: { content: 'Let’s begin with one page.' } }] }; } }, taskService: { list: () => [] }, executeTool: async () => {} });
  await controller.send('I am putting this off', { context });
  assert.equal(sent[1].role, 'system');
  assert.match(sent[1].content, /Current reminder context \(JSON\)/);
  assert.match(sent[1].content, /deferral_count/);
  assert.deepEqual(JSON.parse(sent[1].content.slice(sent[1].content.indexOf('{'))), context);
});

test('controller rejects a second request while the first is pending', async () => {
  let finish;
  const controller = createAgentController({
    providerClient: { complete: () => new Promise((resolve) => { finish = resolve; }), diagnostics: () => ({ provider: 'gemini', errorType: 'none' }) },
    taskService: { list: () => [] },
    executeTool: async () => {},
  });
  const first = controller.send('first request');
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(controller.send('second request'), /already in progress/);
  finish({ choices: [{ message: { content: 'done' } }] });
  assert.equal((await first).text, 'done');
});
