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

test('live scheduler says Due now, restart catch-up says Missed, and Skip leaves the task open', (t) => {
  const directory = directoryFor(t);
  const filePath = path.join(directory, 'tasks.json');
  let now = Date.parse('2026-11-10T12:00:00Z');
  const lines = [];
  const first = createTaskService({ filePath, clock: () => now, log: (line) => lines.push(line) });
  first.add({
    title: 'Review chapter',
    due: '2026-11-10T12:30:00Z',
    reminder: { at: '2026-11-10T11:55:00Z' },
  });
  const fired = first.check().reminders;
  assert.equal(fired.length, 1);
  assert.equal(fired[0].missed, false);
  assert.equal(first.check().reminders.length, 1);

  const restored = createTaskService({ filePath, clock: () => now, log: (line) => lines.push(line) });
  assert.equal(restored.pending().length, 1);
  assert.equal(restored.pending()[0].missed, true);
  restored.resolve(fired[0].task.id, 'skip');
  assert.equal(restored.pending().length, 0);
  assert.equal(restored.list()[0].status, 'todo');
  assert.equal(restored.list()[0].reminder.skip_count, 1);
  assert.ok(lines.some((line) => line.startsWith('reminder.skipped.')));
});

test('snooze fires again after ten minutes, persists/logs its count, and done completes the task', (t) => {
  const directory = directoryFor(t);
  let now = Date.parse('2026-11-10T12:00:00Z');
  const lines = [];
  const service = createTaskService({
    filePath: path.join(directory, 'tasks.json'),
    clock: () => now,
    log: (line) => lines.push(line),
  });
  const task = service.add({
    title: 'Submit lab',
    due: '2026-11-10T12:30:00Z',
    reminder: { at: '2026-11-10T12:00:00Z' },
  });
  service.check();
  service.resolve(task.id, 'snooze');
  assert.equal(service.list()[0].reminder.snooze_count, 1);
  assert.ok(lines.some((line) => line.startsWith(`reminder.snooze-count.${task.id}.1`)));
  now += 10 * 60_000;
  const caught = service.check();
  assert.equal(caught.reminders.length, 1);
  service.resolve(task.id, 'done');
  assert.equal(service.list()[0].status, 'done');
  assert.equal(service.pending().length, 0);
});

test('test reminder uses normal resolution actions and is removed when resolved', (t) => {
  for (const action of ['done', 'snooze', 'skip']) {
    const directory = directoryFor(t);
    const lines = [];
    const now = Date.parse('2026-11-10T12:00:00Z');
    const service = createTaskService({ filePath: path.join(directory, 'tasks.json'), clock: () => now, log: (line) => lines.push(line) });
    const task = service.add({ title: 'Test reminder', reminder: { at: new Date(now).toISOString(), is_test: true } });
    assert.equal(task.reminder.is_test, true);
    assert.equal(service.pending()[0].task.id, task.id);
    service.resolveMany([task.id], action, 10);
    assert.deepEqual(service.list(), []);
    assert.equal(service.pending().length, 0);
    assert.ok(lines.some((line) => line.startsWith(`reminder.${action === 'done' ? 'done' : action === 'snooze' ? 'snoozed' : 'skipped'}.${task.id}.`)));
    if (action === 'snooze') assert.ok(lines.includes(`reminder.snooze-count.${task.id}.1`));
    if (action === 'skip') assert.ok(lines.some((line) => line.includes(`skip-count-1`)));
    assert.ok(lines.includes(`reminder.test-removed.${task.id}`));
  }
});

test('startup migrates legacy reminder fields and persists the lifecycle state', (t) => {
  const directory = directoryFor(t);
  const filePath = path.join(directory, 'tasks.json');
  const now = Date.parse('2026-11-10T12:00:00Z');
  fs.writeFileSync(filePath, JSON.stringify([{ id: 'legacy', title: 'Review chapter', subject: '', due: null, estimateMinutes: null, status: 'todo', createdAt: new Date(now - 1000).toISOString(), notes: '', reminder: { at: new Date(now - 60_000).toISOString(), minutesBefore: null, nextAt: null, firedAt: null, dismissed: false } }]));
  const lines = [];
  const service = createTaskService({ filePath, clock: () => now, log: (line) => lines.push(line) });
  assert.equal(service.list()[0].reminder.state, 'pending');
  assert.equal(service.list()[0].reminder.snooze_count, 0);
  assert.equal(service.list()[0].reminder.skip_count, 0);
  assert.ok(lines.some((line) => line.startsWith('reminder.migrated.legacy.pending')));
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8'))[0].reminder.state, 'pending');
  service.start();
  assert.equal(service.pending()[0].missed, true);
  assert.equal(service.list()[0].reminder.state, 'due');
  const id = service.list()[0].id;
  service.markShown([id]);
  assert.equal(service.list()[0].reminder.state, 'shown');
  service.resolve(id, 'done');
  assert.equal(service.list()[0].status, 'done');
  assert.equal(service.list()[0].reminder.state, 'done');
  assert.ok(lines.some((line) => line.startsWith('reminder.due.legacy.')));
  assert.ok(lines.some((line) => line.startsWith('reminder.bubble-shown.legacy.')));
  assert.ok(lines.some((line) => line.startsWith('reminder.done.legacy.')));
  service.stop();
});
