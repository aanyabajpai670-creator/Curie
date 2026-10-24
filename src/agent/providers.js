const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_COOLDOWN_MS = 30_000;

export const PROVIDER_DEFAULTS = Object.freeze([
  {
    id: 'gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.8-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
  {
    id: 'groq',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKeyEnv: 'GROQ_API_KEY',
  },
]);

export function providersFromEnv(env = process.env) {
  return PROVIDER_DEFAULTS.map((provider) => ({
    ...provider,
    apiKey: env[provider.apiKeyEnv] || '',
  }));
}

export function createProviderClient({
  providers = providersFromEnv(),
  fetchImpl = globalThis.fetch,
  clock = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  maxCallsPerHour = 20,
  maxCallsPerDay = 100,
} = {}) {
  const cooldowns = new Map();
  let activeProviders = providers;
  let limits = { maxCallsPerHour, maxCallsPerDay };
  const calls = [];

  function setProviders(nextProviders) {
    activeProviders = nextProviders;
  }

  function setLimits(nextLimits) {
    limits = nextLimits;
  }

  async function complete(messages, tools) {
    const available = activeProviders.filter((provider) => provider.apiKey);
    if (!available.length) {
      throw new Error(
        'Add a Gemini or Groq API key in Curie settings to use chat.',
      );
    }
    const now = clock();
    while (calls.length && now - calls[0] >= 24 * 60 * 60_000) calls.shift();
    const lastHour = calls.filter((timestamp) => now - timestamp < 60 * 60_000).length;
    if (lastHour >= limits.maxCallsPerHour || calls.length >= limits.maxCallsPerDay) {
      throw new Error('Curie reached the configured chat limit. Try again later or change it in Settings.');
    }
    calls.push(now);
    const ready = available.filter(
      (provider) => (cooldowns.get(provider.id) || 0) <= clock(),
    );
    const ordered = ready.length ? ready : available;
    let lastError;

    for (const provider of ordered) {
      try {
        return await requestProvider(
          provider,
          messages,
          tools,
          fetchImpl,
          timeoutMs,
        );
      } catch (error) {
        lastError = error;
        if (!canFallback(error)) throw friendlyProviderError(provider, error);
        cooldowns.set(provider.id, clock() + cooldownMs);
      }
    }
    throw new Error(
      'All configured providers are unavailable. Check your connection and free-tier limits.',
      {
        cause: lastError,
      },
    );
  }

  return { complete, cooldowns, setProviders, setLimits };
}

async function requestProvider(
  provider,
  messages,
  tools,
  fetchImpl,
  timeoutMs,
) {
  const controller = new AbortController();
  let timeout;
  const timedOut = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        Object.assign(new Error('Provider request timed out'), {
          timeout: true,
        }),
      );
    }, timeoutMs);
  });

  try {
    const request = (async () => {
      const response = await fetchImpl(
        new URL('chat/completions', ensureSlash(provider.baseURL)),
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + provider.apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            tools,
            tool_choice: tools?.length ? 'auto' : undefined,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw Object.assign(
          new Error('Provider returned HTTP ' + response.status),
          { status: response.status },
        );
      }
      return response.json();
    })();
    return await Promise.race([request, timedOut]);
  } finally {
    clearTimeout(timeout);
  }
}

function ensureSlash(value) {
  return value.endsWith('/') ? value : value + '/';
}

function canFallback(error) {
  return (
    error.timeout ||
    error.name === 'AbortError' ||
    error instanceof TypeError ||
    error.status === 429 ||
    error.status >= 500
  );
}

function friendlyProviderError(provider, error) {
  if (error.status === 401 || error.status === 403) {
    return new Error(
      provider.id + ' rejected its API key. Check the key in Settings.',
    );
  }
  if (error.status === 400) {
    return new Error(
      provider.id + ' rejected the request. Check its model and tool settings.',
    );
  }
  return new Error(
    provider.id + ' request failed. Check the connection and try again.',
    { cause: error },
  );
}
