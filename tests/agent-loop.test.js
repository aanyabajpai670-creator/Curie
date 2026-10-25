import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompletion, runAgentLoop } from '../src/agent/loop.js';
import { TOOL_DEFINITIONS } from '../src/agent/prompts.js';

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
  assert.equal(result.errorType, 'invalid_tool_call');
  assert.ok(messages.some((message) => message.role === 'tool' && /JSON|arguments/.test(message.content)));
  const unknown = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => reply([tool('shell', '{}')]) });
  assert.equal(unknown.errorType, 'invalid_tool_call');
});

test('scripted model proposes a tomorrow 5pm reminder; it saves only after grouped confirmation', async () => {
  let saved = false, confirmation;
  const reminder = '2026-10-29T17:00:00+05:30';
  const outputs = [reply([tool('add_task', JSON.stringify({ title: 'Send the draft', remind_at_iso: reminder }))]), reply([], 'Reminder set.')];
  const result = await runAgentLoop({ messages: [{ role: 'user', content: 'remind me tomorrow 5pm to send the draft' }], tools: TOOL_DEFINITIONS,
    executeTool: async (_name, args) => ({ __curieProposal: { label: `Remind you: ${args.title}, Thu 29 Oct, 5:00 PM`, args } }),
    executeApprovedTool: async () => { saved = true; },
    confirmProposals: async (proposals) => { confirmation = proposals; return true; },
    requestCompletion: async () => outputs.shift() });
  assert.equal(new Date(reminder).toISOString(), '2026-10-29T11:30:00.000Z');
  assert.equal(confirmation[0].args.remind_at_iso, reminder);
  assert.equal(saved, true);
  assert.equal(result.text, 'Reminder set.');
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
  const outputs = [reply([tool('add_task', '{"title":"A"}'), tool('delete_task', '{"id":"b"}')]), reply([], 'Done.')];
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async (name, args) => ({ __curieProposal: { name, label: name, args } }), executeApprovedTool: async () => { commits += 1; }, confirmProposals: async (items) => { confirms += 1; assert.equal(items.length, 2); return true; }, requestCompletion: async () => outputs.shift() });
  assert.equal(confirms, 1); assert.equal(commits, 2); assert.equal(result.text, 'Done.');
});

test('provider finish reasons without tool calls return plain content', async () => {
  for (const finish_reason of ['stop', 'length', 'content_filter', null]) {
    const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => {}, requestCompletion: async () => ({ choices: [{ finish_reason, message: { content: 'Plain reply', tool_calls: [] } }] }) });
    assert.equal(result.text, 'Plain reply');
  }
});

test('loop caps at five model iterations', async () => {
  let calls = 0;
  const result = await runAgentLoop({ messages: [], tools: TOOL_DEFINITIONS, executeTool: async () => [], maxSteps: 20, requestCompletion: async () => { calls += 1; return reply([tool('list_tasks', '{"filter":"all"}')]); } });
  assert.equal(calls, 5); assert.equal(result.iterations, 5); assert.equal(result.errorType, 'max_iterations');
});
