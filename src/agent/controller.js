import { runAgentLoop } from './loop.js';
import { buildSystemPrompt, TOOL_DEFINITIONS } from './prompts.js';

const MAX_USER_MESSAGE_LENGTH = 2000;
export function createAgentController({ providerClient, taskService, executeTool, executeApprovedTool = executeTool, confirmProposals = async () => false, timeZone = () => 'Asia/Kolkata', clock = Date.now, log = () => {} }) {
  let busy = false;
  let last = { provider: 'none', iterations: 0, tools: [], errorType: 'none', latencyMs: 0, finishReason: 'none', tokenCounts: { prompt: 0, output: 0, thinking: 0 }, lastValidatorMessage: '' };
  async function send(userText, { signal } = {}) {
    if (busy) throw new Error('A Curie request is already in progress.');
    if (typeof userText !== 'string' || !userText.trim()) throw new TypeError('Write a message first.');
    if (userText.length > MAX_USER_MESSAGE_LENGTH) throw new TypeError('Messages must be 2,000 characters or fewer.');
    busy = true;
    const started = clock();
    let provider = 'none';
    try {
      const activeTasks = taskService.list().filter((task) => task.status !== 'done').slice(0, 50).map(({ id, title, due, status }) => ({ id, title, due, status }));
      const messages = [
        { role: 'system', content: buildSystemPrompt({ now: clock(), timeZone: typeof timeZone === 'function' ? timeZone() : timeZone, tasks: activeTasks }) },
        { role: 'user', content: userText.trim() },
      ];
      const result = await runAgentLoop({ messages, tools: TOOL_DEFINITIONS, executeTool, executeApprovedTool, confirmProposals, signal, requestCompletion: (conversation, definitions) => {
        provider = 'gemini/groq fallback';
        return providerClient.complete(conversation, definitions, signal);
      } });
      const info = providerClient.diagnostics?.() || {};
      last = { provider: result.provider || info.provider || provider, iterations: result.iterations || 0, tools: [...result.toolCalls], errorType: result.errorType || info.errorType || 'none', latencyMs: Math.max(0, clock() - started), finishReason: result.finishReason || info.finishReason || 'none', tokenCounts: result.tokenCounts || { prompt: info.promptTokens || 0, output: info.outputTokens || 0, thinking: info.thinkingTokens || 0 }, lastValidatorMessage: result.lastValidatorMessage || '' };
      log({ ...last });
      return result;
    } catch (error) {
      const info = providerClient.diagnostics?.() || {};
      last = { provider: info.provider || provider, iterations: 0, tools: [], errorType: info.errorType && info.errorType !== 'none' ? info.errorType : classify(error), latencyMs: Math.max(0, clock() - started), finishReason: info.finishReason || 'none', tokenCounts: { prompt: info.promptTokens || 0, output: info.outputTokens || 0, thinking: info.thinkingTokens || 0 }, lastValidatorMessage: '' };
      log({ ...last });
      throw new Error(friendly(error, info));
    } finally { busy = false; }
  }
  return { send, isBusy: () => busy, diagnostics: () => ({ ...last, ...(providerClient.diagnostics?.() || {}) }) };
}
function classify(error) { return /daily.*limit/.test(error.message) ? 'daily_limit' : /minute.*limit/.test(error.message) ? 'burst_limit' : /authentication/.test(error.message) ? 'auth' : /Both providers/.test(error.message) ? 'provider_failure' : 'request_error'; }
function friendly(error, info = {}) {
  const message = String(error?.message || '');
  if (/daily.*limit|minute.*limit/i.test(message)) return message;
  if (/Add a Gemini or Groq/.test(message)) return 'API key missing. Add a Gemini or Groq API key in API keys.';
  if (info.status) return `Provider error (HTTP ${info.status})${info.providerMessage ? `: ${String(info.providerMessage).slice(0, 200)}` : '.'}`;
  if (info.errorCode) return `Unknown provider error (${String(info.errorCode).slice(0, 40)}).`;
  if (/Both providers rejected the request/.test(message)) return 'Provider error (HTTP 400).';
  if (/rejected the request:/i.test(message)) return message;
  if (/Both providers/.test(message)) return 'Both providers failed: rate limit / offline';
  if (/authentication failed|rate limited|timed out|HTTP \d{3}/i.test(message)) return message;
  if (error?.code) return `Unknown provider error (${String(error.code).slice(0, 40)}).`;
  return 'Unknown error. Curie could not complete the request.';
}
