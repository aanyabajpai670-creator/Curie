import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSettingsStore } from '../src/main/settings-store.js';

function fixture(t, safeStorage = mockSafeStorage()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'settings.json');
  return { store: createSettingsStore({ filePath, safeStorage }), directory, filePath, safeStorage };
}

function mockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from('encrypted:' + value),
    decryptString: (value) => value.toString().replace('encrypted:', ''),
  };
}

test('settings defaults load and API keys are encrypted, never returned', (t) => {
  const { store, directory } = fixture(t);
  const settings = store.get();
  assert.equal(settings.workMinutes, 25);
  assert.equal(settings.petScale, 10);
  assert.equal(settings.calmDuringFocus, true);
  assert.equal(settings.showTimeOnPet, true);
  assert.equal(settings.geminiModel, 'gemini-3.5-flash');
  assert.equal(settings.hasGeminiKey, false);
  const input = { ...settings, geminiApiKey: 'gem-secret', groqApiKey: '' };
  const saved = store.save(input);
  assert.equal(saved.hasGeminiKey, true);
  assert.equal('geminiApiKey' in saved, false);
  assert.deepEqual(store.providers(), { gemini: 'gem-secret', groq: '' });
  assert.equal(store.get().calmDuringFocus, true);
  assert.equal(store.get().showTimeOnPet, true);
  const text = fs.readFileSync(path.join(directory, 'settings.json'), 'utf8');
  assert.equal(text.includes('gem-secret'), false);
});

test('previous saved Gemini default migrates to the configured 3.5 Flash model', (t) => {
  const setup = fixture(t);
  fs.writeFileSync(setup.filePath, JSON.stringify({ settings: { geminiModel: 'gemini-3.8-flash' } }));
  const migrated = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  assert.equal(migrated.get().geminiModel, 'gemini-3.5-flash');
});

test('only the three pet size presets are accepted and saved', (t) => {
  const { store } = fixture(t);
  const defaults = store.get();
  for (const scale of [6, 10, 14]) {
    assert.equal(store.save({ ...defaults, petScale: scale }).petScale, scale);
  }
  assert.throws(() => store.save({ ...defaults, petScale: 8 }), /petScale/);
});

test('settings validate duration, time zone, and quiet hours', (t) => {
  const { store } = fixture(t);
  const defaults = store.get();
  assert.throws(() => store.save({ ...defaults, workMinutes: 0 }), /workMinutes/);
  assert.throws(() => store.save({ ...defaults, timeZone: 'Mars/Olympus' }), /time zone/);
  assert.throws(() => store.save({ ...defaults, quietStart: '25:00' }), /HH:MM/);
});

test('saved keys can be removed and encryption absence blocks storing a new key', (t) => {
  const { store } = fixture(t);
  const defaults = store.get();
  store.save({ ...defaults, groqApiKey: 'groq-secret' });
  store.save({ ...store.get(), clearGroqKey: true });
  assert.equal(store.providers().groq, '');

  const unavailable = fixture(t, {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value),
    decryptString: () => '',
  }).store;
  assert.throws(() => unavailable.save({ ...unavailable.get(), geminiApiKey: 'key' }), /Secure key storage/);
});

test('provider-call usage is persisted in settings and resets at Asia/Kolkata midnight', (t) => {
  const setup = fixture(t);
  const usage = setup.store.usageStore();
  const first = Date.parse('2026-10-24T18:29:00Z');
  usage.consume({ now: first, date: '2026-10-24', limit: 400 });
  assert.equal(usage.snapshot(first).callsToday, 1);
  const restarted = createSettingsStore({ filePath: setup.filePath, safeStorage: setup.safeStorage });
  assert.equal(restarted.usageStore().snapshot(first).callsToday, 1);
  assert.equal(restarted.usageStore().snapshot(Date.parse('2026-10-24T18:30:00Z')).callsToday, 0);
  assert.equal(restarted.get().maxLlmCallsPerDay, 400);
  assert.equal(restarted.get().verboseAgentLog, false);
});

test('daily provider-call cap accepts only 50 through 1500', (t) => {
  const { store } = fixture(t);
  assert.throws(() => store.save({ ...store.get(), maxLlmCallsPerDay: 49 }), /maxLlmCallsPerDay/);
  assert.throws(() => store.save({ ...store.get(), maxLlmCallsPerDay: 1501 }), /maxLlmCallsPerDay/);
  assert.equal(store.save({ ...store.get(), maxLlmCallsPerDay: 1500 }).maxLlmCallsPerDay, 1500);
});
