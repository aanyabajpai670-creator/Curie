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

test('a due-only task gets an effort estimate and a local reminder plan', (t) => {
  const directory = directoryFor(t);
  const now = Date.parse('2026-10-31T15:04:00.000Z');
  const lines = [];
  const service = createTaskService({
    filePath: path.join(directory, 'tasks.json'),
    clock: () => now,
    log: (line) => lines.push(line),
    planConfig: () => ({ timeZone: 'Asia/Kolkata', quietHours: { start: '23:00', end: '07:00' } }),
  });
  const task = service.add({ title: 'Submit geostrata article', due: '2026-10-31T16:00:00.000Z' });
  assert.ok(task.estimateMinutes >= 15);
  assert.equal(task.reminder.auto, true);
  assert.ok(task.reminder.schedule.length >= 1);
  assert.ok(Date.parse(task.reminder.schedule[0]) > now);
  assert.ok(lines.some((line) => line.startsWith('reminder.planned.')));
  assert.ok(lines.some((line) => line.startsWith('reminder.saved.')));
});

test('an explicit reminder is kept instead of being replaced by a plan', (t) => {
  const directory = directoryFor(t);
  const now = Date.parse('2026-10-31T12:00:00.000Z');
  const service = createTaskService({ filePath: path.join(directory, 'tasks.json'), clock: () => now });
  const task = service.add({
    title: 'Send the draft',
    due: '2026-11-03T12:00:00.000Z',
    reminder: { at: '2026-11-03T09:00:00.000Z' },
  });
  assert.equal(task.reminder.at, '2026-11-03T09:00:00.000Z');
  assert.equal(task.reminder.auto, false);
  assert.deepEqual(task.reminder.schedule, []);
});

test('changing the due date replans an automatic reminder', (t) => {
  const directory = directoryFor(t);
  const now = Date.parse('2026-10-31T12:00:00.000Z');
  const lines = [];
  const service = createTaskService({
    filePath: path.join(directory, 'tasks.json'),
    clock: () => now,
    log: (line) => lines.push(line),
    planConfig: () => ({ timeZone: 'Asia/Kolkata' }),
  });
  const task = service.add({ title: 'Prepare 4 chapters and mocks', due: new Date(now + 10 * 86_400_000).toISOString() });
  const firstPlan = [...task.reminder.schedule];
  const updated = service.update(task.id, { due: new Date(now + 20 * 86_400_000).toISOString() });
  assert.equal(updated.reminder.auto, true);
  assert.notDeepEqual(updated.reminder.schedule, firstPlan);
  assert.ok(lines.filter((line) => line.startsWith(`reminder.planned.${task.id}.`)).length >= 2);
});

test('startup backfills a plan for an existing due-only task and leaves past-due tasks alone', (t) => {
  const directory = directoryFor(t);
  const filePath = path.join(directory, 'tasks.json');
  const now = Date.parse('2026-10-31T12:00:00.000Z');
  fs.writeFileSync(filePath, JSON.stringify([
    { id: 'future', title: 'Prepare 4 chapters and mocks', due: new Date(now + 5 * 86_400_000).toISOString(), status: 'todo', createdAt: new Date(now).toISOString(), reminder: null },
    { id: 'past', title: 'Submit old draft', due: new Date(now - 3_600_000).toISOString(), status: 'todo', createdAt: new Date(now).toISOString(), reminder: null },
  ]));
  const service = createTaskService({
    filePath,
    clock: () => now,
    planConfig: () => ({ timeZone: 'Asia/Kolkata' }),
  });
  const tasks = service.list();
  const future = tasks.find((task) => task.id === 'future');
  const past = tasks.find((task) => task.id === 'past');
  assert.equal(future.reminder.auto, true);
  assert.ok(future.reminder.schedule.length >= 1);
  assert.ok(future.estimateMinutes >= 15);
  assert.equal(past.reminder, null);
});

test('editing the due date of a saved due-only task starts a plan', (t) => {
  const directory = directoryFor(t);
  const filePath = path.join(directory, 'tasks.json');
  const now = Date.parse('2026-10-31T12:00:00.000Z');
  fs.writeFileSync(filePath, JSON.stringify([
    { id: 'old', title: 'Submit old draft', due: new Date(now - 3_600_000).toISOString(), status: 'todo', createdAt: new Date(now).toISOString(), reminder: null },
  ]));
  const service = createTaskService({ filePath, clock: () => now, planConfig: () => ({ timeZone: 'Asia/Kolkata' }) });
  assert.equal(service.list()[0].reminder, null);
  const updated = service.update('old', { due: new Date(now + 3 * 86_400_000).toISOString() });
  assert.equal(updated.reminder.auto, true);
  assert.ok(updated.reminder.schedule.length >= 1);
});

test('finishing a day plan finishes its child blocks, but not the reverse', (t) => {
  const directory = directoryFor(t);
  let now = Date.parse('2026-11-10T09:00:00Z');
  const service = createTaskService({ filePath: path.join(directory, 'tasks.json'), clock: () => now });
  const parent = service.add({ title: 'Physics today' });
  const first = service.add({
    title: 'Physics: MEC',
    parentId: parent.id,
    blockStart: '2026-11-10T09:30:00Z',
    blockEnd: '2026-11-10T11:00:00Z',
    due: '2026-11-10T11:00:00Z',
    estimateMinutes: 90,
    reminder: { at: '2026-11-10T09:30:00Z' },
  });
  const second = service.add({
    title: 'Physics: EM waves',
    parentId: parent.id,
    blockStart: '2026-11-10T11:05:00Z',
    blockEnd: '2026-11-10T12:05:00Z',
    due: '2026-11-10T12:05:00Z',
    estimateMinutes: 60,
    reminder: { at: '2026-11-10T11:05:00Z' },
  });

  service.complete(first.id);
  assert.equal(service.list().find((task) => task.id === first.id).status, 'done');
  assert.equal(service.list().find((task) => task.id === second.id).status, 'todo');
  assert.equal(service.list().find((task) => task.id === parent.id).status, 'todo');

  service.complete(parent.id);
  assert.equal(service.list().find((task) => task.id === second.id).status, 'done');
  assert.equal(service.list().find((task) => task.id === parent.id).status, 'done');
  assert.equal(service.pending().length, 0);
});

test('deleting a day plan removes its child blocks and their reminders', (t) => {
  const directory = directoryFor(t);
  let now = Date.parse('2026-11-10T09:00:00Z');
  const service = createTaskService({ filePath: path.join(directory, 'tasks.json'), clock: () => now });
  const parent = service.add({ title: 'Chemistry today' });
  service.add({
    title: 'Chemistry: Organic',
    parentId: parent.id,
    blockStart: '2026-11-10T09:30:00Z',
    blockEnd: '2026-11-10T10:30:00Z',
    due: '2026-11-10T10:30:00Z',
    estimateMinutes: 60,
    reminder: { at: '2026-11-10T09:30:00Z' },
  });
  now = Date.parse('2026-11-10T09:31:00Z');
  assert.equal(service.check().reminders.length, 1);

  service.delete(parent.id);
  assert.deepEqual(service.list(), []);
  assert.equal(service.pending().length, 0);
  assert.throws(() => service.delete('missing'), /not found/);
});
