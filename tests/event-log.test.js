import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAnomalyLogger, createEventLogger } from '../src/main/event-log.js';

test('pet log stores only allowlisted event names and ignores arbitrary text', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-log-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'logs', 'curie.log');
  const logger = createEventLogger(file, () => new Date('2026-10-24T12:00:00Z'));
  assert.equal(logger.log('pet.click'), true);
  assert.equal(logger.log("user's task title"), false);
  assert.equal(fs.readFileSync(file, 'utf8'), '2026-10-24T12:00:00.000Z pet.click\n');
});

test('anomaly diagnostics are rate-limited globally to one line per second', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-anomaly-log-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = 0;
  const filePath = path.join(directory, 'curie.log');
  const eventLogger = createEventLogger(filePath, () => new Date(now));
  const diagnostics = createAnomalyLogger(eventLogger, 1000, () => now);
  assert.equal(diagnostics.log('anomaly.non_finite_cursor'), true);
  assert.equal(diagnostics.log('anomaly.cursor_outside_displays'), false);
  now = 1000;
  assert.equal(diagnostics.log('anomaly.cursor_outside_displays'), true);
  assert.equal(diagnostics.log('pet.click'), false);
  assert.equal(fs.readFileSync(filePath, 'utf8').trim().split('\n').length, 2);
});
