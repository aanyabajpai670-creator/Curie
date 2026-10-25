import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderClient, PROVIDER_DEFAULTS, providersFromEnv } from '../src/agent/providers.js';
import { createAgentController } from '../src/agent/controller.js';
const providers = PROVIDER_DEFAULTS.map((provider) => ({ ...provider, apiKey: `${provider.id}-secret` }));
const ok = (body = { choices: [] }) => ({ ok: true, json: async () => body });

test('provider defaults preserve ordered Gemini then Groq models', () => {
  assert.deepEqual(PROVIDER_DEFAULTS.map((item) => item.id), ['gemini', 'groq']);
  assert.equal(PROVIDER_DEFAULTS[0].model, 'gemini-3.8-flash'); assert.equal(PROVIDER_DEFAULTS[1].model, 'openai/gpt-oss-120b');
  assert.equal(providersFromEnv({ GEMINI_API_KEY: 'g' })[0].apiKey, 'g');
});
test('429 falls back and each provider HTTP attempt consumes one call', async () => {
  let count = 0; const headers = [], urls = [];
  const client = createProviderClient({ providers, fetchImpl: async (url, init) => { count += 1; urls.push(String(url)); headers.push(init.headers); return count === 1 ? { ok: false, status: 429, text: async () => 'echo gemini-secret' } : ok(); } });
  await client.complete([], []);
  assert.equal(count, 2); assert.match(urls[0], /generativelanguage/); assert.match(urls[1], /api.groq.com/);
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
