import { DEFAULT_SETTINGS } from '../main/settings-store.js';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_COOLDOWN_MS = 30_000;
export const PROVIDER_DEFAULTS = Object.freeze([
  { id: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: DEFAULT_SETTINGS.geminiModel, apiKeyEnv: 'GEMINI_API_KEY' },
  { id: 'groq', baseURL: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', apiKeyEnv: 'GROQ_API_KEY' },
]);
export function providerBaseURLsFromEnv(env = process.env) {
  return Object.fromEntries(PROVIDER_DEFAULTS.map((provider) => [provider.id, env[provider.id === 'gemini' ? 'GEMINI_BASE_URL' : 'GROQ_BASE_URL'] || provider.baseURL]));
}
export function providersFromEnv(env = process.env) {
  const baseURLs = providerBaseURLsFromEnv(env);
  return PROVIDER_DEFAULTS.map((provider) => ({ ...provider, baseURL: baseURLs[provider.id], apiKey: env[provider.apiKeyEnv] || '' }));
}

export function providerTestLogEvent(provider, host, result) {
  const safeProvider = safeLogPart(provider, 'unknown');
  const safeHost = safeLogPart(host, 'unknown');
  const safeModel = safeLogPart(result.model, 'none');
  const detail = result.status ? `http-${result.status}` : `code-${safeLogPart(result.errorCode, 'none')}`;
  const message = result.providerMessage ? `.message-${result.providerMessage.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200)}` : '';
  const fields = result.requestFields ? `.body-fields-${safeLogPart(result.requestFields.topLevel.join(','), 'none')}.config-fields-${safeLogPart(result.requestFields.providerConfig.join(','), 'none')}.includes-model-${result.requestFields.model ? 'yes' : 'no'}.includes-max-token-${result.requestFields.maxToken ? 'yes' : 'no'}.includes-thinking-${result.requestFields.thinking ? 'yes' : 'no'}` : '';
  return `agent.key.test.${safeProvider}.host-${safeHost}.model-${safeModel}.class-${safeLogPart(result.class, 'unknown')}.${detail}${message}${fields}.tokens.prompt-${result.promptTokens || 0}.output-${result.outputTokens || 0}.thinking-${result.thinkingTokens || 0}.latency-${Math.max(0, Math.round(result.latencyMs || 0))}`;
}
function safeLogPart(value, fallback) { return typeof value === 'string' && value ? value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || fallback : fallback; }

export function createProviderClient({ providers = providersFromEnv(), fetchImpl = globalThis.fetch, clock = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS, geminiTimeoutMs = 30_000, cooldownMs = DEFAULT_COOLDOWN_MS, maxCallsPerDay = 400, maxCallsPerMinute = 20, maxOutputTokens = 512, usageStore, onAttempt = () => {} } = {}) {
  const cooldowns = new Map();
  let activeProviders = providers;
  let limits = { maxCallsPerDay, maxCallsPerMinute };
  const localCalls = [];
  const localUsage = { date: '', count: 0 };
  let last = { provider: 'none', errorType: 'none', latencyMs: 0 };
  const recentErrors = [];

  function useBudget() {
    const now = clock();
    const date = localDate(now);
    let count;
    if (usageStore) count = usageStore.consume({ now, date, limit: limits.maxCallsPerDay });
    else {
      if (localUsage.date !== date) { localUsage.date = date; localUsage.count = 0; }
      while (localCalls.length && now - localCalls[0] >= 60_000) localCalls.shift();
      if (localUsage.count >= limits.maxCallsPerDay) throw budgetError('daily');
      if (localCalls.length >= limits.maxCallsPerMinute) throw budgetError('minute');
      localUsage.count += 1; localCalls.push(now); count = localUsage.count;
    }
    if (usageStore) {
      const minuteCount = usageStore.countMinute?.(now) ?? 0;
      if (minuteCount > limits.maxCallsPerMinute) throw budgetError('minute');
    }
    return count;
  }
  function setProviders(value) { activeProviders = value; }
  function setLimits(value) { limits = { ...limits, ...value }; }
  function diagnostics() {
    const usage = usageStore?.snapshot?.(clock()) ?? { callsToday: localUsage.date === localDate(clock()) ? localUsage.count : 0, callsThisMinute: localCalls.filter((at) => clock() - at < 60_000).length };
    return { ...last, ...usage, maxCallsPerDay: limits.maxCallsPerDay, maxCallsPerMinute: limits.maxCallsPerMinute, keys: Object.fromEntries(activeProviders.map((p) => [p.id, Boolean(p.apiKey)])) };
  }
  async function complete(messages, tools, signal) {
    last = { provider: 'none', errorType: 'none', latencyMs: 0 };
    const available = activeProviders.filter((provider) => provider.apiKey);
    if (!available.length) throw new Error('Add a Gemini or Groq API key in API keys to use chat.');
    recentErrors.length = 0;
    const ready = available.filter((provider) => (cooldowns.get(provider.id) || 0) <= clock());
    const ordered = ready.length ? ready : available;
    let lastError;
    for (const provider of ordered) {
      useBudget();
      const started = clock();
      try {
        const response = await requestProvider(provider, messages, tools, fetchImpl, provider.id === 'gemini' ? geminiTimeoutMs : timeoutMs, maxOutputTokens, signal);
        const usage = extractUsage(response);
        last = { provider: provider.id, errorType: 'none', latencyMs: Math.max(0, clock() - started), ...usage };
        onAttempt({ provider: provider.id, errorType: 'none', latencyMs: last.latencyMs, ...usage });
        response.__curieProvider = provider.id;
        return response;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
        recentErrors.push(error);
        const fallback = canFallback(error) && ordered[ordered.indexOf(provider) + 1] !== undefined;
        const errorType = error.status === 400 && fallback ? 'bad_request_fell_back' : classify(error);
        last = { provider: provider.id, errorType, status: error.status || null, providerMessage: error.providerMessage || '', errorCode: errorCode(error) || null, latencyMs: Math.max(0, clock() - started), ...extractUsage(error.usage) };
        onAttempt({ ...last, providerMessage: error.providerMessage || '', status: error.status || null });
        if (!canFallback(error)) throw friendlyProviderError(provider, error);
        cooldowns.set(provider.id, clock() + cooldownMs);
      }
    }
    if (ordered.length > 1 && recentErrors.length === ordered.length && recentErrors.every((error) => error.status === 400)) throw new Error('Both providers rejected the request. Check the request or model configuration.');
    if (ordered.length > 1 && recentErrors.length === ordered.length) last = { ...last, aggregateFailure: true };
    if (ordered.length === 1 && (lastError?.status === 401 || lastError?.status === 403)) throw friendlyProviderError(ordered[0], lastError);
    throw new Error('Both providers failed: rate limit / offline', { cause: lastError });
  }
  async function testProvider(id, key, model) {
    const base = activeProviders.find((provider) => provider.id === id);
    if (!base || typeof key !== 'string' || !key.trim()) return { class: 'unknown', status: null, errorCode: null, model: '', availableModels: [], latencyMs: 0, message: 'Enter a key first.' };
    const chosenModel = typeof model === 'string' && model.trim() ? model.trim() : base.model;
    const started = clock();
    try {
      useBudget();
      const { response, requestFields } = await testFetch(base, key.trim(), chosenModel, fetchImpl, base.id === 'gemini' ? 30_000 : timeoutMs);
      let availableModels = [];
      if (response.status === 404) {
        try {
          useBudget();
          const modelsResponse = await listModels(base, key.trim(), fetchImpl, base.id === 'gemini' ? 30_000 : timeoutMs);
          if (modelsResponse.ok) availableModels = extractModelIds(await modelsResponse.json());
        } catch { /* Preserve the original model-not-found response if discovery fails. */ }
      }
      const providerMessage = response.status === 400 ? await responseErrorMessage(response, key.trim()) : '';
      let usage = {};
      if (response.status >= 200 && response.status < 300 && typeof response.json === 'function') {
        try { usage = extractUsage(await response.json()); } catch { /* A successful HTTP status remains a successful key test. */ }
      }
      return { ...resultFromStatus(response.status, chosenModel, availableModels, Math.max(0, clock() - started), providerMessage), ...usage, ...(response.status === 400 && base.id === 'gemini' ? { requestFields } : {}) };
    } catch (error) {
      return resultFromError(error, chosenModel, Math.max(0, clock() - started));
    }
  }
  return { complete, testProvider, cooldowns, setProviders, setLimits, diagnostics };
}

async function testFetch(provider, apiKey, model, fetchImpl, timeoutMs) {
  const url = new URL('chat/completions', ensureSlash(provider.baseURL));
  const headers = provider.id === 'gemini'
    ? { 'x-goog-api-key': apiKey, 'content-type': 'application/json' }
    : { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' };
  const body = {
    model,
    messages: [{ role: 'user', content: 'Reply OK.' }],
    max_tokens: provider.id === 'gemini' ? 1024 : 16,
    ...(provider.id === 'gemini' ? { extra_body: { google: { thinking_config: { thinking_level: 'low' } } } } : {}),
  };
  const response = await requestWithTimeout(fetchImpl, url, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  }, timeoutMs);
  return { response, requestFields: requestFieldNames(body) };
}

function requestFieldNames(body) {
  const providerConfig = [];
  function names(value, path = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [name, child] of Object.entries(value)) {
      const next = path ? `${path}.${name}` : name;
      providerConfig.push(next);
      names(child, next);
    }
  }
  names(body.extra_body);
  return { topLevel: Object.keys(body), providerConfig, model: Object.hasOwn(body, 'model'), maxToken: Object.hasOwn(body, 'max_tokens') || Object.hasOwn(body, 'max_output_tokens'), thinking: providerConfig.some((name) => /thinking/i.test(name)) };
}

async function listModels(provider, apiKey, fetchImpl, timeoutMs) {
  const url = new URL('models', ensureSlash(provider.baseURL));
  const headers = provider.id === 'gemini'
    ? { 'x-goog-api-key': apiKey }
    : { authorization: 'Bearer ' + apiKey };
  return requestWithTimeout(fetchImpl, url, { method: 'GET', headers }, timeoutMs);
}

async function requestWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Request timed out'), { timeout: true, code: 'ETIMEDOUT' })); }, timeoutMs);
  });
  try {
    return await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), timedOut]);
  } finally { clearTimeout(timeout); }
}

function resultFromStatus(status, model, availableModels, latencyMs, providerMessage = '') {
  const className = status >= 200 && status < 300 ? 'ok'
    : status === 401 || status === 403 ? 'auth_failed'
      : status === 400 ? 'bad_request'
        : status === 404 ? 'model_not_found'
          : status === 429 ? 'rate_limited'
            : status >= 500 && status < 600 ? 'server_error' : 'unknown';
  const message = className === 'ok' ? `OK (HTTP ${status})`
    : className === 'auth_failed' ? `Authentication failed (HTTP ${status})`
      : className === 'bad_request' ? `Bad request (HTTP ${status}); model: ${model}${providerMessage ? ` — ${providerMessage}` : ''}`
        : className === 'model_not_found' ? `Model not found: ${model} (HTTP ${status}). Model availability was checked at runtime.`
          : className === 'rate_limited' ? `Rate limited (HTTP ${status})`
            : className === 'server_error' ? `Provider server error (HTTP ${status})`
              : `Unknown response (HTTP ${status})`;
  return { class: className, status, errorCode: null, model, availableModels, latencyMs, providerMessage, message, promptTokens: 0, outputTokens: 0, thinkingTokens: 0 };
}

async function responseErrorMessage(response, apiKey) {
  let message = '';
  try {
    const bodyText = typeof response.text === 'function' ? await response.text() : '';
    if (bodyText) {
      try {
        const body = JSON.parse(bodyText);
        message = body?.error?.message || body?.message || '';
      } catch { message = bodyText; }
    }
  } catch { /* The HTTP class and status remain useful when the body cannot be read. */ }
  return sanitizeProviderMessage(message, apiKey);
}

function sanitizeProviderMessage(value, apiKey = '') {
  let message = typeof value === 'string' ? value : String(value || '');
  if (apiKey) message = message.split(apiKey).join('REDACTED');
  return message.replace(/[\r\n\t]+/g, ' ').replace(/[^A-Za-z0-9 .,;:_()'/-]/g, '_').slice(0, 200).trim();
}

function extractUsage(response) {
  const usage = response?.usage || response?.usageMetadata || {};
  return {
    promptTokens: usage.prompt_tokens ?? usage.promptTokenCount ?? 0,
    outputTokens: usage.completion_tokens ?? usage.candidatesTokenCount ?? 0,
    thinkingTokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.thoughtsTokenCount ?? 0,
  };
}

function resultFromError(error, model, latencyMs) {
  const code = errorCode(error);
  let className = 'unknown';
  if (error.timeout || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') className = 'timeout';
  else if (isTlsCode(code)) className = 'tls_failure';
  else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_FAIL') className = 'dns_failure';
  else if (error.name === 'AbortError' || code === 'ABORT_ERR' || code === 'ERR_ABORTED' || code === 'ERR_BLOCKED_BY_CLIENT') className = 'blocked_or_aborted';
  else if (code === 'ECONNREFUSED') className = 'connection_refused';
  const message = className === 'timeout' ? `Request timed out${code ? ` (${code})` : ''}`
    : className === 'tls_failure' ? `TLS connection failed${code ? ` (${code})` : ''}`
      : className === 'dns_failure' ? `DNS lookup failed${code ? ` (${code})` : ''}`
        : className === 'blocked_or_aborted' ? `Request blocked or aborted${code ? ` (${code})` : ''}`
          : className === 'connection_refused' ? `Connection refused${code ? ` (${code})` : ''}`
            : `Unknown request error (${code || 'no error code'})`;
  return { class: className, status: null, errorCode: code || null, model, availableModels: [], latencyMs, message };
}

function errorCode(error) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1, current = current.cause) {
    if (typeof current.code === 'string') return current.code;
  }
  return '';
}
function isTlsCode(code) { return /^(CERT_|ERR_TLS|ERR_SSL|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_CERT_)/.test(code); }
function extractModelIds(body) { return Array.isArray(body?.data) ? body.data.map((item) => item?.id).filter((id) => typeof id === 'string') : []; }

async function requestProvider(provider, messages, tools, fetchImpl, timeoutMs, maxTokens = 512, externalSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  let timeout;
  const timedOut = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Provider request timed out'), { timeout: true })); }, timeoutMs); });
  try {
    const request = (async () => {
      const response = await fetchImpl(new URL('chat/completions', ensureSlash(provider.baseURL)), {
        method: 'POST', headers: { authorization: 'Bearer ' + provider.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: provider.model,
          messages,
          tools,
          max_tokens: maxTokens,
          tool_choice: tools?.length ? 'auto' : undefined,
          ...(provider.id === 'gemini' ? { extra_body: { google: { thinking_config: { thinking_level: 'low' } } } } : {}),
        }), signal: controller.signal,
      });
      if (!response.ok) {
        const providerMessage = response.status === 400 ? await responseErrorMessage(response, provider.apiKey) : '';
        throw Object.assign(new Error(providerMessage || 'Provider returned HTTP ' + response.status), { status: response.status, providerMessage });
      }
      return response.json();
    })();
    return await Promise.race([request, timedOut]);
  } finally { clearTimeout(timeout); externalSignal?.removeEventListener('abort', onExternalAbort); }
}
function ensureSlash(value) { return value.endsWith('/') ? value : value + '/'; }
function canFallback(error) { return error.timeout || error.name === 'AbortError' || error instanceof TypeError || error.status === 400 || error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500; }
function friendlyProviderError(provider, error) {
  if (error.status === 400) return new Error(`${provider.id} rejected the request: ${error.providerMessage || 'check the model or request settings.'}`);
  if (error.status === 401 || error.status === 403) return new Error(`${provider.id} authentication failed. Check the key.`);
  if (error.status === 429) return new Error(`${provider.id} rate limited the request.`);
  if (error.timeout) return new Error(`${provider.id} timed out.`);
  return new Error(`${provider.id} network error. Check your connection.`);
}
function classify(error) { return error.status === 400 ? 'bad_request' : error.status === 429 ? 'rate_limit' : error.status === 401 || error.status === 403 ? 'auth' : error.timeout ? 'timeout' : error instanceof TypeError ? 'network' : error.status ? `http_${error.status}` : 'provider_error'; }
function budgetError(which) { return new Error(which === 'minute' ? 'Curie reached its 20 provider calls per minute limit. Wait a minute and try again.' : 'Curie reached its daily provider-call limit. Try again tomorrow.'); }
function localDate(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms); }
