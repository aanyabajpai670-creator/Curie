import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompletion, runAgentLoop } from '../src/agent/loop.js';
import { TOOL_DEFINITIONS } from '../src/agent/prompts.js';
import { createAskRequestState } from '../src/core/ask-request.js';

function tool(name, args, id = 'call-1') { return { id, type: 'function', function: { name, arguments: args } }; }
function reply(toolCalls, content = '') { return { choices: [{ finish_reason: toolCalls?.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content, tool_calls: toolCalls } }] }; }

test('only the six approved tool definitions exist', () => assert.deepEqual(TOOL_DEFINITIONS.map(({ function: fn }) => fn.name), ['add_task', 'list_tasks', 'complete_task', 'delete_task', 'set_reminder', 'start_focus']));

test('normalizes JSON string and object arguments, missing IDs, multiple calls and empty content', () => {
  const { assistant, finishReason } = normalizeCompletion(reply([tool('list_tasks', '{"filter":"open"}', ''), tool('start_focus', { }),]));
  assert.equal(finishReason, 'tool_calls');
  assert.equal(assistant.tool_calls[0].function.arguments, '{"filter":"open"}');
  assert.equal(assistant.tool_calls[0].id, 'curie-call-1');
  assert.deepEqual(assistant.tool_calls[1].function.arguments, {});
  assert.equal(assistant.content, '');
});

test('malformed/truncated JSON and unknown tools are returned once, then stop if repeated', async () => {
  const messages = [];
  const scripted = [reply([tool('list_tasks', '{bad')]), reply([tool('list_tasks', '{bad')])];
  const result = await runAgentLoop({ messages, tools: TOOL_DEFINITIONS, executeTool: async () => [], requestCompletion: async () => scripted.shift() });
  assert.equal(result.errorType, 'validation_rejected');
  assert.match(result.text, /Validation rejected: Unexpected|JSON|arguments/i);
  assert.ok(messages.some((message) => message.role === 'tool' && /JSON|arguments/.test(message.content)));
  const unknown = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => reply([tool('shell', '{}')]) });
  assert.equal(unknown.errorType, 'validation_rejected');
});

test('scripted model proposes a tomorrow 5pm reminder; it saves only after grouped confirmation', async () => {
  let saved = false, confirmation;
  const reminder = '2026-10-29T17:00:00+05:30';
  const outputs = [reply([tool('add_task', JSON.stringify({ title: 'Send the draft', remind_at_iso: reminder }))]), reply([], 'Reminder saved.')];
  const result = await runAgentLoop({ messages: [{ role: 'user', content: 'remind me tomorrow 5pm to send the draft' }], tools: TOOL_DEFINITIONS,
    executeTool: async (_name, args) => ({ __curieProposal: { label: `Remind you: ${args.title}, Thu 29 Oct, 5:00 PM`, args } }),
    executeApprovedTool: async () => { saved = true; },
    confirmProposals: async (proposals) => { confirmation = proposals; return true; },
    requestCompletion: async () => outputs.shift() });
  assert.equal(new Date(reminder).toISOString(), '2026-10-29T11:30:00.000Z');
  assert.equal(confirmation[0].args.remind_at_iso, reminder);
  assert.equal(saved, true);
  assert.equal(result.outcome, 'reply');
  assert.equal(result.text, 'Reminder saved.');
});

test('cancel sends user cancelled to the model and never executes a write', async () => {
  let executed = false, seen;
  const outputs = [reply([tool('delete_task', '{"id":"t1"}')]), reply([], 'Okay, cancelled.')];
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => ({ __curieProposal: { label: 'Delete task', args: { id: 't1' } } }), executeApprovedTool: async () => { executed = true; }, confirmProposals: async () => false,
    requestCompletion: async (messages) => { seen = messages; return outputs.shift(); } });
  assert.equal(executed, false);
  assert.ok(seen.some((message) => message.content?.includes('user cancelled')));
  assert.equal(result.text, 'Okay, cancelled.');
});

test('groups several proposed writes into one confirmation', async () => {
  let confirms = 0, commits = 0;
  const outputs = [reply([tool('add_task', '{"title":"A"}'), tool('delete_task', '{"id":"b"}')]), reply([], 'Both changes are saved.')];
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async (name, args) => ({ __curieProposal: { name, label: name, args } }), executeApprovedTool: async () => { commits += 1; }, confirmProposals: async (items) => { confirms += 1; assert.equal(items.length, 2); return true; }, requestCompletion: async () => outputs.shift() });
  assert.equal(confirms, 1); assert.equal(commits, 2); assert.equal(result.outcome, 'reply');
});

test('proposal resolution reports confirmed, cancelled, and execution error per tool', async () => {
  const resolutions = [];
  const run = async (name, approve, executeApprovedTool = async () => {}) => {
    const outputs = [reply([tool(name, '{}')]), reply([], 'Finished.')];
    await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => ({ __curieProposal: { name, label: name, args: {} } }), executeApprovedTool, confirmProposals: async () => approve, onProposalResults: (items) => resolutions.push(...items), requestCompletion: async () => outputs.shift() });
  };
  await run('add_task', true);
  await run('delete_task', false);
  await run('complete_task', true, async () => { throw new Error('write failed'); });
  assert.deepEqual(resolutions.map(({ name, resolution }) => [name, resolution]), [['add_task', 'confirmed'], ['delete_task', 'cancelled'], ['complete_task', 'error']]);
});

test('empty model content and truncated output are visible error outcomes', async () => {
  const empty = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '', tool_calls: [] } }] }) });
  assert.equal(empty.errorType, 'empty_reply'); assert.match(empty.text, /Empty model reply/);
  const cutOff = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => ({ ...{ choices: [{ finish_reason: 'length', message: { content: '', tool_calls: [] } }] }, __curieProvider: 'gemini' }), maxOutputTokensFor: () => 2048 });
  assert.equal(cutOff.errorType, 'output_cut_off'); assert.equal(cutOff.text, 'Reply cut off at 2048 tokens. Raise the output limit in Settings.');
});

test('cut off reply produces one settings instruction and does not retry', async () => {
  let calls = 0;
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, maxOutputTokensFor: () => 2560,
    requestCompletion: async () => { calls += 1; return { ...reply([], ''), choices: [{ finish_reason: 'length', message: { content: '', tool_calls: [] } }], __curieProvider: 'gemini' }; } });
  assert.equal(calls, 1);
  assert.equal(result.text, 'Reply cut off at 2560 tokens. Raise the output limit in Settings.');
});

test('plain provider replies remain visible for ordinary finish reasons', async () => {
  for (const finish_reason of ['stop', 'content_filter', null]) {
    const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => ({ choices: [{ finish_reason, message: { content: 'Plain reply', tool_calls: [] } }] }) });
    assert.equal(result.text, 'Plain reply');
  }
});

test('loop exceptions reject with their original code for a visible unknown-error outcome', async () => {
  const error = Object.assign(new Error('unexpected transport failure'), { code: 'E_TEST_TRANSPORT' });
  await assert.rejects(runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => { throw error; } }), (caught) => caught === error);
});

test('closing during confirmation cancels the loop without starting another provider turn', async () => {
  const aborter = new AbortController();
  let requests = 0;
  const resolutions = [];
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => ({ __curieProposal: { label: 'Add task', args: {} } }), executeApprovedTool: async () => {}, signal: aborter.signal, onProposalResults: (items) => resolutions.push(...items),
    requestCompletion: async () => { requests += 1; return reply([tool('add_task', '{"title":"Task"}')]); },
    confirmProposals: async () => { aborter.abort(); return false; } });
  assert.equal(requests, 1);
  assert.equal(result.errorType, 'cancelled');
  assert.equal(resolutions[0].resolution, 'cancelled');
});

test('Ask request state moves idle → pending → confirm/reply/error and never resolves blank', () => {
  const ask = createAskRequestState();
  assert.equal(ask.current().status, 'idle');
  assert.equal(ask.begin(1).status, 'pending');
  assert.equal(ask.confirmation().status, 'confirm');
  assert.equal(ask.begin(2).status, 'pending');
  assert.equal(ask.resolve({ outcome: 'reply', text: 'Done', requestId: 2 }).status, 'reply');
  assert.equal(ask.begin(3).status, 'pending');
  assert.equal(ask.resolve({ outcome: 'error', text: 'Provider error (HTTP 400)', requestId: 3 }).status, 'error');
  assert.match(ask.resolve({ outcome: 'reply', text: '', requestId: 3 }).text, /^No answer produced:/);
  assert.equal(ask.begin(4).status, 'pending');
  assert.equal(ask.timeout().status, 'error');
});

test('Gemini thought signature is preserved unchanged in the assistant tool-call message and next request', async () => {
  const signature = 'opaque-gemini-signature/with+symbols==';
  const calls = [tool('list_tasks', '{"filter":"open"}')];
  calls[0].extra_content = { google: { thought_signature: signature, keep: { exact: true } } };
  const messages = [{ role: 'user', content: 'List tasks' }];
  let requestCount = 0;
  const result = await runAgentLoop({ messages, tools: TOOL_DEFINITIONS, executeTool: async () => [], requestCompletion: async (history) => {
    requestCount += 1;
    if (requestCount === 1) return { ...reply(calls), __curieProvider: 'gemini' };
    const assistant = history.find((message) => message.role === 'assistant');
    assert.deepEqual(assistant.tool_calls[0].extra_content, { google: { thought_signature: signature, keep: { exact: true } } });
    return reply([], 'Here are your tasks.');
  } });
  assert.equal(result.text, 'Here are your tasks.');
  assert.equal(messages[1].tool_calls[0].extra_content.google.thought_signature, signature);
});

test('Gemini response without tool calls is handled without requiring a signature', async () => {
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => ({ ...reply([], 'Hi.'), __curieProvider: 'gemini' }) });
  assert.equal(result.text, 'Hi.');
  assert.equal(result.errorType, undefined);
});

test('Gemini tool call missing its required signature returns a clear error and does not run the tool', async () => {
  let executed = false;
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => { executed = true; }, requestCompletion: async () => ({ ...reply([tool('list_tasks', '{"filter":"all"}')]), __curieProvider: 'gemini' }) });
  assert.equal(executed, false);
  assert.equal(result.errorType, 'missing_thought_signature');
  assert.match(result.text, /without its required thought signature/i);
});

test('loop caps at five model iterations', async () => {
  let calls = 0;
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => [], maxSteps: 20, requestCompletion: async () => { calls += 1; return reply([tool('list_tasks', '{"filter":"all"}')]); } });
  assert.equal(calls, 5); assert.equal(result.iterations, 5); assert.equal(result.errorType, 'max_iterations');
});
