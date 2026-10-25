import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmationGate } from '../src/core/agent-confirmation.js';

test('confirmation remains pending asynchronously until confirm or cancel', async () => {
  let prompt = 0, timerCallback;
  const gate = createConfirmationGate({ setTimer: (callback) => { timerCallback = callback; return 1; }, clearTimer: () => {} });
  const result = gate.request(() => { prompt += 1; });
  assert.equal(prompt, 1); assert.equal(gate.isPending(), true);
  gate.resolve(true); assert.equal(await result, true); assert.equal(gate.isPending(), false);
  assert.equal(timerCallback !== undefined, true);
});

test('window close/Escape cancellation and five-minute unanswered expiry resolve false', async () => {
  const timers = [];
  const gate = createConfirmationGate({ timeoutMs: 300_000, setTimer: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimer: () => {} });
  const closed = gate.request(() => {}); gate.cancel(); assert.equal(await closed, false);
  const unanswered = gate.request(() => {}); assert.equal(timers.at(-1).ms, 300_000); timers.at(-1).callback(); assert.equal(await unanswered, false);
  assert.equal(gate.isPending(), false);
});

test('only one confirmation prompt can be pending', async () => {
  const gate = createConfirmationGate({ setTimer: () => 1, clearTimer: () => {} });
  const first = gate.request(() => {}); const second = await gate.request(() => assert.fail('second prompt should not open'));
  assert.equal(second, false); gate.resolve(false); assert.equal(await first, false);
});
