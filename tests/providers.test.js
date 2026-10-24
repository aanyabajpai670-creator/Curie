import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProviderClient,
  PROVIDER_DEFAULTS,
  providersFromEnv,
} from '../src/agent/providers.js';

const providers = PROVIDER_DEFAULTS.map((provider) => ({
  ...provider,
  apiKey: provider.id,
}));

function ok(body) {
  return { ok: true, json: async () => body };
}

test('provider defaults use the verified Gemini and Groq models', () => {
  assert.equal(PROVIDER_DEFAULTS[0].model, 'gemini-3.8-flash');
  assert.equal(PROVIDER_DEFAULTS[1].model, 'openai/gpt-oss-120b');
  assert.equal(providersFromEnv({ GEMINI_API_KEY: 'g' })[0].apiKey, 'g');
});

test('429 falls back to the next provider and cools down the first', async () => {
  let now = 100;
  const urls = [];
  const client = createProviderClient({
    providers,
    clock: () => now,
    cooldownMs: 500,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return urls.length === 1
        ? { ok: false, status: 429 }
        : ok({ choices: [] });
    },
  });
  await client.complete([], []);
  assert.match(urls[0], /generativelanguage/);
  assert.match(urls[1], /api.groq.com/);
  assert.equal(client.cooldowns.get('gemini'), 600);
  now = 700;
  await client.complete([], []);
  assert.match(urls[2], /generativelanguage/);
});

test('5xx and request timeouts use the fallback provider', async () => {
  let calls = 0;
  const client = createProviderClient({
    providers,
    timeoutMs: 5,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503 };
      return ok({ choices: [{ message: { content: 'fallback' } }] });
    },
  });
  const result = await client.complete([], []);
  assert.equal(result.choices[0].message.content, 'fallback');

  let timeoutCalls = 0;
  const timeoutClient = createProviderClient({
    providers,
    timeoutMs: 1,
    fetchImpl: async () => {
      timeoutCalls += 1;
      if (timeoutCalls === 1) return new Promise(() => {});
      return ok({ choices: [{ message: { content: 'after timeout' } }] });
    },
  });
  const afterTimeout = await timeoutClient.complete([], []);
  assert.equal(afterTimeout.choices[0].message.content, 'after timeout');
  assert.equal(timeoutCalls, 2);
});

test('missing keys and invalid credentials return clear errors without logging secrets', async () => {
  const empty = createProviderClient({ providers: [] });
  await assert.rejects(empty.complete([], []), /Add a Gemini or Groq API key/);
  const invalid = createProviderClient({
    providers: [providers[0]],
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(invalid.complete([], []), /gemini rejected its API key/);
});

test('chat call limits cap user requests over a rolling hour and 24 hours', async () => {
  let now = 0;
  let calls = 0;
  const client = createProviderClient({
    providers: [providers[0]],
    clock: () => now,
    maxCallsPerHour: 1,
    maxCallsPerDay: 2,
    fetchImpl: async () => { calls += 1; return ok({ choices: [] }); },
  });
  await client.complete([], []);
  await assert.rejects(client.complete([], []), /configured chat limit/);
  now = 60 * 60_000;
  await client.complete([], []);
  await assert.rejects(client.complete([], []), /configured chat limit/);
  now = 24 * 60 * 60_000;
  await client.complete([], []);
  assert.equal(calls, 3);
});
