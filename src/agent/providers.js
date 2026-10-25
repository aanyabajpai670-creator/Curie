const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_COOLDOWN_MS = 30_000;
export const PROVIDER_DEFAULTS = Object.freeze([
  { id: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash', apiKeyEnv: 'GEMINI_API_KEY' },
  { id: 'groq', baseURL: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', apiKeyEnv: 'GROQ_API_KEY' },
]);
export function providersFromEnv(env = process.env) { return PROVIDER_DEFAULTS.map((provider) => ({ ...provider, apiKey: env[provider.apiKeyEnv] || '' })); }

export function createProviderClient({ providers = providersFromEnv(), fetchImpl = globalThis.fetch, clock = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS, cooldownMs = DEFAULT_COOLDOWN_MS, maxCallsPerDay = 400, maxCallsPerMinute = 20, usageStore, onAttempt = () => {} } = {}) {
  const cooldowns = new Map();
  let activeProviders = providers;
  let limits = { maxCallsPerDay, maxCallsPerMinute };
  const localCalls = [];
  const localUsage = { date: '', count: 0 };
  let last = { provider: 'none', errorType: 'none', latencyMs: 0 };

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
  async function complete(messages, tools) {
    const available = activeProviders.filter((provider) => provider.apiKey);
    if (!available.length) throw new Error('Add a Gemini or Groq API key in API keys to use chat.');
    const ready = available.filter((provider) => (cooldowns.get(provider.id) || 0) <= clock());
    const ordered = ready.length ? ready : available;
    let lastError;
    for (const provider of ordered) {
      useBudget();
      const started = clock();
      try {
        const response = await requestProvider(provider, messages, tools, fetchImpl, timeoutMs);
        last = { provider: provider.id, errorType: 'none', latencyMs: Math.max(0, clock() - started) };
        onAttempt({ provider: provider.id, errorType: 'none', latencyMs: last.latencyMs });
        return response;
      } catch (error) {
        lastError = error;
        last = { provider: provider.id, errorType: classify(error), latencyMs: Math.max(0, clock() - started) };
        onAttempt({ ...last });
        if (!canFallback(error)) throw friendlyProviderError(provider, error);
        cooldowns.set(provider.id, clock() + cooldownMs);
      }
    }
    if (ordered.length === 1 && (lastError?.status === 401 || lastError?.status === 403)) throw friendlyProviderError(ordered[0], lastError);
    throw new Error('Both providers failed: rate limit / offline', { cause: lastError });
  }
  async function testProvider(id, key) {
    const base = activeProviders.find((provider) => provider.id === id);
    if (!base || typeof key !== 'string' || !key.trim()) return 'Enter a key first.';
    useBudget();
    try {
      await requestProvider({ ...base, apiKey: key.trim() }, [{ role: 'user', content: 'Reply OK.' }], undefined, fetchImpl, timeoutMs, 16);
      return 'OK';
    } catch (error) {
      if (error.status === 401 || error.status === 403) return 'Authentication failed';
      if (error.status === 429) return 'Rate limited';
      return 'Network error';
    }
  }
  return { complete, testProvider, cooldowns, setProviders, setLimits, diagnostics };
}

async function requestProvider(provider, messages, tools, fetchImpl, timeoutMs, maxTokens = 512) {
  const controller = new AbortController();
  let timeout;
  const timedOut = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Provider request timed out'), { timeout: true })); }, timeoutMs); });
  try {
    const request = (async () => {
      const response = await fetchImpl(new URL('chat/completions', ensureSlash(provider.baseURL)), {
        method: 'POST', headers: { authorization: 'Bearer ' + provider.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ model: provider.model, messages, tools, max_tokens: maxTokens, tool_choice: tools?.length ? 'auto' : undefined }), signal: controller.signal,
      });
      if (!response.ok) throw Object.assign(new Error('Provider returned HTTP ' + response.status), { status: response.status });
      return response.json();
    })();
    return await Promise.race([request, timedOut]);
  } finally { clearTimeout(timeout); }
}
function ensureSlash(value) { return value.endsWith('/') ? value : value + '/'; }
function canFallback(error) { return error.timeout || error.name === 'AbortError' || error instanceof TypeError || error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500; }
function friendlyProviderError(provider, error) {
  if (error.status === 401 || error.status === 403) return new Error(`${provider.id} authentication failed. Check the key.`);
  if (error.status === 429) return new Error(`${provider.id} rate limited the request.`);
  if (error.timeout) return new Error(`${provider.id} timed out.`);
  return new Error(`${provider.id} network error. Check your connection.`);
}
function classify(error) { return error.status === 429 ? 'rate_limit' : error.status === 401 || error.status === 403 ? 'auth' : error.timeout ? 'timeout' : error instanceof TypeError ? 'network' : error.status ? `http_${error.status}` : 'provider_error'; }
function budgetError(which) { return new Error(which === 'minute' ? 'Curie reached its 20 provider calls per minute limit. Wait a minute and try again.' : 'Curie reached its daily provider-call limit. Try again tomorrow.'); }
function localDate(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms); }
