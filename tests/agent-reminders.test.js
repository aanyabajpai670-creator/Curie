import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskService } from '../src/main/task-service.js';
import { createAgentTools } from '../src/agent/tools.js';
import { createAgentController } from '../src/agent/controller.js';
import { evaluateNudges } from '../src/core/nudges.js';
import { runAgentLoop } from '../src/agent/loop.js';
import { TOOL_DEFINITIONS } from '../src/agent/prompts.js';

test('agent-created explicit reminder fires during quiet hours and catches up after simulated sleep', (t) => {
  let now = Date.parse('2026-10-24T16:00:00Z');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-agent-reminder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fired = [];
  const service = createTaskService({ filePath: path.join(dir, 'tasks.json'), clock: () => now, onReminder: (reminder) => fired.push(reminder) });
  const tools = createAgentTools({ taskService: service, timerService: { dispatch: () => ({}) }, clock: () => now });
  const proposed = tools.executeTool('add_task', { title: 'Send the draft', remind_at_iso: '2026-10-24T18:00:00+00:00' });
  return proposed.then((proposal) => {
    assert.equal(service.list().length, 0);
    tools.executeApprovedTool('add_task', proposal.__curieProposal.args);
    assert.equal(service.list().length, 1);
    now = Date.parse('2026-10-24T18:30:00Z'); // 00:00 Asia/Kolkata, after the scheduled 23:30 reminder.
    service.check('resume');
    assert.equal(fired.length, 1);
    assert.equal(fired[0].missed, true);
    assert.equal(fired[0].task.title, 'Send the draft');
    const workTime = Date.parse('2026-10-24T04:00:00Z');
    const quietTasks = Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, title: `Quiet task ${index}`, due: new Date(now + 30 * 60_000).toISOString(), estimateMinutes: 120, status: 'todo' }));
    assert.equal(evaluateNudges(quietTasks, now, { timeZone: 'Asia/Kolkata', quietHours: { start: '23:00', end: '07:00' } }).nudges.length, 0);
    const workTasks = Array.from({ length: 5 }, (_, index) => ({ id: `${index}`, title: `Task ${index}`, due: new Date(workTime + 30 * 60_000).toISOString(), estimateMinutes: 120, status: 'todo' }));
    const nudges = evaluateNudges(workTasks, workTime, { timeZone: 'Asia/Kolkata', quietHours: { start: '23:00', end: '07:00' }, maxPerDay: 3 });
    assert.equal(nudges.nudges.length, 3);
    assert.equal(nudges.state.count, 3);
  });
});

test('agent confirmation saves reminder; scheduler marks it due and the bubble acknowledges it as shown', async (t) => {
  let now = Date.parse('2026-10-24T10:00:00Z');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-agent-full-reminder-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logs = [], alerts = [];
  const bubbleSnapshots = [];
  const service = createTaskService({ filePath: path.join(dir, 'tasks.json'), clock: () => now, log: (line) => logs.push(line),
    onReminder: (reminder) => alerts.push(reminder.task.title),
    onUpdate: (snapshot) => { if (snapshot.reminders.length) bubbleSnapshots.push(snapshot); } });
  const tools = createAgentTools({ taskService: service, timerService: { dispatch: () => ({}) }, clock: () => now });
  const due = new Date(now + 60_000).toISOString();
  let confirm;
  let executions = 0;
  const messages = [{ role: 'user', content: 'remind me in one minute to send the draft' }];
  const pending = runAgentLoop({ messages, tools: TOOL_DEFINITIONS, executeTool: tools.executeTool,
    executeApprovedTool: async (name, args) => { executions += 1; return tools.executeApprovedTool(name, args); },
    confirmProposals: () => new Promise((resolve) => { confirm = resolve; }),
    onProposalResults: (items) => assert.match(items[0].statusText, /^Saved: Send the draft, reminder/),
    requestCompletion: async () => {
      if (messages.length === 1) return { __curieProvider: 'groq', choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [{ id: 'add-reminder', type: 'function', function: { name: 'add_task', arguments: JSON.stringify({ title: 'Send the draft', remind_at_iso: due }) } }] } }] };
      return { __curieProvider: 'groq', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'I saved the reminder.', tool_calls: [] } }] };
    } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.list().length, 0);
  assert.equal(executions, 0);
  confirm(true);
  const result = await pending;
  assert.equal(result.text, 'I saved the reminder.');
  assert.equal(service.list().length, 1);
  assert.equal(executions, 1);
  now += 60_000;
  service.check();
  assert.deepEqual(alerts, ['Send the draft']);
  assert.equal(bubbleSnapshots.at(-1).reminders[0].task.title, 'Send the draft');
  service.markShown([service.list()[0].id]);
  assert.equal(service.list()[0].reminder.state, 'shown');
  assert.ok(logs.some((line) => line.startsWith('reminder.saved.')));
  assert.ok(logs.some((line) => line.startsWith('reminder.scheduled.')));
  assert.ok(logs.some((line) => line.startsWith('scheduler.tick.')));
  assert.ok(logs.some((line) => line.startsWith('reminder.due.')));
  assert.ok(logs.some((line) => line.startsWith('reminder.bubble-shown.')));
  assert.ok(bubbleSnapshots.length > 0);
});

test('when both providers fail, the user gets a plain message and task state stays unchanged', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-agent-fail-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = createTaskService({ filePath: path.join(dir, 'tasks.json') });
  const tools = createAgentTools({ taskService: service, timerService: { dispatch: () => ({}) } });
  const controller = createAgentController({ providerClient: { complete: async () => { throw new Error('Both providers failed: rate limit / offline'); } }, taskService: service, executeTool: tools.executeTool, executeApprovedTool: tools.executeApprovedTool });
  await assert.rejects(controller.send('add a task'), /Both providers failed: rate limit \/ offline/);
  assert.deepEqual(service.list(), []);
});
