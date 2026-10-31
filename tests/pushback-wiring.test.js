// Source-text check: main.js cannot run under node --test, so we verify the wiring
// by reading the source file and checking for expected patterns.
// Pushback behaviour itself is tested in reminder-pushback.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mainPath = path.resolve('src/main/main.js');
const mainText = fs.readFileSync(mainPath, 'utf8');

test('main.js builds pushback through buildPushback', () => {
  assert.match(mainText, /buildPushback\(/);
});

test('main.js does not use module.default fallback pattern', () => {
  assert.doesNotMatch(mainText, /module\.default \|\|/);
});

test('main.js does not reference pushbackStub', () => {
  assert.doesNotMatch(mainText, /pushbackStub/);
});
test('snooze and skip buttons are assessed before they resolve', () => {
  assert.match(mainText, /assessPendingDeferral\(action, ids, minutes\)/);
  assert.match(mainText, /reminder-bubble:pushback/);
  assert.match(mainText, /payload\.confirm === true/);
});

test('typed snooze pushes back before resolving a strong deferral', () => {
  assert.match(mainText, /reminder\.reply\.pushback\./);
  assert.match(mainText, /Say “\$\{phrase\}”/);
});

test('nudges are delivered in-app through the pet badge and panel, not native notifications', () => {
  const notifyNudge = mainText.slice(mainText.indexOf('function notifyNudge'), mainText.indexOf('function notifyShortcutHint'));
  assert.match(notifyNudge, /deliverNotice\(/);
  assert.doesNotMatch(notifyNudge, /new Notification/);
});

test('the reminder bubble can start a focus session and the pet reopens hidden reminders', () => {
  assert.match(mainText, /reminder-bubble:start-focus/);
  assert.match(mainText, /pet:open-reminders/);
});
