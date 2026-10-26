import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentController } from '../src/agent/controller.js';
import { createProviderClient, providersFromEnv } from '../src/agent/providers.js';
import { createAgentTools } from '../src/agent/tools.js';
import { createTaskService } from '../src/main/task-service.js';
import { createMockProviderServer, mockText, mockToolCall } from './mock-provider.js';

const mock = createMockProviderServer();
const temporaryRoots = [];
const passed = [];

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-mock-provider-'));
  temporaryRoots.push(root);
  const remindersDue = [];
  const taskService = createTaskService({ filePath: path.join(root, 'tasks.json'), onReminder: (reminder) => remindersDue.push(reminder.task.title) });
  const tools = createAgentTools({ taskService, timerService: { dispatch: () => ({ phase: 'FOCUS' }) } });
  const endpoints = mock.addresses();
  const providers = providersFromEnv({
    GEMINI_API_KEY: 'mock-gemini-key', GROQ_API_KEY: 'mock-groq-key',
    GEMINI_BASE_URL: endpoints.gemini, GROQ_BASE_URL: endpoints.groq,
  });
  const providerClient = createProviderClient({ providers, timeoutMs: 150, geminiTimeoutMs: 150, cooldownMs: 0 });
  let confirm = async () => false;
  const controller = createAgentController({ providerClient, taskService, executeTool: tools.executeTool, executeApprovedTool: tools.executeApprovedTool, confirmProposals: (proposals) => confirm(proposals) });
  return { taskService, controller, remindersDue, setConfirm: (callback) => { confirm = callback; } };
}

async function scenario(name, run) {
  await run();
  passed.push(name);
}

async function main() {
  const endpoints = await mock.start();
  await scenario('mock rejects requests without a Bearer key', async () => {
    for (const endpoint of [endpoints.gemini, endpoints.groq]) {
      const baseURL = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
      const response = await fetch(new URL('chat/completions', baseURL), { method: 'POST', body: '{}' });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error.message, /Authorization: Bearer/);
    }
  });

  await scenario('tool call proposes; Confirm saves and the reminder proceeds through due', async () => {
    const app = setup();
    const remindAt = new Date(Date.now() + 2_000).toISOString();
    mock.enqueue('gemini', mockToolCall('add_task', { title: 'Mock reminder', remind_at_iso: remindAt }), mockText('Reminder saved.'));
    let proposalSeen = false;
    app.setConfirm(async (proposals) => {
        proposalSeen = true;
        assert.equal(proposals.length, 1);
        assert.match(proposals[0].label, /Mock reminder/);
        assert.equal(app.taskService.list().length, 0);
        return true;
    });
    const result = await app.controller.send('remind me in 2 seconds to check the draft');
    assert.equal(proposalSeen, true);
    assert.equal(result.text, 'Reminder saved.');
    assert.equal(app.taskService.list().length, 1);
    const task = app.taskService.list()[0];
    assert.equal(task.reminder.at, remindAt, 'saved reminder retains its scheduled due instant');
    await delay(Math.max(0, Date.parse(remindAt) - Date.now() + 20));
    app.taskService.check('tick');
    assert.equal(app.taskService.pending()[0].task.title, 'Mock reminder');
    assert.deepEqual(app.remindersDue, ['Mock reminder']);
    app.taskService.stop();
  });

  await scenario('Cancel does not save the proposal', async () => {
    const app = setup();
    const remindAt = new Date(Date.now() + 60_000).toISOString();
    mock.enqueue('gemini', mockToolCall('add_task', { title: 'Cancelled reminder', remind_at_iso: remindAt }), mockText('Cancelled.'));
    app.setConfirm(async (proposals) => { assert.equal(proposals.length, 1); return false; });
    const result = await app.controller.send('remind me later to check the draft');
    assert.equal(result.text, 'Cancelled.');
    assert.deepEqual(app.taskService.list(), []);
    app.taskService.stop();
  });

  await scenario('Gemini 429 falls back to Groq plain text', async () => {
    const app = setup();
    mock.enqueue('gemini', { type: '429' });
    mock.enqueue('groq', mockText('Groq fallback reply.'));
    const result = await app.controller.send('say hello');
    assert.equal(result.text, 'Groq fallback reply.');
    assert.equal(result.provider, 'groq');
    assert.deepEqual(mock.requests.slice(-2).map((request) => request.provider), ['gemini', 'groq']);
  });

  await scenario('both providers failing returns the shared cannot-think path', async () => {
    const app = setup();
    mock.enqueue('gemini', { type: '429' });
    mock.enqueue('groq', { type: '500' });
    await assert.rejects(app.controller.send('say hello'), /Both providers failed: rate limit \/ offline/);
  });

  await scenario('scripted timeout falls back to Groq', async () => {
    const app = setup();
    mock.enqueue('gemini', { type: 'timeout' });
    mock.enqueue('groq', mockText('Timeout fallback reply.'));
    const result = await app.controller.send('say hello');
    assert.equal(result.text, 'Timeout fallback reply.');
    assert.equal(result.provider, 'groq');
  });

  await scenario('scripted HTTP 500 can be recovered by Groq', async () => {
    const app = setup();
    mock.enqueue('gemini', { type: '500' });
    mock.enqueue('groq', mockText('Recovered after server error.'));
    const result = await app.controller.send('say hello');
    assert.equal(result.text, 'Recovered after server error.');
  });
}

try {
  await main();
  for (const name of passed) process.stdout.write(`PASS ${name}\n`);
  process.stdout.write(`Mock-provider E2E: ${passed.length} checks passed; ${mock.requests.length} provider HTTP requests.\n`);
} catch (error) {
  process.stderr.write(`FAIL ${error?.stack || error}\n`);
  for (const name of passed) process.stdout.write(`PASS ${name}\n`);
  process.exitCode = 1;
} finally {
  await mock.close().catch((error) => { process.stderr.write(`Mock server close failed: ${error.message}\n`); process.exitCode = 1; });
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
}
