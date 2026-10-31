import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationService } from '../src/main/conversation-service.js';
import { createAgentController } from '../src/agent/controller.js';
import { createConversationClient, createConfirmationLifecycle } from '../src/renderer/conversation-client.js';

function harness(agent, { alive = { panel: true, ask: true, reminder: true } } = {}) {
  const windows = { panel: { id: 7, isDestroyed: () => !alive.panel }, ask: { id: 8, isDestroyed: () => !alive.ask }, reminder: { id: 9, isDestroyed: () => !alive.reminder } };
  const sent = [];
  const log = [];
  const service = createConversationService({ agent, getWindow: (name) => windows[name], openPanel: () => { alive.panel = true; }, deliver: (name, channel, payload) => { sent.push({ name, channel, payload }); return { delivered: true, exists: true, targetId: windows[name]?.id }; }, log: (line) => log.push(line), randomToken: () => 'confirm-token', timeoutMs: 10000 });
  return { service, sent, log, windows, alive };
}

test('three turns send prior user and assistant messages as in-memory history', async () => {
  const requests = [];
  const providerClient = { complete: async (messages) => { requests.push(messages.map(({ role, content }) => ({ role, content }))); return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: `reply-${requests.length}` } }] }; }, diagnostics: () => ({ provider: 'gemini' }) };
  const agent = createAgentController({ providerClient, taskService: { list: () => [] }, executeTool: async () => {} });
  const h = harness(agent);
  for (let n = 1; n <= 3; n += 1) await h.service.request({ id: `panel-${n}`, windowName: 'panel', message: `user-${n}` });
  assert.deepEqual(requests[2].map(({ role, content }) => [role, content]), [
    ['system', requests[2][0].content], ['user', 'user-1'], ['assistant', 'reply-1'], ['user', 'user-2'], ['assistant', 'reply-2'], ['user', 'user-3'],
  ]);
  assert.equal(h.service.snapshot().histories.panel.length, 6);
});

test('locally handled reminder replies join the three-exchange in-memory bubble history', async () => {
  let receivedHistory;
  const agent = { async send(_message, { history }) { receivedHistory = history; return { text: 'I can help with that.', outcome: 'reply', messages: [...history, { role: 'user', content: 'why?' }, { role: 'assistant', content: 'I can help with that.' }] }; } };
  const h = harness(agent);
  h.service.recordLocalReply({ windowName: 'reminder', message: 'snooze 20 minutes', text: 'Snoozed for 20 minutes.' });
  await h.service.request({ id: 'reminder-followup', windowName: 'reminder', message: 'why?' });
  assert.deepEqual(receivedHistory, [
    { role: 'user', content: 'snooze 20 minutes' },
    { role: 'assistant', content: 'Snoozed for 20 minutes.' },
  ]);
  assert.equal(h.service.snapshot().histories.reminder.length, 4);
});

test('typed yes cannot execute a write; only tokenized confirm-button events work in panel, Ask, and reminder bubble', async (t) => {
  for (const windowName of ['panel', 'ask', 'reminder']) await t.test(windowName, async (windowTest) => {
    for (const toolName of ['add_task', 'set_reminder', 'complete_task', 'delete_task']) await windowTest.test(toolName, async () => {
      const writes = [];
      const agent = { async send(_message, { confirmProposals, onProposalResults }) { const approved = await confirmProposals([{ label: toolName }]); if (approved) writes.push(toolName); onProposalResults([{ name: toolName, resolution: approved ? 'confirmed' : 'cancelled', label: toolName, statusText: approved ? 'Saved' : 'Cancelled', ok: approved }]); return { outcome: 'confirm', text: approved ? 'Confirmed.' : 'Cancelled.', messages: [{ role: 'user', content: 'write' }, { role: 'tool', content: toolName }] }; } };
      const h = harness(agent);
      const request = h.service.request({ id: `${windowName}-${toolName}`, windowName, message: `request ${toolName}` });
      await new Promise((resolve) => setImmediate(resolve));
      const card = h.sent.find((item) => item.channel === 'conversation:confirmation');
      assert.ok(card);
      assert.equal(h.log.filter((line) => line.startsWith(`proposal.confirm-card.${windowName}-${toolName}.`)).length, 1);
      await h.service.request({ id: `${windowName}-typed-yes-${toolName}`, windowName, message: 'yes' });
      assert.deepEqual(writes, []);
      assert.match(h.sent.at(-1).payload.text, /Use the Confirm button below/);
      assert.equal(h.service.confirm({ id: card.payload.requestId, windowName, approved: true, confirmationToken: 'wrong', buttonOrigin: true }), false);
      assert.equal(h.service.confirm({ id: card.payload.requestId, windowName, approved: true, confirmationToken: card.payload.confirmationToken, buttonOrigin: false }), false);
      assert.equal(h.service.confirm({ id: card.payload.requestId, windowName, approved: true, confirmationToken: card.payload.confirmationToken, buttonOrigin: true }), true);
      await request;
      assert.deepEqual(writes, [toolName]);
      assert.ok(h.log.includes(`proposal.resolved.${toolName}.confirmed.${windowName}-${toolName}`));
    });
  });
});

test('reminder agent request receives reminder context and provider failures leave button fallback visible', async () => {
  let receivedContext;
  const agent = { async send(_message, options) { receivedContext = options.context; throw new Error('Both providers failed: rate limit / offline'); } };
  const h = harness(agent);
  await h.service.request({ id: 'reminder-model-1', windowName: 'reminder', message: 'I am avoiding this task', context: { title: 'Read notes', due: '2026-10-26T10:00:00Z', deferral_count: 2, pushback: { pushBack: false }, facts: { status: 'todo' } } });
  assert.deepEqual(receivedContext, { title: 'Read notes', due: '2026-10-26T10:00:00Z', deferral_count: 2, pushback: { pushBack: false }, facts: { status: 'todo' } });
  const result = h.sent.find((item) => item.name === 'reminder' && item.channel === 'conversation:update');
  assert.equal(result.payload.text, "Can't think right now, use the buttons.");
  assert.ok(h.log.includes('reminder.reply.error.provider_failure.reminder-model-1'));
});

test('a reply arriving after its sender closes is delivered to panel with a traceable result-sent stage', async () => {
  let finish;
  const agent = { send: () => new Promise((resolve) => { finish = resolve; }) };
  const alive = { panel: true, ask: true };
  const h = harness(agent, { alive });
  const pending = h.service.request({ id: 'ask-late', windowName: 'ask', message: 'hello' });
  await new Promise((resolve) => setImmediate(resolve));
  alive.ask = false;
  finish({ text: 'Hello back.', outcome: 'reply', toolCalls: [], messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hello back.' }] });
  await pending;
  const update = h.sent.find((item) => item.channel === 'conversation:update');
  assert.equal(update.name, 'panel');
  assert.equal(update.payload.text, 'Hello back.');
  assert.ok(h.log.some((line) => line.includes('result-sent') && line.includes('panel')));
});

test('a pending Ask confirmation moved to panel is cancelled when its Ask session closes', async () => {
  let approvedValue;
  const agent = { async send(_message, { confirmProposals }) { approvedValue = await confirmProposals([{ label: 'Add task: draft' }]); return { outcome: 'confirm', text: 'Cancelled.', messages: [] }; } };
  const h = harness(agent, { alive: { panel: true, ask: false } });
  const pending = h.service.request({ id: 'ask-fallback-confirm', windowName: 'ask', message: 'add a task' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.sent.find((item) => item.channel === 'conversation:confirmation')?.name, 'panel');
  h.service.clearSession('ask');
  await pending;
  assert.equal(approvedValue, false);
});

test('a request from either shell is rejected while the other shell has a live request', async () => {
  let finish;
  const agent = { send: () => new Promise((resolve) => { finish = resolve; }) };
  const h = harness(agent);
  const first = h.service.request({ id: 'panel-in-flight', windowName: 'panel', message: 'first' });
  await new Promise((resolve) => setImmediate(resolve));
  await h.service.request({ id: 'ask-second', windowName: 'ask', message: 'second' });
  assert.equal(h.sent.find((item) => item.payload.requestId === 'ask-second')?.payload.outcome, 'error');
  finish({ text: 'Done.', outcome: 'reply', messages: [] });
  await first;
});

test('shared renderer client renders one outcome and ignores duplicate or late results', () => {
  const sent = [];
  const stages = [];
  const rendered = [];
  const bridge = { send: (value) => sent.push(value), confirm() {}, clear() {}, stage: (_id, name, stage) => stages.push(`${name}:${stage}`), forwardError() {} };
  const client = createConversationClient({ windowName: 'ask', bridge, setTimer: () => 1, clearTimer() {}, onOutcome: (value) => rendered.push(value) });
  const id = client.request('hello');
  const answer = { requestId: id, outcome: 'reply', text: 'Hi.' };
  assert.equal(client.resolve(answer), true);
  assert.equal(client.resolve(answer), false);
  assert.equal(rendered.length, 1);
  assert.ok(stages.includes('ask:renderer-rendered'));
});

test('confirmation lifecycle submits once, shows Saving, and keeps a resolved success or failure line', () => {
  for (const outcome of [
    { approved: true, resolved: 'Saved: Send the draft, reminder 25 Oct 2026, 4:20 PM', calls: 1 },
    { approved: false, resolved: 'Cancelled', calls: 1 },
  ]) {
    const states = [], calls = { confirm: 0, cancel: 0 };
    const lifecycle = createConfirmationLifecycle({ onConfirm: () => { calls.confirm += 1; }, onCancel: () => { calls.cancel += 1; }, onStatus: (state, text) => states.push({ state, text }) });
    assert.equal(lifecycle.activate(outcome.approved), true);
    assert.equal(lifecycle.activate(outcome.approved), false);
    assert.equal(states[0].text, outcome.approved ? 'Saving...' : 'Cancelling...');
    assert.equal(lifecycle.resolve(outcome.resolved), true);
    assert.equal(lifecycle.resolve('duplicate'), false);
    assert.equal(lifecycle.state(), 'done');
    assert.equal(states.at(-1).text, outcome.resolved);
    assert.equal(calls.confirm + calls.cancel, outcome.calls);
  }
});

test('a timeout renders one error and a late provider reply is ignored', () => {
  const rendered = [];
  let fireTimeout;
  const client = createConversationClient({ windowName: 'ask', bridge: { send() {}, confirm() {}, clear() {}, stage() {}, forwardError() {} }, setTimer: (callback) => { fireTimeout = callback; return 1; }, clearTimer() {}, onOutcome: (value) => rendered.push(value) });
  const id = client.request('slow request');
  fireTimeout();
  client.resolve({ requestId: id, outcome: 'reply', text: 'Too late' });
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].outcome, 'error');
  assert.match(rendered[0].text, /timed out/i);
});

test('a panel renderer can receive the missing sender result and render it once after Ask closes', () => {
  const rendered = [];
  const panel = createConversationClient({ windowName: 'panel', bridge: { send() {}, confirm() {}, clear() {}, stage() {}, forwardError() {} }, onOutcome: (value) => rendered.push(value) });
  const result = { requestId: 'ask-from-closed-window', outcome: 'reply', text: 'Delivered to panel.', fallback: true };
  assert.equal(panel.resolve(result), true);
  assert.equal(panel.resolve(result), false);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].text, 'Delivered to panel.');
});

test('a local intent reply is answered without calling the provider and joins history', async () => {
  let called = 0;
  const agent = { async send() { called += 1; return { text: 'model', outcome: 'reply', messages: [] }; } };
  const windows = { panel: { id: 7, isDestroyed: () => false }, ask: { id: 8, isDestroyed: () => false }, reminder: { id: 9, isDestroyed: () => false } };
  const sent = [];
  const log = [];
  const service = createConversationService({
    agent,
    getWindow: (name) => windows[name],
    openPanel: () => {},
    deliver: (name, channel, payload) => { sent.push({ name, channel, payload }); return { delivered: true, exists: true, targetId: 7 }; },
    localReply: ({ message }) => (/^hi$/i.test(message) ? { kind: 'greeting', text: 'Good morning. Nothing due today.' } : null),
    log: (line) => log.push(line),
  });
  await service.request({ id: 'panel-hi', windowName: 'panel', message: 'hi' });
  assert.equal(called, 0);
  assert.equal(sent.at(-1).payload.text, 'Good morning. Nothing due today.');
  assert.ok(log.includes('conversation.local-intent.panel-hi.panel.greeting'));
  assert.deepEqual(service.snapshot().histories.panel, [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'Good morning. Nothing due today.' },
  ]);
});

test('a null local intent falls through to the provider', async () => {
  let called = 0;
  const agent = { async send() { called += 1; return { text: 'model reply', outcome: 'reply', messages: [] }; } };
  const service = createConversationService({
    agent,
    getWindow: () => ({ id: 7, isDestroyed: () => false }),
    openPanel: () => {},
    deliver: () => ({ delivered: true, exists: true, targetId: 7 }),
    localReply: () => null,
  });
  await service.request({ id: 'panel-add', windowName: 'panel', message: 'add a task' });
  assert.equal(called, 1);
});
