import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSettingsStore } from '../src/main/settings-store.js';

async function fixture(t, safeStorage = mockSafeStorage()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'settings.json');
  const store = createSettingsStore({ filePath, safeStorage });
  await store.ready;
  return { store, directory, filePath, safeStorage };
}

function mockSafeStorage() {
  return {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from('encrypted:' + value),
    decryptStringAsync: async (value) => ({ result: value.toString().replace('encrypted:', ''), shouldReEncrypt: false }),
  };
}

test('settings defaults load and API keys are encrypted, never returned', async (t) => {
  const { store, directory } = await fixture(t);
  const settings = store.get();
  assert.equal(settings.workMinutes, 25);
  assert.equal(settings.petScale, 10);
  assert.equal(settings.calmDuringFocus, true);
  assert.equal(settings.showTimeOnPet, true);
  assert.equal(settings.reminderSound, false);
  assert.equal(settings.geminiModel, 'gemini-3.5-flash-lite');
  assert.equal(settings.geminiMaxOutputTokens, 2048);
  assert.equal(settings.groqMaxOutputTokens, 1024);
  assert.equal(settings.hasGeminiKey, false);
  const input = { ...settings, geminiApiKey: 'gem-secret', groqApiKey: '' };
  const saved = await store.save(input);
  assert.equal(saved.hasGeminiKey, true);
  assert.equal('geminiApiKey' in saved, false);
  assert.deepEqual(store.providers(), { gemini: 'gem-secret', groq: '' });
  assert.equal(store.get().calmDuringFocus, true);
  assert.equal(store.get().showTimeOnPet, true);
  const text = fs.readFileSync(path.join(directory, 'settings.json'), 'utf8');
  assert.equal(text.includes('gem-secret'), false);
});

test('previous saved Gemini defaults migrate to configured 3.5 Flash Lite', async (t) => {
  const setup = await fixture(t);
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: { geminiModel: 'gemini-3.8-flash' } }));
  const migrated = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await migrated.ready;
  assert.equal(migrated.get().geminiModel, 'gemini-3.5-flash-lite');
  assert.equal(JSON.parse(fs.readFileSync(setup.filePath, 'utf8')).settings.geminiModel, 'gemini-3.5-flash-lite');
});

test('previous unedited 3.5 Flash setting migrates to Flash Lite', async (t) => {
  const setup = await fixture(t);
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: { geminiModel: 'gemini-3.5-flash' } }));
  const migrated = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await migrated.ready;
  assert.equal(migrated.get().geminiModel, 'gemini-3.5-flash-lite');
});

test('async safeStorage re-encrypts key data when the adapter requests rotation', async (t) => {
  const setup = await fixture(t, {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) => Buffer.from('rotated:' + value),
    decryptStringAsync: async (value) => ({ result: value.toString().replace('old:', ''), shouldReEncrypt: true }),
  });
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: {}, keys: { gemini: Buffer.from('old:secret').toString('base64') } }));
  const store = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await store.ready;
  assert.deepEqual(store.providers(), { gemini: 'secret', groq: '' });
  assert.equal(JSON.parse(fs.readFileSync(setup.filePath, 'utf8')).keys.gemini, Buffer.from('rotated:secret').toString('base64'));
});

test('startup replaces unedited legacy cap/model defaults and records explicit overrides', async (t) => {
  const setup = await fixture(t);
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: { maxLlmCallsPerDay: 100, geminiModel: 'gemini-3.8-flash' }, keys: {} }));
  const migrated = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await migrated.ready;
  assert.equal(migrated.get().maxLlmCallsPerDay, 400);
  assert.equal(migrated.get().geminiModel, 'gemini-3.5-flash-lite');
  const persisted = JSON.parse(fs.readFileSync(setup.filePath, 'utf8'));
  assert.deepEqual(persisted.editedSettings, []);

  await migrated.save({ ...migrated.get(), maxLlmCallsPerDay: 250, geminiModel: 'gemini-custom', editedSettings: ['maxLlmCallsPerDay', 'geminiModel'] });
  const restarted = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await restarted.ready;
  assert.equal(restarted.get().maxLlmCallsPerDay, 250);
  assert.equal(restarted.get().geminiModel, 'gemini-custom');
  assert.deepEqual(JSON.parse(fs.readFileSync(setup.filePath, 'utf8')).editedSettings, ['maxLlmCallsPerDay', 'geminiModel']);
});

test('legacy non-default user values are inferred as edited and survive migration', async (t) => {
  const setup = await fixture(t);
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: { maxLlmCallsPerDay: 175, geminiModel: 'gemini-custom' }, keys: {} }));
  const store = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await store.ready;
  assert.equal(store.get().maxLlmCallsPerDay, 175);
  assert.equal(store.get().geminiModel, 'gemini-custom');
  assert.deepEqual(JSON.parse(fs.readFileSync(setup.filePath, 'utf8')).editedSettings, ['geminiModel', 'maxLlmCallsPerDay']);
});

test('explicitly edited legacy defaults remain intact during startup migration', async (t) => {
  const setup = await fixture(t);
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: { maxLlmCallsPerDay: 100, geminiModel: 'gemini-3.8-flash' }, editedSettings: ['maxLlmCallsPerDay', 'geminiModel'], keys: {} }));
  const store = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await store.ready;
  assert.equal(store.get().maxLlmCallsPerDay, 100);
  assert.equal(store.get().geminiModel, 'gemini-3.8-flash');
});

test('only the three pet size presets are accepted and saved', async (t) => {
  const { store } = await fixture(t);
  const defaults = store.get();
  for (const scale of [6, 10, 14]) {
    assert.equal((await store.save({ ...defaults, petScale: scale })).petScale, scale);
  }
  await assert.rejects(store.save({ ...defaults, petScale: 8 }), /petScale/);
});

test('settings validate duration, time zone, and quiet hours', async (t) => {
  const { store } = await fixture(t);
  const defaults = store.get();
  await assert.rejects(store.save({ ...defaults, workMinutes: 0 }), /workMinutes/);
  await assert.rejects(store.save({ ...defaults, timeZone: 'Mars/Olympus' }), /time zone/);
  await assert.rejects(store.save({ ...defaults, quietStart: '25:00' }), /HH:MM/);
});

test('saved keys can be removed and encryption absence blocks storing a new key', async (t) => {
  const { store } = await fixture(t);
  const defaults = store.get();
  await store.save({ ...defaults, groqApiKey: 'groq-secret' });
  await store.save({ ...store.get(), clearGroqKey: true });
  assert.equal(store.providers().groq, '');

  const unavailable = await fixture(t, {
    isAsyncEncryptionAvailable: async () => false,
    encryptStringAsync: async (value) => Buffer.from(value),
    decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  });
  await assert.rejects(unavailable.store.save({ ...unavailable.store.get(), geminiApiKey: 'key' }), /Secure key storage/);
});

test('provider-call usage is persisted in settings and resets at Asia/Kolkata midnight', async (t) => {
  const setup = await fixture(t);
  const usage = setup.store.usageStore();
  const first = Date.parse('2026-10-24T18:29:00Z');
  usage.consume({ now: first, date: '2026-10-24', limit: 400 });
  assert.equal(usage.snapshot(first).callsToday, 1);
  const restarted = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  await restarted.ready;
  assert.equal(restarted.usageStore().snapshot(first).callsToday, 1);
  assert.equal(restarted.usageStore().snapshot(Date.parse('2026-10-24T18:30:00Z')).callsToday, 0);
  assert.equal(restarted.get().maxLlmCallsPerDay, 400);
  assert.equal(restarted.get().verboseAgentLog, false);
});

test('daily provider-call cap accepts only 50 through 1500', async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(store.save({ ...store.get(), maxLlmCallsPerDay: 49 }), /maxLlmCallsPerDay/);
  await assert.rejects(store.save({ ...store.get(), maxLlmCallsPerDay: 1501 }), /maxLlmCallsPerDay/);
  assert.equal((await store.save({ ...store.get(), maxLlmCallsPerDay: 1500 })).maxLlmCallsPerDay, 1500);
});

test('agent output token caps default per provider and accept only 256 through 8192', async (t) => {
  const { store } = await fixture(t);
  assert.equal(store.get().geminiMaxOutputTokens, 2048);
  assert.equal(store.get().groqMaxOutputTokens, 1024);
  await assert.rejects(store.save({ ...store.get(), geminiMaxOutputTokens: 255 }), /geminiMaxOutputTokens/);
  await assert.rejects(store.save({ ...store.get(), groqMaxOutputTokens: 8193 }), /groqMaxOutputTokens/);
  const saved = await store.save({ ...store.get(), geminiMaxOutputTokens: 8192, groqMaxOutputTokens: 256 });
  assert.equal(saved.geminiMaxOutputTokens, 8192);
  assert.equal(saved.groqMaxOutputTokens, 256);
});
