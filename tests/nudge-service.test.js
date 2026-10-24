import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNudgeService } from '../src/main/nudge-service.js';

test('nudge service saves daily suppression across checks and restarts', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-nudges-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'state.json');
  const dueSoon = {
    id: 'physics',
    title: 'Physics revision',
    due: '2026-10-24T11:00:00Z',
    estimateMinutes: 120,
    status: 'todo',
  };
  const fired = [];
  const config = {
    timeZone: 'Asia/Kolkata',
    quietHours: { start: '23:00', end: '07:00' },
  };
  const service = createNudgeService({
    filePath,
    getTasks: () => [dueSoon],
    config,
    clock: () => Date.parse('2026-10-24T10:00:00Z'),
    onNudge: (nudge) => fired.push(nudge),
  });
  assert.equal(service.check().length, 1);
  assert.equal(service.check().length, 0);
  assert.equal(fired.length, 1);

  const restored = createNudgeService({
    filePath,
    getTasks: () => [dueSoon],
    config,
    clock: () => Date.parse('2026-10-24T10:10:00Z'),
  });
  assert.equal(restored.check().length, 0);
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(saved.count, 1);
  assert.deepEqual(saved.taskIds, ['physics']);
});
