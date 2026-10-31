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

test('tool definitions are exactly the seven requested capabilities', () => assert.deepEqual(TOOL_DEFINITIONS.map((item) => item.function.name), ['add_task', 'list_tasks', 'complete_task', 'delete_task', 'set_reminder', 'start_focus', 'plan_day']));
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
test('tool reminder phrases resolve relative to the fake Asia/Kolkata clock and past time is visible', async () => {
  const { tools } = setup(Date.parse('2026-10-25T15:15:00+05:30'));
  const atTime = await tools.executeTool('add_task', { title: 'Draft', remind_at_iso: 'at 3:20 pm' });
  const relative = await tools.executeTool('add_task', { title: 'Email', remind_at_iso: 'in 2 minutes' });
  assert.equal(atTime.__curieProposal.args.remind_at_iso, '2026-10-25T09:50:00.000Z');
  assert.equal(relative.__curieProposal.args.remind_at_iso, '2026-10-25T09:47:00.000Z');
  await assert.rejects(tools.executeTool('add_task', { title: 'Passed', remind_at_iso: 'at 3:10 pm' }), /already passed today/i);
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
test('add_task carries the effort estimate through confirmation', async () => {
  const { tasks, tools } = setup();
  const proposal = await tools.executeTool('add_task', { title: 'Big prep', due_iso: '2026-11-20T12:00:00Z', estimate_minutes: 600 });
  assert.equal(proposal.__curieProposal.args.estimate_minutes, 600);
  assert.equal(tasks.length, 1);
  tools.executeApprovedTool('add_task', proposal.__curieProposal.args);
  assert.equal(tasks.at(-1).estimateMinutes, 600);
  await assert.rejects(tools.executeTool('add_task', { title: 'Bad estimate', estimate_minutes: 2 }), /5 to 2400/);
  await assert.rejects(tools.executeTool('add_task', { title: 'Bad estimate', estimate_minutes: 9000 }), /5 to 2400/);
});

test('plan_day proposes one card, then saves a parent with timed child blocks', async () => {
  const { tasks, tools } = setup(Date.parse('2026-10-28T04:30:00Z')); // 10:00 IST
  const proposal = await tools.executeTool('plan_day', {
    title: 'Physics today',
    start_iso: '2026-10-28T04:30:00Z',
    blocks: [
      { title: 'Physics: MEC', minutes: 90 },
      { title: 'Physics: EM waves', minutes: 60, subject: 'Physics' },
    ],
  });
  assert.ok(proposal.__curieProposal);
  assert.match(proposal.__curieProposal.label, /Schedule 2 blocks/);
  assert.equal(tasks.length, 1, 'nothing is saved before confirmation');

  const result = tools.executeApprovedTool('plan_day', proposal.__curieProposal.args);
  assert.equal(tasks.length, 4);
  assert.equal(result.tasks.length, 2);
  const parent = tasks.find((task) => task.title === 'Physics today');
  const children = tasks.filter((task) => task.parentId === parent.id);
  assert.equal(children.length, 2);
  assert.equal(children[0].blockStart, '2026-10-28T04:30:00.000Z');
  assert.equal(children[0].blockEnd, '2026-10-28T06:00:00.000Z');
  assert.equal(children[1].blockStart, '2026-10-28T06:05:00.000Z');
  assert.equal(children[1].reminder.at, children[1].blockStart);
  assert.equal(children[1].subject, 'Physics');
});

test('plan_day rejects an overflowing or double-booked plan before showing a card', async () => {
  const { tasks, tools } = setup(Date.parse('2026-10-28T04:30:00Z'));
  await assert.rejects(tools.executeTool('plan_day', {
    start_iso: '2026-10-28T17:00:00Z',
    blocks: [{ title: 'Late chapter', minutes: 45 }],
  }), /quiet hours/);
  tasks.push({ id: 'busy', title: 'Existing class', status: 'todo', blockStart: '2026-10-28T10:15:00Z', blockEnd: '2026-10-28T10:45:00Z', reminder: null });
  await assert.rejects(tools.executeTool('plan_day', {
    start_iso: '2026-10-28T10:00:00Z',
    blocks: [{ title: 'Physics: MEC', minutes: 90 }],
  }), /overlaps Existing class/);
  await assert.rejects(tools.executeTool('plan_day', { start_iso: '2026-10-28T10:00:00Z', blocks: [] }), /at least one block/);
});
