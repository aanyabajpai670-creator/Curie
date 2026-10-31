import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutRunner } from '../src/main/shortcut-runner.js';

function fakeExecFile(calls, { shortcuts = ['Start Focus', 'End Focus'] } = {}) {
  return (file, args, options, callback) => {
    calls.push({ file, args, options });
    if (args[0] === 'list') callback(null, shortcuts.join('\n'), '');
    else callback(null, '', '');
  };
}

test('shortcuts are disabled by default and on non-macOS platforms', async () => {
  const calls = [];
  const disabled = createShortcutRunner({ execFileImpl: fakeExecFile(calls), startName: 'Start Focus' });
  const windows = createShortcutRunner({
    enabled: true,
    platform: 'win32',
    execFileImpl: fakeExecFile(calls),
    startName: 'Start Focus',
  });
  assert.equal(await disabled.start(), false);
  assert.equal(await windows.start(), false);
  assert.equal(calls.length, 0);
});

test('runs a configured shortcut name as one argument, without shell execution', async () => {
  const calls = [];
  const name = 'Focus; touch /tmp/not-a-command';
  const runner = createShortcutRunner({
    enabled: true,
    platform: 'darwin',
    startName: name,
    execFileImpl: fakeExecFile(calls, { shortcuts: [name] }),
  });
  assert.equal(await runner.start(), true);
  assert.deepEqual(calls.map((call) => call.args), [
    ['list'],
    ['run', name],
  ]);
  assert.equal(calls.every((call) => call.options.shell !== true), true);
});

test('a missing shortcut gives one setup hint per configured name', async () => {
  const hints = [];
  const runner = createShortcutRunner({
    enabled: true,
    platform: 'darwin',
    startName: 'Missing Shortcut',
    execFileImpl: fakeExecFile([], { shortcuts: [] }),
    onHint: (hint) => hints.push(hint),
  });
  assert.equal(await runner.start(), false);
  assert.equal(await runner.start(), false);
  assert.deepEqual(hints, [{ name: 'Missing Shortcut', purpose: 'start' }]);
});
