import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskService } from '../src/main/task-service.js';

function directoryFor(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-reminders-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('task service catches missed reminders once and leaves them actionable', (t) => {
  const directory = directoryFor(t);
  const filePath = path.join(directory, 'tasks.json');
  let now = Date.parse('2026-11-10T12:00:00Z');
  const first = createTaskService({ filePath, clock: () => now });
  first.add({
    title: 'Review chapter',
    due: '2026-11-10T12:30:00Z',
    reminder: { at: '2026-11-10T11:55:00Z' },
  });
  const fired = first.check().reminders;
  assert.equal(fired.length, 1);
  assert.equal(fired[0].missed, true);
  assert.equal(first.check().reminders.length, 1);

  const restored = createTaskService({ filePath, clock: () => now });
  assert.equal(restored.pending().length, 1);
  restored.resolve(fired[0].task.id, 'dismiss');
  assert.equal(restored.pending().length, 0);
});

test('snooze fires again after ten minutes and done completes the task', (t) => {
  const directory = directoryFor(t);
  let now = Date.parse('2026-11-10T12:00:00Z');
  const service = createTaskService({
    filePath: path.join(directory, 'tasks.json'),
    clock: () => now,
  });
  const task = service.add({
    title: 'Submit lab',
    due: '2026-11-10T12:30:00Z',
    reminder: { at: '2026-11-10T12:00:00Z' },
  });
  service.check();
  service.resolve(task.id, 'snooze');
  now += 10 * 60_000;
  const caught = service.check();
  assert.equal(caught.reminders.length, 1);
  service.resolve(task.id, 'done');
  assert.equal(service.list()[0].status, 'done');
  assert.equal(service.pending().length, 0);
});
