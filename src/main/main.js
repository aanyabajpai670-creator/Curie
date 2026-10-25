import { app, globalShortcut, ipcMain, Notification, powerMonitor, safeStorage, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createPetWindow } from './pet-window.js';
import { createAskWindow } from './ask-window.js';
import { createKeyWindow } from './key-window.js';
import { createPetTimerWindow, updatePetTimerWindow } from './pet-timer-window.js';
import { createTray, showPetMenu } from './app-menu.js';
import { togglePanel } from './panel-window.js';
import { createTimerService } from './timer-service.js';
import { createTaskService } from './task-service.js';
import { createAgentController } from '../agent/controller.js';
import { createAgentTools } from '../agent/tools.js';
import { createProviderClient, providerTestLogEvent } from '../agent/providers.js';
import { createNudgeService } from './nudge-service.js';
import { createShortcutRunner } from './shortcut-runner.js';
import { createSettingsStore } from './settings-store.js';
import { PROVIDER_DEFAULTS } from '../agent/providers.js';
import { createHorizontalWanderController, petStateFor, petWindowSize } from '../core/pet-behavior.js';
import { createPetPositionController } from '../core/pet-position.js';
import { createPetCalmController, createPetStateHeartbeat, createPetWanderSchedule, createTimerFocusCalmLease } from '../core/pet-calm.js';
import { createConfirmationGate } from '../core/agent-confirmation.js';
import { clampCursorToDisplays, createPetGazeController, createResilientTick, shouldSendGaze } from '../core/pet-gaze.js';
import { createAnomalyLogger, createEventLogger } from './event-log.js';
import { createDebugOverlayWindow, updateDebugOverlay } from './debug-overlay-window.js';
import { readPetPosition, savePetPosition } from './window-state.js';

const smokeMode = process.env.CURIE_ELECTRON_SMOKE === '1';
if (smokeMode && process.env.CURIE_ELECTRON_SMOKE_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.CURIE_ELECTRON_SMOKE_USER_DATA));
}

let petWindow;
let petTimerWindow;
let panelWindow;
let askWindow;
let askAbortController;
let keyWindow;
let timerService;
let taskService;
let timerStatus;
let agentController;
let nudgeService;
let shortcutRunner;
let focusShortcutActive = false;
let settingsStore;
let providerClient;
let eventLogger;
let petPoll;
let debugPoll;
let petDragging = false;
let petCurrentState = 'idle';
let petWander;
let lastWanderEvent = false;
const petCalm = createPetCalmController();
const petStateHeartbeat = createPetStateHeartbeat(250);
let petWanderSchedule;
let petBehaviorConfig = { restMs: [600, 1600] };
let petAirborne = false;
let petFrame = 0;
let petResting = false;
let lastFrameReport;
let lastWanderWriteAt;
const timerCalmLease = createTimerFocusCalmLease({
  getCalm: () => petCalm.snapshot().calm,
  getRevision: () => petCalm.getRevision(),
  setCalm: (value, source) => setCalm(value, source),
  source: 'timer',
});
const askCalmLease = createTimerFocusCalmLease({ getCalm: () => petCalm.snapshot().calm, getRevision: () => petCalm.getRevision(), setCalm: (value, source) => setCalm(value, source), source: 'ask-window' });
const askConfirmation = createConfirmationGate({ timeoutMs: 5 * 60_000, onResolve: (approved) => {
  if (askWindow && !askWindow.isDestroyed()) askWindow.webContents.send('ask:update', { outcome: 'pending', text: approved ? 'Continuing after confirmation...' : 'Continuing after cancellation...' });
} });
let petPositionController;
const petGaze = createPetGazeController();
let lastSentGaze;
let lastGazeSentAt = 0;
let debugOverlay;
let debugOverlayEnabled = false;
let trayIcon;
let updateTrayMenu = () => {};
let lastTrayUpdateAt = -Infinity;
let anomalyLogger;
let lastRawCursor = { x: 0, y: 0 };
let lastGazeOffset = { dx: 0, dy: 0 };
let lastGazeReceivedAt = Date.now();
const positionWrites = [];

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.on('second-instance', () => petWindow?.show());

function openPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) {
    panelWindow = togglePanel(petWindow, null);
    panelWindow.once('closed', () => {
      panelWindow = null;
    });
    return;
  }
  panelWindow = togglePanel(petWindow, panelWindow);
}

function openAskWindow() {
  if (askWindow && !askWindow.isDestroyed()) { askWindow.show(); askWindow.focus(); return askWindow; }
  askWindow = createAskWindow(petWindow);
  askCalmLease.begin(Date.now());
  askWindow.once('closed', () => {
    askWindow = null;
    askAbortController?.abort();
    askAbortController = null;
    finishAskConfirmation(false);
    askCalmLease.end(Date.now());
  });
  return askWindow;
}

function openKeyWindow() {
  if (keyWindow && !keyWindow.isDestroyed()) { keyWindow.show(); keyWindow.focus(); return keyWindow; }
  keyWindow = createKeyWindow();
  keyWindow.once('closed', () => { keyWindow = null; });
  return keyWindow;
}

async function submitAsk(message, requestId) {
  if (!askWindow || askWindow.isDestroyed()) return;
  if (agentController?.isBusy()) { askWindow.webContents.send('ask:update', { outcome: 'error', text: 'A request is already in progress. Please wait and try again.', requestId }); return; }
  const requestAbort = new AbortController();
  askAbortController = requestAbort;
  askWindow.webContents.send('ask:update', { outcome: 'pending', text: 'thinking...', requestId });
  try {
    const result = await agentController.send(message, { signal: requestAbort.signal });
    const text = String(result?.text || '').trim();
    const outcome = result?.errorType ? 'error' : (result?.outcome || (text ? 'reply' : 'error'));
    const safeText = text || `No answer produced: ${result?.errorType || 'the model returned no reply or proposal.'}`;
    if (askWindow && !askWindow.isDestroyed()) askWindow.webContents.send('ask:update', { outcome, text: safeText, requestId });
  } catch (error) {
    if (askWindow && !askWindow.isDestroyed()) askWindow.webContents.send('ask:update', { outcome: 'error', text: safeAgentError(error), requestId });
  } finally {
    if (askAbortController === requestAbort) askAbortController = null;
  }
}

function confirmAgentProposals(proposals) {
  if (!askWindow || askWindow.isDestroyed()) openAskWindow();
  if (!askWindow || askWindow.isDestroyed()) return Promise.resolve(false);
  return askConfirmation.request(() => {
    askWindow.webContents.send('ask:confirmation', proposals.map(({ label }) => ({ label })));
  });
}

function finishAskConfirmation(approved) {
  askConfirmation.resolve(Boolean(approved));
}

function safeAgentError(error) {
  const message = String(error?.message || 'Curie could not complete that request.');
  if (/daily.*limit|minute.*limit|provider|authentication|network|API key|timed out|HTTP \d{3}|rejected the request|unknown provider error/i.test(message)) return message;
  if (error?.code) return `Unknown error (${String(error.code).slice(0, 40)}).`;
  return message || 'Unknown error. Curie could not complete the request.';
}

function logAgentRequest(detail) {
  const calls = providerClient?.diagnostics?.() ?? {};
  const provider = /^[a-z0-9_-]+$/.test(detail.provider) ? detail.provider : 'fallback';
  const tools = detail.tools.map((name) => /^[a-z0-9_]+$/.test(name) ? name : 'unknown').join(',') || 'none';
  const counts = detail.tokenCounts || {};
  const finish = /^[a-z0-9_-]+$/i.test(detail.finishReason || '') ? detail.finishReason : 'none';
  eventLogger?.log(`agent.request.${provider}.finish-${finish}.tokens.prompt-${counts.prompt || 0}.output-${counts.output || 0}.thinking-${counts.thinking || 0}.iterations-${detail.iterations}.tools-${tools}.error-${detail.errorType}.latency-${Math.round(detail.latencyMs)}.calls-${calls.callsToday ?? 0}`);
}

function registerWindowControls() {
  ipcMain.on('pet:toggle-panel', openPanel);
  ipcMain.on('pet:show-menu', () =>
    showPetMenu(app, openPanel, timerService, setPetScale, () => settingsStore.get().petScale, petWindow?.getBounds(), setDebugOverlay, () => debugOverlayEnabled,
      (value) => setCalm(value, 'menu'), () => petCalm.snapshot().calm, {
        getSettings: () => settingsStore.get(),
        setPreference: (key, value) => applySettings({ ...settingsStore.get(), [key]: value }),
        getShowTime: () => settingsStore.get().showTimeOnPet,
        openAsk: openAskWindow,
        openKeys: openKeyWindow,
      }),
  );
  ipcMain.on('pet:log', (_event, name) => {
    eventLogger?.log(name);
  });
  ipcMain.on('pet:drag-start', (_event, point) => beginPetDrag(point));
  ipcMain.on('pet:drag-move', (_event, point) => movePetDrag(point));
  ipcMain.on('pet:drag-end', () => endPetDrag());
  ipcMain.on('pet:drag-cancel', () => cancelPetDrag());
  ipcMain.on('pet:calm-toggle', () => setCalm(!petCalm.snapshot().calm, 'click'));
  ipcMain.on('pet:frame', (_event, report) => {
    if (!report || !Number.isInteger(report.frame) || typeof report.resting !== 'boolean') return;
    petFrame = report.frame;
    petResting = report.resting;
    petAirborne = Boolean(report.airborne);
    const key = `${petFrame}:${petResting}:${petAirborne}`;
    if (lastFrameReport !== key) {
      lastFrameReport = key;
      petCalm.updateFrame(petFrame, petResting);
      publishPetCalmState();
    }
  });
  ipcMain.on('pet:behavior', (_event, state) => {
    if (!state || !['ACTIVE', 'WANDER', 'CALM', 'CALM pending'].includes(state.mode) || typeof state.airborne !== 'boolean') return;
    petAirborne = state.airborne;
    setCalm(state.mode === 'CALM' || state.mode === 'CALM pending', 'legacy-api');
  });
  ipcMain.on('pet:gaze-received', () => { lastGazeReceivedAt = Date.now(); });
  ipcMain.on('pet:gaze-watchdog', () => anomalyLogger?.log('anomaly.gaze_watchdog'));
  ipcMain.handle('timer:action', (_event, action) =>
    timerService.dispatch(action),
  );
  ipcMain.handle('timer:status', () => timerService.dispatch('status'));
  ipcMain.handle('tasks:list', () => taskService.list());
  ipcMain.handle('tasks:add', (_event, input) => taskService.add(input));
  ipcMain.handle('tasks:update', (_event, id, changes) =>
    taskService.update(id, changes),
  );
  ipcMain.handle('tasks:complete', (_event, id) => taskService.complete(id));
  ipcMain.handle('tasks:delete', (_event, id) => taskService.delete(id));
  ipcMain.handle('reminders:list', () => taskService.pending());
  ipcMain.handle('agent:send', (_event, message) =>
    agentController.send(message),
  );
  ipcMain.on('ask:send', (_event, message, requestId) => void submitAsk(message, Number.isSafeInteger(requestId) ? requestId : undefined));
  ipcMain.on('ask:confirm', (_event, approved) => finishAskConfirmation(Boolean(approved)));
  ipcMain.on('ask:close', () => askWindow?.close());
  ipcMain.handle('keys:status', () => ({ gemini: settingsStore.get().hasGeminiKey, groq: settingsStore.get().hasGroqKey, encryptionAvailable: safeStorage.isEncryptionAvailable(), models: Object.fromEntries(buildProviders(settingsStore).map((provider) => [provider.id, provider.model])) }));
  ipcMain.handle('keys:save', (_event, keys) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure key storage is unavailable. Keys were not saved.');
    let settings;
    try { settings = settingsStore.save({ ...settingsStore.get(), geminiApiKey: keys?.geminiApiKey, groqApiKey: keys?.groqApiKey }); }
    catch { throw new Error(safeStorage.isEncryptionAvailable() ? 'Keys could not be saved securely.' : 'Secure key storage is unavailable. Keys were not saved.'); }
    providerClient.setProviders(buildProviders(settingsStore));
    eventLogger?.log(`agent.key.present.gemini.${settings.hasGeminiKey ? 'yes' : 'no'}`);
    eventLogger?.log(`agent.key.present.groq.${settings.hasGroqKey ? 'yes' : 'no'}`);
    return { gemini: settings.hasGeminiKey, groq: settings.hasGroqKey };
  });
  ipcMain.handle('keys:test', async (_event, provider, typedKey, model) => {
    const result = await providerClient.testProvider(provider, typedKey || settingsStore.providers()[provider] || '', model);
    const endpoint = PROVIDER_DEFAULTS.find((item) => item.id === provider)?.baseURL;
    const host = endpoint ? new URL(endpoint).hostname : 'unknown';
    eventLogger?.log(providerTestLogEvent(provider, host, result));
    return result;
  });
  ipcMain.handle('settings:get', () => settingsStore.get());
  ipcMain.handle('settings:save', (_event, input) => applySettings(input));
  ipcMain.handle('reminders:resolve', (_event, id, action) =>
    taskService.resolve(id, action),
  );
}

app.whenReady().then(() => {
  if (!singleInstance) return;
  eventLogger = createEventLogger(path.join(app.getPath('userData'), 'logs', 'curie.log'));
  anomalyLogger = createAnomalyLogger(eventLogger);
  settingsStore = createSettingsStore({
    filePath: path.join(app.getPath('userData'), 'settings.json'),
    safeStorage,
  });
  const keyState = settingsStore.get();
  eventLogger.log(`agent.key.present.gemini.${keyState.hasGeminiKey ? 'yes' : 'no'}`);
  eventLogger.log(`agent.key.present.groq.${keyState.hasGroqKey ? 'yes' : 'no'}`);
  try {
    petBehaviorConfig = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'assets', 'behaviour.json'), 'utf8'));
  } catch {
    // The renderer has the same documented defaults if the behavior file is unavailable.
  }
  let timerConfig = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 };
  try {
    timerConfig = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'assets', 'timer.json'), 'utf8'));
  } catch {
    eventLogger.log('timer.config.defaulted');
  }
  petWanderSchedule = createPetWanderSchedule({ restMs: petBehaviorConfig.restMs });
  const settings = settingsStore.get();
  debugOverlayEnabled = Boolean(settings.debugOverlay);
  const userDataPath = app.getPath('userData');
  const initialPetPosition = readPetPosition(userDataPath);
  petPositionController = makePetPositionController(userDataPath, initialPetPosition, settings.petScale);
  const restoreToken = petPositionController.getRevision();
  petWindow = createPetWindow(app, settings.petScale, petPositionController.getPosition(), petPositionController, restoreToken);
  petTimerWindow = createPetTimerWindow();
  petTimerWindow.webContents.on('did-finish-load', () => {
    updatePetTimerWindow(petTimerWindow, petWindow?.getBounds(), timerStatus, settingsStore.get().showTimeOnPet);
  });
  if (smokeMode) {
    petWindow.webContents.on('console-message', (event) => {
      process.stdout.write('CURIE_RENDERER_CONSOLE ' + event.level + ' ' + event.message + '\n');
    });
    petWindow.once('ready-to-show', () => void runElectronSmoke());
  }
  petWander = createHorizontalWanderController({ speed: 22 });
  eventLogger.log('pet.ready');
  timerService = createTimerService({
    userDataPath: app.getPath('userData'),
    config: timerConfig,
    notify: notifySessionEnd,
    onUpdate: updateTimerWindows,
    log: (name) => eventLogger?.log(name),
  });
  taskService = createTaskService({
    filePath: path.join(app.getPath('userData'), 'tasks.json'),
    onReminder: notifyReminder,
    onUpdate: updateTaskWindows,
  });
  nudgeService = createNudgeService({
    filePath: path.join(app.getPath('userData'), 'nudge-state.json'),
    getTasks: () => taskService.list(),
    config: nudgeConfig(settings),
    onNudge: notifyNudge,
  });
  shortcutRunner = makeShortcutRunner(settings);
  const agentTools = createAgentTools({
    taskService,
    timerService,
  });
  providerClient = createProviderClient({
    providers: buildProviders(settingsStore),
    maxCallsPerDay: settings.maxLlmCallsPerDay,
    maxCallsPerMinute: 20,
    usageStore: settingsStore.usageStore(),
    onAttempt: (attempt) => {
      const provider = /^[a-z0-9_-]+$/.test(attempt.provider) ? attempt.provider : 'provider';
      eventLogger?.log(`agent.request.${provider}.tokens.prompt-${attempt.promptTokens || 0}.output-${attempt.outputTokens || 0}.thinking-${attempt.thinkingTokens || 0}.error-${attempt.errorType}.latency-${Math.round(attempt.latencyMs)}`);
      if (attempt.status === 400 && attempt.providerMessage) eventLogger?.log(`agent.request.error.${provider}.http-400.${attempt.providerMessage}`);
      if (attempt.errorType === 'bad_request_fell_back') eventLogger?.log(`agent.request.${provider}.bad-request-fell-back`);
      if (settingsStore.get().verboseAgentLog) eventLogger?.log(`agent.request.verbose.${attempt.provider}.${attempt.errorType}.latency-${Math.round(attempt.latencyMs)}`);
    },
  });
  agentController = createAgentController({
    providerClient,
    taskService,
    executeTool: agentTools.executeTool,
    executeApprovedTool: agentTools.executeApprovedTool,
    confirmProposals: confirmAgentProposals,
    timeZone: 'Asia/Kolkata',
    log: (detail) => logAgentRequest(detail),
  });
  const tray = createTray(app, openPanel, timerService, setPetScale, () => settingsStore.get().petScale, setDebugOverlay, () => debugOverlayEnabled,
    (value) => setCalm(value, 'menu'), () => petCalm.snapshot().calm, {
      getSettings: () => settingsStore.get(),
      setPreference: (key, value) => applySettings({ ...settingsStore.get(), [key]: value }),
      getShowTime: () => settingsStore.get().showTimeOnPet,
        openAsk: openAskWindow,
        openKeys: openKeyWindow,
    });
  trayIcon = tray.tray;
  updateTrayMenu = tray.updateTimerMenu;
  registerWindowControls();
  globalShortcut.register('Control+Alt+C', () => setCalm(!petCalm.snapshot().calm, 'shortcut'));
  globalShortcut.register('Control+Alt+T', () => {
    const state = timerService.dispatch('status', 'shortcut');
    timerService.dispatch(state.status === 'idle' ? 'startFocus' : state.status === 'paused' ? 'resume' : 'pause', 'shortcut');
  });
  globalShortcut.register('Control+Alt+A', openAskWindow);
  timerService.start();
  taskService.start();
  nudgeService.start();
  petPoll = setInterval(createResilientTick(pollPetTick, () => anomalyLogger?.log('anomaly.poll_error')), 30);
  debugPoll = setInterval(refreshDebugOverlay, 250);
  for (const eventName of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(eventName, refreshPetWorkAreas);
  }
  powerMonitor.on('resume', () => {
    timerService.refresh();
    taskService.check();
    nudgeService.check();
  });
  app.on('activate', openPanel);
  publishPetCalmState(true);
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  endFocusShortcut();
  timerCalmLease.end(Date.now());
  clearInterval(petPoll);
  clearInterval(debugPoll);
  for (const eventName of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.removeListener(eventName, refreshPetWorkAreas);
  }
  debugOverlay?.destroy();
  petTimerWindow?.destroy();
  timerService?.stop();
  taskService?.stop();
  nudgeService?.stop();
});
app.on('window-all-closed', (event) => event.preventDefault());

function updateTimerWindows(status) {
  timerStatus = status;
  const shouldFocus = status.status === 'running' && status.phase === 'FOCUS';
  const calmForFocus = Boolean(settingsStore?.get().calmDuringFocus);
  timerCalmLease.sync(shouldFocus, calmForFocus, Date.now());
  if (shouldFocus && !focusShortcutActive) {
    focusShortcutActive = true;
    void shortcutRunner?.start();
  } else if (!shouldFocus && focusShortcutActive) {
    endFocusShortcut();
  }
  const timerUpdate = { ...status, showTimeOnPet: Boolean(settingsStore?.get().showTimeOnPet) };
  panelWindow?.webContents.send('timer:update', timerUpdate);
  updatePetTimerWindow(petTimerWindow, petWindow?.getBounds(), status, timerUpdate.showTimeOnPet);
  updateTrayMenu(status);
  for (const event of status.events ?? []) {
    if (event.type === 'session-complete') petWindow?.webContents.send('pet:timer-visual', { kind: 'done' });
    else if (event.type === 'phase-ended' && event.notification && event.phase !== 'LONG_BREAK') petWindow?.webContents.send('pet:timer-visual', { kind: 'alert' });
  }
  updateTrayTimer(status);
  updatePetState();
}

function endFocusShortcut() {
  if (!focusShortcutActive) return;
  focusShortcutActive = false;
  void shortcutRunner?.end();
}

function updateTrayTimer(status) {
  const now = Date.now();
  if (!trayIcon || now - lastTrayUpdateAt < 1000) return;
  lastTrayUpdateAt = now;
  const phase = status.phase || 'IDLE';
  const remainingMs = status.remainingMs || 0;
  const remaining = `${String(Math.floor(remainingMs / 60_000)).padStart(2, '0')}:${String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')}`;
  const label = status.status === 'paused' ? `${phase} ${remaining} paused` : `${phase} ${remaining}`;
  trayIcon.setToolTip(`Curie · ${label}`);
  trayIcon.setTitle?.(label);
}

function setCalm(value, source) {
  const now = Date.now();
  const state = petCalm.setCalm(value, source, now);
  eventLogger?.log('pet.calm.' + source);
  if (state.calm) {
    petWander?.cancel();
    petWanderSchedule?.suspend();
    petCalm.setWandering(false, now);
    lastWanderEvent = false;
  } else {
    petWanderSchedule?.resume(now);
  }
  publishPetCalmState(true);
  return state;
}

function publishPetCalmState(force = false) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const now = Date.now();
  const state = { ...petCalm.snapshot(), target: petWander?.getTarget?.() ?? null };
  if (!force && !petStateHeartbeat.due(state, now)) return;
  petWindow.webContents.send('pet:calm-state', state);
  petStateHeartbeat.sent(state, now);
}

function updateTaskWindows(snapshot) {
  panelWindow?.webContents.send('tasks:update', snapshot);
  updatePetState();
}

function updatePetState() {
  const petState = petStateFor({
    pendingReminders: taskService?.pending().length || 0,
    timerStatus: timerStatus?.status,
    phase: timerStatus?.phase,
  });
  if (petCurrentState !== petState) {
    petCurrentState = petState;
    eventLogger?.log('pet.state.' + petState);
  }
  petWindow?.webContents.send('pet:set-state', petState);
}

function pollPetTick() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const now = Date.now();
  petCalm.advance(now);
  publishPetCalmState();
  const cursor = screen.getCursorScreenPoint();
  lastRawCursor = cursor;
  if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
    anomalyLogger?.log('anomaly.non_finite_cursor');
    return;
  }
  const displays = screen.getAllDisplays();
  const cursorInDisplay = displays.some((display) => pointInRect(cursor, display.bounds));
  if (!cursorInDisplay) anomalyLogger?.log('anomaly.cursor_outside_displays');
  const safeCursor = clampCursorToDisplays(cursor, displays);
  if (!safeCursor) return;
  const bounds = petWindow.getBounds();
  const gaze = petGaze.update(safeCursor, bounds);
  lastGazeOffset = gaze;
  if (shouldSendGaze(gaze, lastSentGaze, now, lastGazeSentAt, 250)) {
    petWindow.webContents.send('pet:gaze', gaze);
    lastSentGaze = gaze;
    lastGazeSentAt = now;
  }
  if (now - lastGazeReceivedAt > 1000) anomalyLogger?.log('anomaly.gaze_not_delivered');
  if (!petCalm.canWander(petDragging) || !petWanderSchedule.isReady(now, petCalm.snapshot().calm, petDragging)) {
    if (!petCalm.canWander(petDragging)) {
      petWander.cancel();
      petCalm.setWandering(false, now);
      lastWanderEvent = false;
    }
    return;
  }
  const area = screen.getDisplayMatching(bounds).workArea;
  const moved = petWander.step(
    { x: bounds.x, y: bounds.y },
    { width: bounds.width, height: bounds.height },
    area,
    now,
    Math.random,
    petAirborne,
    false,
  );
  const isWandering = petWander.isWandering();
  if (isWandering && !lastWanderEvent) eventLogger?.log('pet.wander.start');
  if (!isWandering && lastWanderEvent) eventLogger?.log('pet.wander.stop');
  lastWanderEvent = isWandering;
  petCalm.setWandering(isWandering, now);
  publishPetCalmState();
  if (petCalm.canWander(petDragging) && petPositionController.wanderTo(moved, { airborne: petAirborne, calm: petCalm.snapshot().calm })) {
    lastWanderWriteAt = now;
  }
}

function makePetPositionController(userDataPath, initialPosition, scale) {
  const size = petWindowSize(scale);
  return createPetPositionController({
    initialPosition,
    size,
    workAreas: screen.getAllDisplays().map((display) => display.workArea),
    clock: () => Date.now(),
    apply: (position, source) => {
      recordPositionWrite(position, source);
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.setPosition(position.x, position.y);
        updatePetTimerWindow(petTimerWindow, petWindow.getBounds(), timerStatus, settingsStore?.get().showTimeOnPet);
      }
    },
    persist: (position) => savePetPosition(userDataPath, position),
  });
}

function recordPositionWrite(position, source) {
  const now = Date.now();
  const previous = positionWrites.at(-1);
  const beforePrevious = positionWrites.at(-2);
  if (previous && beforePrevious && now - previous.at <= 100 &&
      position.x === beforePrevious.x && position.y === beforePrevious.y &&
      (previous.x !== beforePrevious.x || previous.y !== beforePrevious.y)) {
    anomalyLogger?.log('anomaly.position_reversal');
  }
  positionWrites.push({ ...position, source, at: now });
  if (positionWrites.length > 5) positionWrites.shift();
}

function beginPetDrag(testPoint) {
  if (!petPositionController || !petPositionController.beginDrag(getDragCursor(testPoint))) return;
  petDragging = true;
  petWander?.cancel();
  petCalm.setWandering(false);
  publishPetCalmState(true);
}

function movePetDrag(testPoint) {
  if (petPositionController?.isDragging()) petPositionController.dragTo(getDragCursor(testPoint));
}

function getDragCursor(testPoint) {
  if (smokeMode && testPoint && Number.isFinite(testPoint.x) && Number.isFinite(testPoint.y)) return testPoint;
  return screen.getCursorScreenPoint();
}

async function runElectronSmoke() {
  const before = petWindow.getBounds();
  try {
    const bridge = await petWindow.webContents.executeJavaScript("JSON.stringify({curie:typeof window.curie, begin:typeof window.curie?.beginPetDrag, move:typeof window.curie?.dragPet})");
    process.stdout.write('CURIE_SMOKE_BRIDGE ' + bridge + '\n');
    await petWindow.webContents.executeJavaScript("window.curie.beginPetDrag({x: 400, y: 300})");
    await new Promise((resolve) => setTimeout(resolve, 60));
    await petWindow.webContents.executeJavaScript("window.curie.dragPet({x: 460, y: 350})");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const after = petWindow.getBounds();
    await petWindow.webContents.executeJavaScript('window.curie.endPetDrag()');
    const passed = before.x !== after.x || before.y !== after.y;
    process.stdout.write('CURIE_SMOKE_RESULT ' + JSON.stringify({ passed, before, after, controller: petPositionController.getPosition(), positionWrites }) + '\n');
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    process.stdout.write('CURIE_SMOKE_RESULT ' + JSON.stringify({ passed: false, before, error: error.message, stack: error.stack }) + '\n');
    process.exitCode = 1;
  }
  app.quit();
}

function endPetDrag() {
  if (!petPositionController?.endDrag()) return;
  petDragging = false;
}

function cancelPetDrag() {
  if (!petPositionController?.cancelDrag()) return;
  petDragging = false;
}

function refreshPetWorkAreas() {
  petPositionController?.setWorkAreas(screen.getAllDisplays().map((display) => display.workArea));
}

function setDebugOverlay(enabled) {
  debugOverlayEnabled = Boolean(enabled);
  const settings = settingsStore.get();
  settingsStore.save({ ...settings, debugOverlay: debugOverlayEnabled });
  if (debugOverlayEnabled && (!debugOverlay || debugOverlay.isDestroyed())) debugOverlay = createDebugOverlayWindow();
  if (!debugOverlayEnabled && debugOverlay && !debugOverlay.isDestroyed()) debugOverlay.hide();
  refreshDebugOverlay();
}

function refreshDebugOverlay() {
  if (!debugOverlayEnabled || !petWindow || petWindow.isDestroyed()) return;
  if (!debugOverlay || debugOverlay.isDestroyed()) debugOverlay = createDebugOverlayWindow();
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const vector = {
    x: lastRawCursor.x - (bounds.x + bounds.width / 2),
    y: lastRawCursor.y - (bounds.y + bounds.height / 2),
  };
  const calmState = petCalm.snapshot();
  const wanderTarget = petWander?.getTarget() ?? null;
  const agentState = agentController?.diagnostics?.() ?? {};
  const lines = [
    `pet window: x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`,
    `display: ${display.id} workArea=${JSON.stringify(display.workArea)}`,
    `cursor: x=${lastRawCursor.x} y=${lastRawCursor.y}`,
    `vector from centre: dx=${vector.x} dy=${vector.y}`,
    `gaze: dx=${lastGazeOffset.dx} dy=${lastGazeOffset.dy}`,
    `last gaze received: ${Math.max(0, Date.now() - lastGazeReceivedAt)} ms ago`,
    `calm: ${calmState.calm} source=${calmState.source}`,
    `state: ${calmState.mode}${petAirborne ? ' (airborne)' : ''}`,
    `wander target: ${wanderTarget ? `x=${wanderTarget.x}, y=${wanderTarget.y}` : 'none'}`,
    `last wander write: ${lastWanderWriteAt === undefined ? 'never' : Math.max(0, Date.now() - lastWanderWriteAt) + ' ms ago'}`,
    `frame: ${petFrame}`,
    `timer: ${timerStatus?.phase ?? 'IDLE'} endAt=${timerStatus?.endAt ?? 'none'} remaining=${timerStatus?.remainingMs ?? 0}ms pausedAt=${timerStatus?.pausedAt ?? 'none'} cycle=${timerStatus?.cycleCount ?? 0}`,
    `timer notification: ${timerStatus?.lastNotification?.result ?? 'none'}`,
    `agent: provider=${agentState.provider ?? 'none'} finish=${agentState.finishReason ?? 'none'} tokens prompt=${agentState.tokenCounts?.prompt ?? agentState.promptTokens ?? 0} output=${agentState.tokenCounts?.output ?? agentState.outputTokens ?? 0} thinking=${agentState.tokenCounts?.thinking ?? agentState.thinkingTokens ?? 0}`,
    `agent request: iterations=${agentState.iterations ?? 0} tools=${(agentState.tools ?? []).join(',') || 'none'} error=${agentState.errorType ?? 'none'} validator=${agentState.lastValidatorMessage || 'none'} latency=${agentState.latencyMs ?? 0}ms`,
    `provider calls: today=${agentState.callsToday ?? 0}/${agentState.maxCallsPerDay ?? 400}; rolling minute=${agentState.callsThisMinute ?? 0}/${agentState.maxCallsPerMinute ?? 20}`,
    `keys present: Gemini=${agentState.keys?.gemini ? 'yes' : 'no'} Groq=${agentState.keys?.groq ? 'yes' : 'no'}`,
    'timer events (oldest first):',
    ...(timerStatus?.timerEvents ?? []).map((event) => `  ${event.action} source=${event.source} phase=${event.phase}`),
    'state changes (oldest first):',
    ...calmState.history.map((change) => `  ${change.mode} source=${change.source}`),
    'position writes (newest last):',
    ...positionWrites.map((write) => `  ${write.source}: x=${write.x} y=${write.y}`),
  ];
  updateDebugOverlay(debugOverlay, bounds, lines.join('\n'));
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

function setPetScale(scale) {
  if (![6, 10, 14].includes(scale)) return;
  const settings = settingsStore.get();
  settingsStore.save({ ...settings, petScale: scale });
  const size = petWindowSize(scale);
  petPositionController?.setSize(size);
  petWindow?.setSize(size.width, size.height);
  updatePetTimerWindow(petTimerWindow, petWindow?.getBounds(), timerStatus, settingsStore.get().showTimeOnPet);
  petWindow?.webContents.send('pet:set-scale', scale);
  eventLogger?.log(scale === 6 ? 'pet.scale.small' : scale === 10 ? 'pet.scale.medium' : 'pet.scale.large');
}

function notifySessionEnd(event) {
  if (!Notification.isSupported()) {
    eventLogger?.log('timer.notification.unsupported');
    return false;
  }
  const missed = Date.now() - event.endedAt > 30_000;
  new Notification({
    title: missed ? 'Timer phase ended while you were away' : 'Timer phase complete',
    body: event.phase === 'FOCUS'
      ? `Focus done. ${event.nextDurationMinutes ?? ''} min ${event.nextPhase === 'LONG_BREAK' ? 'long break' : 'break'}.`
      : 'Break over. Start the next focus when ready.',
  }).show();
  eventLogger?.log(missed ? 'timer.notification.catchup' : 'timer.notification.shown');
  return true;
}

function notifyReminder(reminder) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: reminder.missed ? 'Missed reminder' : 'Task reminder',
    body: reminder.task.title,
  }).show();
}

function notifyNudge(nudge) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Study plan check',
    body: nudge.message,
  }).show();
}

function notifyShortcutHint({ name }) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Set up your focus Shortcut',
    body: 'Curie could not find or run “' + name + '”. Check the name in Shortcuts settings.',
  }).show();
}

function makeShortcutRunner(settings) {
  return createShortcutRunner({
    enabled: settings.shortcutEnabled,
    startName: settings.startShortcut,
    endName: settings.endShortcut,
    onHint: notifyShortcutHint,
  });
}

function nudgeConfig(settings) {
  return {
    timeZone: settings.timeZone,
    quietHours: { start: settings.quietStart, end: settings.quietEnd },
    maxPerDay: settings.maxNudgesPerDay,
    frequencyMinutes: settings.nudgeFrequency,
  };
}

function buildProviders(store) {
  const settings = store.get();
  const keys = store.providers();
  return PROVIDER_DEFAULTS.map((provider) => ({
    ...provider,
    model: provider.id === 'gemini' ? settings.geminiModel : settings.groqModel,
    apiKey: keys[provider.id],
  }));
}

function applySettings(input) {
  const settings = settingsStore.save(input);
  timerService.configure({ ...timerService.config(), focusMinutes: settings.workMinutes, shortBreakMinutes: settings.breakMinutes });
  nudgeService.configure(nudgeConfig(settings));
  providerClient.setProviders(buildProviders(settingsStore));
  providerClient.setLimits({
    maxCallsPerDay: settings.maxLlmCallsPerDay,
    maxCallsPerMinute: 20,
  });
  shortcutRunner = makeShortcutRunner(settings);
  const petSize = petWindowSize(settings.petScale);
  petPositionController?.setSize(petSize);
  petWindow?.setSize(petSize.width, petSize.height);
  updatePetTimerWindow(petTimerWindow, petWindow?.getBounds(), timerStatus, settings.showTimeOnPet);
  petWindow?.webContents.send('pet:set-scale', settings.petScale);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  return settings;
}
