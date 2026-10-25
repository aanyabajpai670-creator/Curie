import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskService } from '../src/main/task-service.js';
import { createAgentTools } from '../src/agent/tools.js';
import { createAgentController } from '../src/agent/controller.js';
import { evaluateNudges } from '../src/core/nudges.js';

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
    service.check();
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

test('when both providers fail, the user gets a plain message and task state stays unchanged', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-agent-fail-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = createTaskService({ filePath: path.join(dir, 'tasks.json') });
  const tools = createAgentTools({ taskService: service, timerService: { dispatch: () => ({}) } });
  const controller = createAgentController({ providerClient: { complete: async () => { throw new Error('Both providers failed: rate limit / offline'); } }, taskService: service, executeTool: tools.executeTool, executeApprovedTool: tools.executeApprovedTool });
  await assert.rejects(controller.send('add a task'), /Both providers failed: rate limit \/ offline/);
  assert.deepEqual(service.list(), []);
});
