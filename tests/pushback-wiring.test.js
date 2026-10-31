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