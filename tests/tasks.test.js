import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskStore, normalizeTask } from '../src/core/tasks.js';

function storeFor(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-tasks-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let id = 0;
  return createTaskStore({
    filePath: path.join(directory, 'tasks.json'),
    clock: () => Date.parse('2026-10-24T10:00:00Z'),
    idGenerator: () => 'task-' + ++id,
  });
}

test('task store creates, lists, updates, completes, and deletes tasks', (t) => {
  const store = storeFor(t);
  const task = store.add({
    title: '  Revise physics  ',
    due: '2026-11-10T18:00:00+05:30',
    estimateMinutes: 120,
  });
  assert.equal(task.title, 'Revise physics');
  assert.equal(task.due, '2026-11-10T12:30:00.000Z');
  assert.equal(store.list().length, 1);
  assert.equal(
    store.update(task.id, { subject: 'Physics' }).subject,
    'Physics',
  );
  assert.equal(store.complete(task.id).status, 'done');
  store.delete(task.id);
  assert.deepEqual(store.list(), []);
});

test('task validation rejects invalid fields and before-due reminders without due dates', (t) => {
  const store = storeFor(t);
  assert.throws(() => store.add({ title: '   ' }), /title/);
  assert.throws(
    () => store.add({ title: 'Essay', estimateMinutes: 0 }),
    /estimateMinutes/,
  );
  assert.throws(
    () => store.add({ title: 'Essay', status: 'pending' }),
    /status/,
  );
  assert.throws(
    () => store.add({ title: 'Essay', due: 'tomorrow' }),
    /ISO timestamp/,
  );
  assert.throws(
    () => store.add({ title: 'Essay', reminder: { minutesBefore: 5 } }),
    /due date/,
  );
});

test('task store persists and reloads JSON records', (t) => {
  const store = storeFor(t);
  store.add({ title: 'Read notes', notes: 'Chapter 2' });
  assert.equal(store.list()[0].notes, 'Chapter 2');
});

test('reminder counters migrate from legacy deferral and dismissed fields and persist', (t) => {
  const store = storeFor(t);
  const migrated = store.add({ title: 'Old reminder', reminder: { at: '2026-11-10T12:00:00Z', dismissed: true, state: 'dismissed', deferralCount: 3 } });
  assert.equal(migrated.reminder.snooze_count, 3);
  assert.equal(migrated.reminder.skip_count, 1);
  const reloaded = store.list()[0];
  assert.equal(reloaded.reminder.snooze_count, 3);
  assert.equal(reloaded.reminder.skip_count, 1);
  assert.equal(normalizeTask({ ...reloaded, reminder: { ...reloaded.reminder, snooze_count: -1, skip_count: -1 } }).reminder.snooze_count, 3);
});
