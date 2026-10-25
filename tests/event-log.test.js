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
  for (const source of ['click', 'menu', 'shortcut', 'timer-focus', 'timer-focus-end', 'legacy-api']) {
    assert.equal(logger.log('pet.calm.' + source), true);
  }
  assert.equal(logger.log('pet.calm.timer'), true);
  assert.equal(logger.log('timer.action.pause.menu'), true);
  assert.equal(logger.log("user's task title"), false);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines[0], '2026-10-24T12:00:00.000Z pet.click');
  assert.deepEqual(lines.slice(1).map((line) => line.split(' ').at(-1)), [
    'pet.calm.click', 'pet.calm.menu', 'pet.calm.shortcut',
    'pet.calm.timer-focus', 'pet.calm.timer-focus-end', 'pet.calm.legacy-api',
    'pet.calm.timer', 'timer.action.pause.menu',
  ]);
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

test('provider diagnostics allow sanitized 400 messages and token-count-only events', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-provider-log-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'curie.log');
  const logger = createEventLogger(file, () => new Date('2026-10-25T12:00:00Z'));
  assert.equal(logger.log('agent.request.gemini.tokens.prompt-18.output-112.thinking-103.error-bad_request.latency-20'), true);
  assert.equal(logger.log('agent.request.error.gemini.http-400.Invalid_model_REDACTED'), true);
  const log = fs.readFileSync(file, 'utf8');
  assert.match(log, /prompt-18\.output-112\.thinking-103/);
  assert.match(log, /Invalid_model_REDACTED/);
});
