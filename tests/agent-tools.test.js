import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentTools } from '../src/agent/tools.js';

function services() {
  const tasks = [
    {
      id: 'task-1',
      title: 'Physics',
      subject: 'Science',
      due: null,
      estimateMinutes: 30,
      status: 'todo',
      notes: 'private note',
    },
  ];
  const taskService = {
    list: () => tasks,
    add: (input) => ({ id: 'task-2', ...input, status: 'todo' }),
    update: (id, changes) => ({ ...tasks[0], ...changes, id }),
    complete: (id) => ({ ...tasks[0], id, status: 'done' }),
    delete: (id) => {
      tasks.splice(
        tasks.findIndex((task) => task.id === id),
        1,
      );
    },
  };
  const timerService = {
    dispatch: (action) => ({ action, status: 'running' }),
  };
  return { tasks, taskService, timerService };
}

test('task tools expose only the minimum task fields', async () => {
  const { taskService, timerService } = services();
  const tools = createAgentTools({ taskService, timerService });
  const result = await tools.executeTool('list_tasks');
  assert.equal(result[0].title, 'Physics');
  assert.equal('notes' in result[0], false);
});

test('delete tool requires confirmation and honors cancellation', async () => {
  const setup = services();
  let confirmed = false;
  const tools = createAgentTools({
    taskService: setup.taskService,
    timerService: setup.timerService,
    confirmDelete: async () => confirmed,
  });
  const cancelled = await tools.executeTool('delete_task', { id: 'task-1' });
  assert.equal(cancelled.cancelled, true);
  assert.equal(setup.tasks.length, 1);
  confirmed = true;
  assert.equal(
    (await tools.executeTool('delete_task', { id: 'task-1' })).deleted,
    true,
  );
  assert.equal(setup.tasks.length, 0);
});

test('timer and reminder tools route to their local services', async () => {
  const { taskService, timerService } = services();
  const tools = createAgentTools({ taskService, timerService });
  assert.equal((await tools.executeTool('start_timer')).action, 'start');
  await tools.executeTool('set_reminder', {
    taskId: 'task-1',
    at: '2026-11-10T12:00:00Z',
  });
});
