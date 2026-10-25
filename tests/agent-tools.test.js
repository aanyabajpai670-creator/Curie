import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentTools } from '../src/agent/tools.js';
import { TOOL_DEFINITIONS } from '../src/agent/prompts.js';

function setup(now = Date.parse('2026-10-28T04:30:00Z')) {
  const tasks = [{ id: 't1', title: 'Geostrata draft', due: '2026-10-30T12:00:00Z', status: 'todo', reminder: null }];
  const taskService = { list: () => tasks, add: (input) => { const task = { id: `t${tasks.length + 1}`, ...input, status: 'todo' }; tasks.push(task); return task; }, update: (id, changes) => { const task = tasks.find((item) => item.id === id); Object.assign(task, changes); return task; }, complete: (id) => { const task = tasks.find((item) => item.id === id); task.status = 'done'; return task; }, delete: (id) => tasks.splice(tasks.findIndex((item) => item.id === id), 1) };
  const timerService = { dispatch: (action) => ({ action, phase: 'FOCUS' }) };
  return { tasks, taskService, timerService, tools: createAgentTools({ taskService, timerService, clock: () => now }) };
}

test('tool definitions are exactly the six requested capabilities', () => assert.deepEqual(TOOL_DEFINITIONS.map((item) => item.function.name), ['add_task', 'list_tasks', 'complete_task', 'delete_task', 'set_reminder', 'start_focus']));
test('write tools only propose; add task and reminder save together after approval', async () => {
  const { tasks, tools } = setup();
  const proposal = await tools.executeTool('add_task', { title: 'Send draft', remind_at_iso: '2026-10-29T17:00:00+05:30' });
  assert.equal(tasks.length, 1);
  const saved = tools.executeApprovedTool('add_task', proposal.__curieProposal.args);
  assert.equal(tasks.length, 2); assert.equal(saved.reminder.at, '2026-10-29T17:00:00+05:30');
});
test('past dates fail with retryable validation; existing-task reminder only accepts task ID', async () => {
  const { tools } = setup();
  await assert.rejects(tools.executeTool('add_task', { title: 'Late', due_iso: '2026-10-27T20:00:00+05:30' }), /future/);
  await assert.rejects(tools.executeTool('add_task', { title: 'Invalid', due_iso: '2026-02-31T17:00:00+05:30' }), /valid ISO/);
  await assert.rejects(tools.executeTool('set_reminder', { text: 'draft', remind_at_iso: '2026-10-29T17:00:00+05:30' }), /task_id/);
  await assert.rejects(tools.executeTool('set_reminder', { task_id: 'missing', remind_at_iso: '2026-10-29T17:00:00+05:30' }), /Task not found/);
});
test('title cap, task filters, due sort, and 50 item cap are enforced', async () => {
  const { tasks, tools } = setup();
  await assert.rejects(tools.executeTool('add_task', { title: 'x'.repeat(201) }), /200/);
  tasks.push(...Array.from({ length: 60 }, (_, index) => ({ id: `${index}`, title: 'Task', due: `2026-11-${String(10 + index % 15).padStart(2, '0')}T00:00:00Z`, status: index === 1 ? 'done' : 'todo' })));
  const list = await tools.executeTool('list_tasks', { filter: 'open' });
  assert.equal(list.length, 50); assert.ok(Date.parse(list[0].due) <= Date.parse(list.at(-1).due)); assert.ok(list.every((task) => task.status !== 'done'));
});
test('set reminder, complete, delete are all proposals; focus and listing execute immediately', async () => {
  const { tasks, tools } = setup();
  for (const [name, args] of [['set_reminder', { task_id: 't1', remind_at_iso: '2026-10-29T17:00:00+05:30' }], ['complete_task', { id: 't1' }], ['delete_task', { id: 't1' }]]) assert.ok((await tools.executeTool(name, args)).__curieProposal);
  assert.equal(tasks.length, 1);
  assert.equal((await tools.executeTool('start_focus', {})).action, 'startFocus');
  assert.equal((await tools.executeTool('list_tasks', { filter: 'all' })).length, 1);
});
