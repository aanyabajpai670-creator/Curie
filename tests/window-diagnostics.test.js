import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachWindowDiagnostics, rendererErrorEvent } from '../src/main/window-diagnostics.js';

test('fake webContents forwards warnings, errors, failed loads, and renderer termination with window tags', () => {
  const contents = new EventEmitter();
  const lines = [];
  const detach = attachWindowDiagnostics({ webContents: contents }, 'panel', (line) => lines.push(line), () => ['secret-key']);
  contents.emit('console-message', { level: 'warning', message: 'Warning with secret-key' });
  contents.emit('console-message', { level: 'error', message: 'Error with secret-key' });
  contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://internal.test', true);
  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 9 });
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => line.startsWith('ui.panel.')));
  assert.ok(lines.some((line) => line.includes('console-warning')));
  assert.ok(lines.some((line) => line.includes('console-error')));
  assert.ok(lines.some((line) => line.includes('did-fail-load')));
  assert.ok(lines.some((line) => line.includes('render-process-gone')));
  assert.doesNotMatch(lines.join('\n'), /secret-key|https/);
  detach();
});

test('preload renderer-error payload is tagged and redacts configured credentials', () => {
  const result = rendererErrorEvent('ask', 'unhandled-rejection', 'failed key=private-secret', ['private-secret']);
  assert.deepEqual(result, { windowName: 'ask', kind: 'unhandled-rejection', message: 'failed key__redacted_' });
});
