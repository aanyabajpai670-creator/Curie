import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  breakMinutes: 5,
  timeZone: 'Asia/Kolkata',
  quietStart: '23:00',
  quietEnd: '07:00',
  nudgeFrequency: 30,
  maxNudgesPerDay: 3,
  geminiModel: 'gemini-3.5-flash-lite',
  groqModel: 'openai/gpt-oss-120b',
  maxLlmCallsPerDay: 400,
  geminiMaxOutputTokens: 2048,
  groqMaxOutputTokens: 1024,
  verboseAgentLog: false,
  shortcutEnabled: false,
  startShortcut: '',
  endShortcut: '',
  petScale: 10,
  debugOverlay: false,
  calmDuringFocus: true,
  showTimeOnPet: true,
  launchAtLogin: false,
  reminderSound: false,
});

const LEGACY_DEFAULTS = Object.freeze({ geminiModel: ['gemini-3.8-flash', 'gemini-3.5-flash'], maxLlmCallsPerDay: 100 });
const TRACKED_SETTINGS = new Set(Object.keys(DEFAULT_SETTINGS));

export function createSettingsStore({ filePath, safeStorage, env = process.env }) {
  if (!filePath || !safeStorage) throw new TypeError('filePath and safeStorage required');
  let stored = migrateStoredSettings(readFile(filePath), filePath);
  const decryptedKeys = {};
  const ready = (async () => {
    try {
      if (!await safeStorage.isAsyncEncryptionAvailable()) return;
      let rotated = false;
      for (const id of ['gemini', 'groq']) {
        const encoded = stored.keys[id];
        if (!encoded) continue;
        try {
          const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'));
          decryptedKeys[id] = decrypted.result;
          if (decrypted.shouldReEncrypt) {
            stored.keys[id] = (await safeStorage.encryptStringAsync(decrypted.result)).toString('base64');
            rotated = true;
          }
        } catch { /* An unreadable saved key is ignored; plaintext is never used as a fallback. */ }
      }
      if (rotated) writeFile(filePath, stored);
    } catch {
      return;
    }
  })();

  function get() {
    const geminiModel = stored.settings.geminiModel || DEFAULT_SETTINGS.geminiModel;
    return {
      ...DEFAULT_SETTINGS,
      ...stored.settings,
      geminiModel,
      petScale: PET_SCALES.includes(stored.settings.petScale)
        ? stored.settings.petScale
        : DEFAULT_SETTINGS.petScale,
      hasGeminiKey: Boolean(decryptedKeys.gemini) || Boolean(env.GEMINI_API_KEY),
      hasGroqKey: Boolean(decryptedKeys.groq) || Boolean(env.GROQ_API_KEY),
    };
  }

  function providers() {
    return {
      gemini: decryptedKeys.gemini || env.GEMINI_API_KEY || '',
      groq: decryptedKeys.groq || env.GROQ_API_KEY || '',
    };
  }

  async function save(input) {
    await ready;
    const settings = validateSettings(input);
    const keys = { ...stored.keys };
    if (input.clearGeminiKey) { delete keys.gemini; delete decryptedKeys.gemini; }
    if (input.clearGroqKey) { delete keys.groq; delete decryptedKeys.groq; }
    for (const [field, id] of [['geminiApiKey', 'gemini'], ['groqApiKey', 'groq']]) {
      const key = input[field];
      if (typeof key === 'string' && key.trim()) {
        if (!await safeStorage.isAsyncEncryptionAvailable()) {
          throw new Error('Secure key storage is unavailable on this computer.');
        }
        keys[id] = (await safeStorage.encryptStringAsync(key.trim())).toString('base64');
        decryptedKeys[id] = key.trim();
      }
    }
    const editedSettings = new Set(stored.editedSettings || []);
    if (Array.isArray(input.editedSettings)) for (const key of input.editedSettings) if (TRACKED_SETTINGS.has(key)) editedSettings.add(key);
    stored = { settings, keys, editedSettings: [...editedSettings], agentUsage: stored.agentUsage || { date: '', calls: 0, minuteCalls: [] } };
    writeFile(filePath, stored);
    return get();
  }

  function usageStore() {
    return {
      consume({ now, date, limit }) {
        const state = stored.agentUsage || { date: '', calls: 0, minuteCalls: [] };
        if (state.date !== date) { state.date = date; state.calls = 0; }
        state.minuteCalls = (state.minuteCalls || []).filter((at) => now - at < 60_000);
        if (state.calls >= limit) throw new Error('Curie reached its daily provider-call limit. Try again tomorrow.');
        if (state.minuteCalls.length >= 20) throw new Error('Curie reached its 20 provider calls per minute limit. Wait a minute and try again.');
        state.calls += 1;
        state.minuteCalls.push(now);
        stored = { ...stored, agentUsage: state };
        writeFile(filePath, stored);
        return state.calls;
      },
      countMinute(now) { return (stored.agentUsage?.minuteCalls || []).filter((at) => now - at < 60_000).length; },
      snapshot(now) {
        const state = stored.agentUsage || { date: '', calls: 0, minuteCalls: [] };
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        return { callsToday: state.date === date ? state.calls : 0, callsThisMinute: (state.minuteCalls || []).filter((at) => now - at < 60_000).length };
      },
    };
  }

  return { get, providers, save, usageStore, ready };
}

function validateSettings(input) {
  const settings = {};
  const integer = (key, min, max) => {
    const value = input[key] ?? DEFAULT_SETTINGS[key];
    if (!Number.isInteger(value) || value < min || value > max) throw new TypeError('Invalid ' + key);
    settings[key] = value;
  };
  integer('workMinutes', 1, 180);
  integer('breakMinutes', 1, 60);
  integer('nudgeFrequency', 1, 1440);
  integer('maxNudgesPerDay', 0, 20);
  integer('maxLlmCallsPerDay', 50, 1500);
  integer('geminiMaxOutputTokens', 256, 8192);
  integer('groqMaxOutputTokens', 256, 8192);
  const scale = input.petScale ?? DEFAULT_SETTINGS.petScale;
  if (!PET_SCALES.includes(scale)) throw new TypeError('Invalid petScale');
  settings.petScale = scale;
  for (const key of ['timeZone', 'quietStart', 'quietEnd', 'geminiModel', 'groqModel', 'startShortcut', 'endShortcut']) {
    const value = input[key] ?? DEFAULT_SETTINGS[key];
    if (typeof value !== 'string' || value.length > 120) throw new TypeError('Invalid ' + key);
    settings[key] = value.trim();
  }
  const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(settings.quietStart) || !validTime(settings.quietEnd)) {
    throw new TypeError('Quiet hours must use HH:MM format.');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: settings.timeZone }); }
  catch { throw new TypeError('Enter a valid time zone, such as Asia/Kolkata.'); }
  for (const key of ['shortcutEnabled', 'launchAtLogin', 'reminderSound', 'debugOverlay', 'calmDuringFocus', 'showTimeOnPet', 'verboseAgentLog']) {
    const value = input[key] ?? DEFAULT_SETTINGS[key];
    if (typeof value !== 'boolean') throw new TypeError('Invalid ' + key);
    settings[key] = value;
  }
  return settings;
}

const PET_SCALES = [6, 10, 14];

function readFile(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { settings: value.settings || {}, keys: value.keys || {}, editedSettings: value.editedSettings || null, agentUsage: value.agentUsage || { date: '', calls: 0, minuteCalls: [] } };
  } catch { return { settings: {}, keys: {} }; }
}

function migrateStoredSettings(value, filePath) {
  const settings = { ...value.settings };
  const edited = new Set(Array.isArray(value.editedSettings) ? value.editedSettings : []);
  let changed = !Array.isArray(value.editedSettings);
  for (const key of ['geminiModel', 'maxLlmCallsPerDay']) {
    const current = settings[key];
    const legacyValues = Array.isArray(LEGACY_DEFAULTS[key]) ? LEGACY_DEFAULTS[key] : [LEGACY_DEFAULTS[key]];
    if (!edited.has(key) && current !== undefined && !legacyValues.includes(current) && current !== DEFAULT_SETTINGS[key]) edited.add(key);
    if (!edited.has(key) && legacyValues.includes(current)) {
      settings[key] = DEFAULT_SETTINGS[key];
      changed = true;
    }
  }
  const result = { ...value, settings, editedSettings: [...edited] };
  if (changed && Object.keys(settings).length) writeFile(filePath, result);
  return result;
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}
