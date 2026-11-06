import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderClient, providerTestLogEvent, PROVIDER_DEFAULTS, providersFromEnv } from '../src/agent/providers.js';
import { createAgentController } from '../src/agent/controller.js';
const providers = PROVIDER_DEFAULTS.map((provider) => ({ ...provider, apiKey: `${provider.id}-secret` }));
const ok = (body = { choices: [] }) => ({ ok: true, json: async () => body });

test('provider defaults preserve ordered Gemini then Groq models', () => {
  assert.deepEqual(PROVIDER_DEFAULTS.map((item) => item.id), ['gemini', 'groq']);
  assert.equal(PROVIDER_DEFAULTS[0].model, 'gemini-3.5-flash'); assert.equal(PROVIDER_DEFAULTS[1].model, 'openai/gpt-oss-120b');
  assert.equal(providersFromEnv({ GEMINI_API_KEY: 'g' })[0].apiKey, 'g');
});
test('429 falls back and each provider HTTP attempt consumes one call', async () => {
  let count = 0; const headers = [], urls = [];
  const client = createProviderClient({ providers, fetchImpl: async (url, init) => { count += 1; urls.push(String(url)); headers.push(init.headers); return count === 1 ? { ok: false, status: 429, text: async () => 'echo gemini-secret' } : ok(); } });
  await client.complete([], []);
  assert.equal(count, 2); assert.match(urls[0], /generativelanguage/); assert.match(urls[1], /api\.groq\.com/);
  assert.equal(new URL(urls[0]).search, ''); assert.equal(headers[0].authorization, 'Bearer gemini-secret');
  assert.deepEqual(client.diagnostics().provider, 'groq');
});
test('both providers failing returns a short safe message without echoed credential', async () => {
  const client = createProviderClient({ providers, fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'credential gemini-secret echoed' }) });
  await assert.rejects(client.complete([], []), (error) => { assert.equal(error.message, 'Both providers failed: rate limit / offline'); assert.doesNotMatch(error.message, /secret|credential/); return true; });
  assert.doesNotMatch(JSON.stringify(client.diagnostics()), /secret/);
});
test('fake 401/403 bodies that echo a key do not leak to errors or captured request logs', async () => {
  for (const status of [401, 403]) {
    const key = 'NEVER-LOG-this-secret';
    const client = createProviderClient({ providers: [{ ...providers[0], apiKey: key }], fetchImpl: async () => ({ ok: false, status, text: async () => `provider echoed ${key}` }) });
    const logLines = [];
    const controller = createAgentController({ providerClient: client, taskService: { list: () => [] }, executeTool: async () => {}, log: (line) => logLines.push(JSON.stringify(line)) });
    await assert.rejects(controller.send('test request'), (error) => { assert.doesNotMatch(error.message, /NEVER-LOG|provider echoed/); return true; });
    assert.doesNotMatch(logLines.join('\n'), /NEVER-LOG|provider echoed|test request/);
  }
});
test('Gemini 400 errors are sanitised, logged, and fall back to Groq once', async () => {
  const key = providers[0].apiKey;
  const calls = [];
  const attempts = [];
  const client = createProviderClient({ providers, onAttempt: (event) => attempts.push(event), fetchImpl: async (url, init) => {
    calls.push({ host: new URL(url).hostname, body: JSON.parse(init.body) });
    return calls.length === 1
      ? { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: `Invalid parameter; key=${key}` }, request: { body: 'must not surface' } }) }
      : { ...ok(), status: 200 };
  } });
  await client.complete([], []);
  assert.deepEqual(calls.map((call) => call.host), ['generativelanguage.googleapis.com', 'api.groq.com']);
  assert.equal(attempts[0].errorType, 'bad_request_fell_back');
  assert.match(attempts[0].providerMessage, /Invalid parameter; key_REDACTED/);
  assert.doesNotMatch(JSON.stringify(attempts), /gemini-secret|must not surface/);
  assert.equal(calls[0].body.model, 'gemini-3.5-flash');
  assert.equal(calls[0].body.max_tokens, 512);
});

test('400 from both providers stops with one plain message and logs sanitized provider messages', async () => {
  const attempts = [];
  const client = createProviderClient({ providers, onAttempt: (event) => attempts.push(event), fetchImpl: async (_url, init) => {
    const requestKey = init.headers.authorization.replace('Bearer ', '');
    return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: `Bad model ${requestKey}` }, body: 'must not surface' }) };
  } });
  await assert.rejects(client.complete([], []), (error) => {
    assert.equal(error.message, 'Both providers rejected the request. Check the request or model configuration.');
    assert.doesNotMatch(error.message, /secret|Bad model/);
    return true;
  });
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every((attempt) => attempt.status === 400));
  assert.ok(attempts.every((attempt) => attempt.providerMessage === 'Bad model REDACTED'));
  assert.doesNotMatch(JSON.stringify(attempts), /secret|must not surface/);
});

test('Gemini usage token counts are logged without prompt or response text', async () => {
  const attempts = [];
  const client = createProviderClient({ providers: [providers[0]], onAttempt: (event) => attempts.push(event), fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'SECRET RESPONSE TEXT' } }], usage: { prompt_tokens: 18, completion_tokens: 112, completion_tokens_details: { reasoning_tokens: 103 } }, requestEcho: body.messages }) };
  } });
  await client.complete([{ role: 'user', content: 'SECRET PROMPT TEXT' }], []);
  assert.deepEqual({ prompt: attempts[0].promptTokens, output: attempts[0].outputTokens, thinking: attempts[0].thinkingTokens }, { prompt: 18, output: 112, thinking: 103 });
  assert.doesNotMatch(JSON.stringify(attempts), /SECRET RESPONSE|SECRET PROMPT|requestEcho/);
});
test('network, 429, server error, and timeout fall through; 401 maps to auth words', async () => {
  let call = 0;
  const client = createProviderClient({ providers, timeoutMs: 10, fetchImpl: async () => { call += 1; if (call === 1) throw new TypeError('offline'); return ok(); } });
  await client.complete([], []); assert.equal(call, 2);
  const auth = createProviderClient({ providers: [providers[0]], fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'gemini-secret' }) });
  await assert.rejects(auth.complete([], []), /authentication failed/);
});
test('max output tokens are capped and API keys are never put in request URLs', async () => {
  let captured;
  const client = createProviderClient({ providers: [providers[0]], fetchImpl: async (url, init) => { captured = { url: String(url), init }; return ok(); } });
  await client.complete([], []);
  assert.equal(JSON.parse(captured.init.body).max_tokens, 512); assert.equal(new URL(captured.url).search, '');
  assert.equal(captured.init.headers.authorization, 'Bearer gemini-secret');
});
test('daily cap blocks the 401st provider HTTP call and resets at Asia/Kolkata midnight', async () => {
  let now = Date.parse('2026-10-24T12:00:00+05:30'), calls = 0;
  const client = createProviderClient({ providers: [providers[0]], clock: () => now, maxCallsPerDay: 400, fetchImpl: async () => { calls += 1; return ok(); } });
  for (let index = 0; index < 400; index += 1) { await client.complete([], []); now += 60_000; }
  await assert.rejects(client.complete([], []), /daily provider-call limit/); assert.equal(calls, 400);
  now = Date.parse('2026-10-25T18:30:00Z');
  await client.complete([], []); assert.equal(calls, 401);
});
test('20-call burst uses a rolling minute window and clears after the window expires', async () => {
  let now = Date.parse('2026-10-24T12:00:00+05:30'), calls = 0;
  const client = createProviderClient({ providers: [providers[0]], clock: () => now, maxCallsPerDay: 400, maxCallsPerMinute: 20, fetchImpl: async () => { calls += 1; return ok(); } });
  for (let index = 0; index < 20; index += 1) await client.complete([], []);
  await assert.rejects(client.complete([], []), /20 provider calls per minute/); assert.equal(calls, 20);
  now += 60_000; await client.complete([], []); assert.equal(calls, 21);
});
test('daily and rolling-minute counters reset independently on a fake clock', async () => {
  let now = Date.parse('2026-10-24T18:29:00Z');
  const usage = { date: '', calls: 0, times: [], consume({ now: current, date, limit }) { if (date !== this.date) { this.date = date; this.calls = 0; } this.times = this.times.filter((at) => current - at < 60_000); if (this.calls >= limit) throw new Error('daily provider-call limit'); if (this.times.length >= 20) throw new Error('20 provider calls per minute'); this.calls += 1; this.times.push(current); }, countMinute(current) { this.times = this.times.filter((at) => current - at < 60_000); return this.times.length; }, snapshot(current) { return { callsToday: this.calls, callsThisMinute: this.countMinute(current) }; } };
  const client = createProviderClient({ providers: [providers[0]], clock: () => now, maxCallsPerDay: 400, usageStore: usage, fetchImpl: async () => ok() });
  for (let index = 0; index < 20; index += 1) await client.complete([], []);
  now = Date.parse('2026-10-24T18:30:00Z');
  assert.equal(client.diagnostics().callsThisMinute, 0);
  await client.complete([], []); assert.equal(usage.date, '2026-10-25'); assert.equal(usage.calls, 1);
});

test('provider key tests use the configured model and provider-specific token cap/auth', async () => {
  for (const provider of providers) {
    let request;
    const client = createProviderClient({ providers: [provider], fetchImpl: async (url, init) => { request = { url: new URL(url), init }; return { ...ok(), status: 200 }; } });
    const result = await client.testProvider(provider.id, provider.apiKey);
    assert.equal(result.class, 'ok');
    assert.equal(result.status, 200);
    assert.equal(request.url.pathname, provider.id === 'gemini' ? '/v1beta/openai/chat/completions' : '/openai/v1/chat/completions');
    assert.equal(request.url.search, '');
    assert.equal(JSON.parse(request.init.body).max_tokens, provider.id === 'gemini' ? 1024 : 16);
    if (provider.id === 'gemini') {
      assert.equal(request.init.headers['x-goog-api-key'], provider.apiKey);
      assert.equal(request.init.headers.authorization, undefined);
      assert.equal(JSON.parse(request.init.body).model, PROVIDER_DEFAULTS[0].model);
      assert.equal(JSON.parse(request.init.body).extra_body.google.thinking_config.thinking_level, 'low');
    } else assert.equal(request.init.headers.authorization, 'Bearer ' + provider.apiKey);
  }
});

test('Gemini key test exposes a sanitised 400 message and uses its configured model', async () => {
  const key = 'KEY-TO-REDACT';
  let request;
  const client = createProviderClient({ providers: [providers[0]], fetchImpl: async (url, init) => {
    request = { url: new URL(url), body: JSON.parse(init.body) };
    return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: `Invalid argument for ${key}. ${'details '.repeat(50)}` }, leakedRequest: { key } }) };
  } });
  const result = await client.testProvider('gemini', key);
  assert.equal(request.body.model, PROVIDER_DEFAULTS[0].model);
  assert.equal(request.body.max_tokens, 1024);
  assert.equal(result.class, 'bad_request');
  assert.match(result.message, /Invalid argument for REDACTED/);
  assert.ok(result.providerMessage.length <= 200);
  assert.doesNotMatch(JSON.stringify(result), /KEY-TO-REDACT|leakedRequest/);
  const logLine = providerTestLogEvent('gemini', 'generativelanguage.googleapis.com', result);
  assert.match(logLine, /message-Invalid_argument_for_REDACTED/);
  assert.match(logLine, /body-fields-model_messages_max_tokens_extra_body/);
  assert.match(logLine, /config-fields-google_google.thinking_config_google.thinking_config.thinking_level/);
  assert.match(logLine, /includes-model-yes.includes-max-token-yes.includes-thinking-yes/);
  assert.doesNotMatch(logLine, /KEY-TO-REDACT|leakedRequest/);
});

test('Ask controller exposes a sanitised provider 400 message and status', async () => {
  const client = createProviderClient({ providers: [providers[0]], fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Invalid request field' } }) }) });
  const controller = createAgentController({ providerClient: client, taskService: { list: () => [] }, executeTool: async () => {} });
  await assert.rejects(controller.send('hi'), /Provider error \(HTTP 400\): Invalid request field/);
});

test('closing Ask aborts its provider request and does not fall back', async () => {
  const aborter = new AbortController();
  let calls = 0;
  const client = createProviderClient({ providers, fetchImpl: async (_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
  } });
  const pending = client.complete([], [], aborter.signal);
  await new Promise((resolve) => setImmediate(resolve));
  aborter.abort();
  await assert.rejects(pending);
  assert.equal(calls, 1);
});

test('coded provider exceptions reach the Ask caller as a visible unknown error', async () => {
  const error = Object.assign(new Error('transport broke'), { code: 'E_PROVIDER_TEST' });
  const client = createProviderClient({ providers: [providers[0]], fetchImpl: async () => { throw error; } });
  const controller = createAgentController({ providerClient: client, taskService: { list: () => [] }, executeTool: async () => {} });
  await assert.rejects(controller.send('hi'), /Unknown provider error \(E_PROVIDER_TEST\)/);
});

test('provider key test classifies every HTTP result without exposing response bodies', async (t) => {
  const cases = [
    [200, 'ok'], [401, 'auth_failed'], [403, 'auth_failed'], [400, 'bad_request'],
    [404, 'model_not_found'], [429, 'rate_limited'], [500, 'server_error'], [503, 'server_error'], [418, 'unknown'],
  ];
  for (const [status, expected] of cases) await t.test(`HTTP ${status} => ${expected}`, async () => {
    const secret = 'ECHOED-API-KEY-MUST-STAY-PRIVATE';
    const client = createProviderClient({ providers: [providers[0]], fetchImpl: async (_url, init) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ data: [] }), text: async () => init.headers['x-goog-api-key'] }) });
    const result = await client.testProvider('gemini', secret, 'gemini-model-test');
    assert.equal(result.class, expected);
    assert.equal(result.status, status);
    assert.doesNotMatch(JSON.stringify(result), /ECHOED-API-KEY|echo/);
    assert.match(result.message, new RegExp(`HTTP ${status}`));
  });
});

test('test 404 names the requested model and discovers available models at runtime', async () => {
  const calls = [];
  const client = createProviderClient({ providers: [providers[0]], fetchImpl: async (url, init) => {
    calls.push({ url: new URL(url), init });
    return calls.length === 1
      ? { ok: false, status: 404, text: async () => 'private provider error' }
      : { ok: true, status: 200, json: async () => ({ data: [{ id: 'available-one' }, { id: 'available-two' }] }) };
  } });
  const result = await client.testProvider('gemini', 'safe-test-key', 'missing-model');
  assert.equal(result.class, 'model_not_found');
  assert.match(result.message, /model not found: missing-model/i);
  assert.match(result.message, /checked at runtime/i);
  assert.deepEqual(result.availableModels, ['available-one', 'available-two']);
  assert.equal(calls[1].url.pathname, '/v1beta/openai/models');
  assert.equal(calls[1].init.headers['x-goog-api-key'], 'safe-test-key');
  assert.doesNotMatch(JSON.stringify(result), /private provider error|safe-test-key/);
});

test('key-test 401 echo is absent from both the UI result and the event log line', async () => {
  const key = 'PRIVATE-KEY-ECHO';
  const client = createProviderClient({ providers: [providers[0]], fetchImpl: async () => ({ ok: false, status: 401, text: async () => `provider echoed ${key}` }) });
  const result = await client.testProvider('gemini', key);
  const logLine = providerTestLogEvent('gemini', 'generativelanguage.googleapis.com', result);
  assert.match(result.message, /Authentication failed \(HTTP 401\)/);
  assert.doesNotMatch(result.message, /PRIVATE-KEY|provider echoed/);
  assert.doesNotMatch(logLine, /PRIVATE-KEY|provider echoed/);
  assert.match(logLine, /gemini.*host-generativelanguage\.googleapis\.com.*class-auth_failed\.http-401.*latency-/);
});

test('thrown provider test errors map to timeout, DNS, TLS, aborted, refused, or coded unknown', async (t) => {
  const cases = [
    [Object.assign(new Error('dns'), { code: 'ENOTFOUND' }), 'dns_failure', /DNS lookup failed/],
    [Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }), 'connection_refused', /Connection refused/],
    [Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), 'timeout', /timed out/],
    [Object.assign(new Error('certificate'), { code: 'CERT_HAS_EXPIRED' }), 'tls_failure', /TLS connection failed/],
    [Object.assign(new Error('blocked'), { code: 'ERR_BLOCKED_BY_CLIENT' }), 'blocked_or_aborted', /blocked or aborted/],
    [Object.assign(new Error('cancelled'), { name: 'AbortError' }), 'blocked_or_aborted', /blocked or aborted/],
    [Object.assign(new Error('other'), { code: 'E_CUSTOM' }), 'unknown', /E_CUSTOM/],
  ];
  for (const [error, expected, phrase] of cases) await t.test(`${error.code || error.name} => ${expected}`, async () => {
    const client = createProviderClient({ providers: [providers[0]], fetchImpl: async () => { throw error; } });
    const result = await client.testProvider('gemini', 'key-never-returned');
    assert.equal(result.class, expected);
    assert.match(result.message, phrase);
    assert.equal(result.errorCode, error.code || null);
    assert.doesNotMatch(JSON.stringify(result), /key-never-returned/);
  });
});
