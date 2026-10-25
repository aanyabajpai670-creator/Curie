export const MAX_STEPS = 5;
const PROPOSAL = '__curieProposal';

export function normalizeCompletion(response) {
  const choice = response?.choices?.[0] ?? {};
  const message = choice.message ?? response?.message ?? response ?? {};
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return {
    assistant: { ...message, tool_calls: calls.map((call, index) => ({
      ...call,
      id: typeof call.id === 'string' && call.id ? call.id : `curie-call-${index + 1}`,
      function: call.function ?? {},
    })) },
    finishReason: choice.finish_reason ?? response?.finish_reason ?? null,
  };
}

export async function runAgentLoop({ messages, tools, executeTool, executeApprovedTool = executeTool, confirmProposals = async () => false, requestCompletion, maxSteps = MAX_STEPS }) {
  const toolCalls = [];
  const invalidSeen = new Set();
  for (let step = 0; step < Math.min(MAX_STEPS, maxSteps); step += 1) {
    const { assistant } = normalizeCompletion(await requestCompletion(messages, tools));
    const calls = assistant.tool_calls;
    if (!calls.length) return { text: plainText(assistant.content), toolCalls, iterations: step + 1 };
    messages.push(assistant);
    const results = [];
    for (const call of calls) {
      const name = call.function.name;
      toolCalls.push(typeof name === 'string' ? name : 'unknown');
      let result;
      try {
        if (typeof name !== 'string' || !tools.some((tool) => tool.function.name === name)) throw new Error('Unknown tool. Choose one of the supplied tools.');
        const args = parseArguments(call.function.arguments);
        result = await executeTool(name, args);
      } catch (error) {
        const message = safeToolError(error);
        const signature = `${name}:${String(call.function.arguments)}`;
        if (invalidSeen.has(signature)) return { text: 'I could not use that tool request. Please try again with a clearer request.', toolCalls, iterations: step + 1, errorType: 'invalid_tool_call' };
        invalidSeen.add(signature);
        result = { __toolError: message, __signature: signature };
      }
      results.push({ call, name, result });
    }

    const proposals = results.filter((item) => item.result && item.result[PROPOSAL]);
    if (proposals.length) {
      const approved = await confirmProposals(proposals.map((item) => item.result[PROPOSAL]));
      for (const item of proposals) {
        if (!approved) item.result = { __toolError: 'user cancelled' };
        else {
          try { item.result = await executeApprovedTool(item.name, item.result[PROPOSAL].args); }
          catch (error) { item.result = { __toolError: safeToolError(error) }; }
        }
      }
    }
    for (const { call, name, result } of results) {
      const failed = result && Object.hasOwn(result, '__toolError');
      messages.push({ role: 'tool', tool_call_id: call.id, name: name ?? 'unknown', content: JSON.stringify(failed ? { ok: false, error: result.__toolError } : { ok: true, result }) });
    }
  }
  return { text: 'I stopped after 5 steps. Please try a smaller request.', toolCalls, iterations: Math.min(MAX_STEPS, maxSteps), errorType: 'max_iterations' };
}

function parseArguments(value) {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') throw new Error('Tool arguments must be a JSON object.');
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tool arguments must be a JSON object.');
  return parsed;
}

function safeToolError(error) {
  const text = String(error?.message || 'Tool failed.').replace(/[\r\n]/g, ' ').slice(0, 300);
  return text || 'Tool failed.';
}

function plainText(content) { return typeof content === 'string' ? content : ''; }
