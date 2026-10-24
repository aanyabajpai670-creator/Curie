export const MAX_STEPS = 6;

export async function runAgentLoop({
  messages,
  tools,
  executeTool,
  requestCompletion,
  maxSteps = MAX_STEPS,
}) {
  const toolCalls = [];

  // Keep this turn in memory only; Curie never writes chat text to its log files.

  // Each model response either finishes the turn or asks us to run local tools.
  for (let step = 0; step < maxSteps; step += 1) {
    // A fresh provider reply is the only input to the next step.
    const response = await requestCompletion(messages, tools);
    const assistant =
      response.choices?.[0]?.message ?? response.message ?? response;
    const calls = assistant.tool_calls || [];

    // Plain text ends the turn, so no tool executes after this point.
    if (calls.length === 0) {
      return { text: assistant.content || '', toolCalls };
    }

    // Keep the assistant's call IDs so the provider can pair each result correctly.
    messages.push(assistant);
    for (const call of calls) {
      const name = call.function?.name;
      toolCalls.push(name || 'unknown tool');
      let content;

      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        const result = await executeTool(name, args);
        content = JSON.stringify({ ok: true, result });
      } catch (error) {
        // The model sees a plain error and may repair its arguments on the next step.
        content = JSON.stringify({
          ok: false,
          error: error.message || 'Tool failed.',
        });
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content,
      });
    }
  }

  return {
    text:
      'I stopped after ' +
      maxSteps +
      ' tool steps. Check the task list for completed actions.',
    toolCalls,
  };
}
