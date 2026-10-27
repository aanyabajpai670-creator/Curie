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
    provider: response?.__curieProvider || null,
    model: response?.__curieModel || null,
    usage: response?.usage || response?.usageMetadata || {},
  };
}

export async function runAgentLoop({ messages, tools, executeTool, executeApprovedTool = executeTool, confirmProposals = async () => false, onProposalResults = () => {}, maxOutputTokensFor = () => 512, requestCompletion, maxSteps = MAX_STEPS, signal }) {
  const toolCalls = [];
  const proposalResults = [];
  const invalidSeen = new Set();
  let lastValidatorMessage = '';
  let lastCompletion = {};
  for (let step = 0; step < Math.min(MAX_STEPS, maxSteps); step += 1) {
    if (signal?.aborted) return { text: 'Request cancelled because the Ask window closed.', errorType: 'cancelled', outcome: 'error', toolCalls, iterations: step };
    const completion = normalizeCompletion(await requestCompletion(messages, tools, signal));
    if (signal?.aborted) return { text: 'Request cancelled because the Ask window closed.', errorType: 'cancelled', outcome: 'error', toolCalls, iterations: step + 1 };
    lastCompletion = completion;
    const { assistant } = completion;
    const calls = assistant.tool_calls;
    if (!calls.length) {
      const text = plainText(assistant.content).trim();
      const meta = completionMeta(completion, step + 1, toolCalls, lastValidatorMessage);
      if (completion.finishReason === 'length') return { ...meta, proposalResults, text: `Reply cut off at ${maxOutputTokensFor(completion.provider)} tokens. Raise the output limit in Settings.`, errorType: 'output_cut_off' };
      if (!text) return { ...meta, text: 'Empty model reply. Please try again.', errorType: 'empty_reply' };
      messages.push(assistant);
      return { ...meta, proposalResults, text, outcome: 'reply', messages };
    }
    if (completion.provider === 'gemini' && !calls[0]?.extra_content?.google?.thought_signature) {
      return { ...completionMeta(completion, step + 1, toolCalls, lastValidatorMessage), text: 'Gemini returned a function call without its required thought signature. Please retry.', errorType: 'missing_thought_signature' };
    }
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
        lastValidatorMessage = message;
        const signature = `${name}:${String(call.function.arguments)}`;
        if (invalidSeen.has(signature)) return { ...completionMeta(completion, step + 1, toolCalls, lastValidatorMessage), text: `Validation rejected: ${lastValidatorMessage}`, errorType: 'validation_rejected' };
        invalidSeen.add(signature);
        result = { __toolError: message, __signature: signature };
      }
      results.push({ call, name, result });
    }

    const proposals = results.filter((item) => item.result && item.result[PROPOSAL]);
    if (proposals.length) {
      const approved = await confirmProposals(proposals.map((item) => item.result[PROPOSAL]));
      if (signal?.aborted) {
        const cancelled = proposals.map(({ name, result }) => ({ name, resolution: 'cancelled', label: result[PROPOSAL]?.label || 'Requested change', statusText: 'Cancelled', ok: false }));
        try { onProposalResults(cancelled); } catch { /* Resolution logging must not interrupt cancellation. */ }
        return { ...completionMeta(completion, step + 1, toolCalls, lastValidatorMessage), text: 'Request cancelled because the Ask window closed.', errorType: 'cancelled', outcome: 'error', proposalResults: cancelled };
      }
      for (const item of proposals) {
        item.proposal = item.result[PROPOSAL];
        let resolution = 'confirmed';
        if (!approved) { item.result = { __toolError: 'user cancelled' }; resolution = 'cancelled'; }
        else {
          try { item.result = await executeApprovedTool(item.name, item.result[PROPOSAL].args); }
          catch (error) { item.result = { __toolError: safeToolError(error) }; resolution = 'error'; }
        }
        proposalResults.push({ name: item.name, resolution, label: item.proposal?.label || 'Requested change', statusText: proposalStatus(item, approved), ok: approved && !Object.hasOwn(item.result || {}, '__toolError') });
      }
      appendToolResults(messages, results);
      try { onProposalResults(proposalResults.slice(-proposals.length)); } catch { /* Rendering updates must not interrupt tool results. */ }
      continue;
    }
    appendToolResults(messages, results);
  }
  const meta = completionMeta(lastCompletion, Math.min(MAX_STEPS, maxSteps), toolCalls, lastValidatorMessage);
  return { ...meta, text: lastValidatorMessage ? `Iteration limit reached. Last validation message: ${lastValidatorMessage}` : 'Iteration limit reached. Please try a smaller request.', errorType: 'max_iterations' };
}

function proposalStatus(item, approved) {
  if (!approved) return 'Cancelled';
  if (Object.hasOwn(item.result || {}, '__toolError')) return `Failed: ${item.result.__toolError}`;
  const result = item.result || {};
  if (item.name === 'add_task' || item.name === 'set_reminder') {
    const title = result.title || 'task';
    const at = result.reminder?.at;
    return at ? `Saved: ${title}, reminder ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(Date.parse(at))}` : `Saved: ${title}`;
  }
  if (item.name === 'complete_task') return `Saved: task marked done`;
  if (item.name === 'delete_task') return 'Saved: task deleted';
  return 'Saved';
}

function appendToolResults(messages, results) {
  for (const { call, name, result } of results) {
    const failed = result && Object.hasOwn(result, '__toolError');
    messages.push({ role: 'tool', tool_call_id: call.id, name: name ?? 'unknown', content: JSON.stringify(failed ? { ok: false, error: result.__toolError } : { ok: true, result }) });
  }
}

function completionMeta(completion, iterations, toolCalls, lastValidatorMessage) {
  const usage = completion?.usage || {};
  return {
    toolCalls,
    iterations,
    provider: completion?.provider || 'unknown',
    model: completion?.model || 'unknown',
    finishReason: completion?.finishReason || 'none',
    tokenCounts: {
      prompt: usage.prompt_tokens ?? usage.promptTokenCount ?? 0,
      output: usage.completion_tokens ?? usage.candidatesTokenCount ?? 0,
      thinking: usage.completion_tokens_details?.reasoning_tokens ?? usage.thoughtsTokenCount ?? 0,
    },
    lastValidatorMessage,
  };
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
