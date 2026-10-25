import { app, dialog, ipcMain, Notification, powerMonitor, safeStorage, screen } from 'electron';
import path from 'node:path';
import { createPetWindow } from './pet-window.js';
import { createTray, showPetMenu } from './app-menu.js';
import { togglePanel } from './panel-window.js';
import { createTimerService } from './timer-service.js';
import { createTaskService } from './task-service.js';
import { createAgentController } from '../agent/controller.js';
import { createAgentTools } from '../agent/tools.js';
import { createProviderClient } from '../agent/providers.js';
import { createNudgeService } from './nudge-service.js';
import { createShortcutRunner } from './shortcut-runner.js';
import { createSettingsStore } from './settings-store.js';
import { PROVIDER_DEFAULTS } from '../agent/providers.js';
import { createHorizontalWanderController, petStateFor, petWindowSize } from '../core/pet-behavior.js';
import { createPetPositionController } from '../core/pet-position.js';
import { clampCursorToDisplays, createPetGazeController, createResilientTick, shouldSendGaze } from '../core/pet-gaze.js';
import { createAnomalyLogger, createEventLogger } from './event-log.js';
import { createDebugOverlayWindow, updateDebugOverlay } from './debug-overlay-window.js';
import { readPetPosition, savePetPosition } from './window-state.js';

const smokeMode = process.env.CURIE_ELECTRON_SMOKE === '1';
if (smokeMode && process.env.CURIE_ELECTRON_SMOKE_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.CURIE_ELECTRON_SMOKE_USER_DATA));
}

let petWindow;
let panelWindow;
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
let petBehaviorMode = 'ACTIVE';
let petAirborne = false;
let petPositionController;
const petGaze = createPetGazeController();
let lastSentGaze;
let lastGazeSentAt = 0;
let debugOverlay;
let debugOverlayEnabled = false;
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

function registerWindowControls() {
  ipcMain.on('pet:toggle-panel', openPanel);
  ipcMain.on('pet:show-menu', () =>
    showPetMenu(app, openPanel, timerService, setPetScale, () => settingsStore.get().petScale, petWindow?.getBounds(), setDebugOverlay, () => debugOverlayEnabled),
  );
  ipcMain.on('pet:log', (_event, name) => {
    eventLogger?.log(name);
  });
  ipcMain.on('pet:drag-start', (_event, point) => beginPetDrag(point));
  ipcMain.on('pet:drag-move', (_event, point) => movePetDrag(point));
  ipcMain.on('pet:drag-end', () => endPetDrag());
  ipcMain.on('pet:drag-cancel', () => cancelPetDrag());
  ipcMain.on('pet:behavior', (_event, state) => {
    if (!state || !['ACTIVE', 'WANDER', 'CALM', 'CALM pending'].includes(state.mode) || typeof state.airborne !== 'boolean') return;
    petBehaviorMode = state.mode;
    petAirborne = state.airborne;
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
  const settings = settingsStore.get();
  debugOverlayEnabled = Boolean(settings.debugOverlay);
  const userDataPath = app.getPath('userData');
  const initialPetPosition = readPetPosition(userDataPath);
  petPositionController = makePetPositionController(userDataPath, initialPetPosition, settings.petScale);
  const restoreToken = petPositionController.getRevision();
  petWindow = createPetWindow(app, settings.petScale, petPositionController.getPosition(), petPositionController, restoreToken);
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
    workMinutes: settings.workMinutes,
    breakMinutes: settings.breakMinutes,
    notify: notifySessionEnd,
    onUpdate: updateTimerWindows,
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
    confirmDelete: confirmTaskDelete,
  });
  providerClient = createProviderClient({
    providers: buildProviders(settingsStore),
    maxCallsPerHour: settings.maxLlmCallsPerHour,
    maxCallsPerDay: settings.maxLlmCallsPerDay,
  });
  agentController = createAgentController({
    providerClient,
    taskService,
    executeTool: agentTools.executeTool,
    timeZone: () => settingsStore.get().timeZone,
  });
  createTray(app, openPanel, timerService, setPetScale, () => settingsStore.get().petScale, setDebugOverlay, () => debugOverlayEnabled);
  registerWindowControls();
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
});

app.on('before-quit', () => {
  endFocusShortcut();
  clearInterval(petPoll);
  clearInterval(debugPoll);
  for (const eventName of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.removeListener(eventName, refreshPetWorkAreas);
  }
  debugOverlay?.destroy();
  timerService?.stop();
  taskService?.stop();
  nudgeService?.stop();
});
app.on('window-all-closed', (event) => event.preventDefault());

function updateTimerWindows(status) {
  timerStatus = status;
  const shouldFocus = status.status === 'running' && status.phase === 'work';
  if (shouldFocus && !focusShortcutActive) {
    focusShortcutActive = true;
    void shortcutRunner?.start();
  } else if (!shouldFocus && focusShortcutActive) {
    endFocusShortcut();
  }
  panelWindow?.webContents.send('timer:update', status);
  updatePetState();
}

function endFocusShortcut() {
  if (!focusShortcutActive) return;
  focusShortcutActive = false;
  void shortcutRunner?.end();
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
  const cursor = screen.getCursorScreenPoint();
  lastRawCursor = cursor;
  const now = Date.now();
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
  const area = screen.getDisplayMatching(bounds).workArea;
  const paused = petDragging || petBehaviorMode === 'CALM' || petBehaviorMode === 'CALM pending';
  const moved = petWander.step(
    { x: bounds.x, y: bounds.y },
    { width: bounds.width, height: bounds.height },
    area,
    Date.now(),
    Math.random,
    petAirborne && !paused,
    paused,
  );
  const isWandering = petWander.isWandering();
  if (isWandering && !lastWanderEvent) eventLogger?.log('pet.wander.start');
  if (!isWandering && lastWanderEvent) eventLogger?.log('pet.wander.stop');
  lastWanderEvent = isWandering;
  petWindow.webContents.send('pet:set-wander', isWandering);
  petPositionController.wanderTo(moved, { airborne: petAirborne && !paused, calm: paused });
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
      if (petWindow && !petWindow.isDestroyed()) petWindow.setPosition(position.x, position.y);
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
  const lines = [
    `pet window: x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`,
    `display: ${display.id} workArea=${JSON.stringify(display.workArea)}`,
    `cursor: x=${lastRawCursor.x} y=${lastRawCursor.y}`,
    `vector from centre: dx=${vector.x} dy=${vector.y}`,
    `gaze: dx=${lastGazeOffset.dx} dy=${lastGazeOffset.dy}`,
    `last gaze received: ${Math.max(0, Date.now() - lastGazeReceivedAt)} ms ago`,
    `state: ${petBehaviorMode}${petAirborne ? ' (airborne)' : ''}`,
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
  petWindow?.webContents.send('pet:set-scale', scale);
  eventLogger?.log(scale === 6 ? 'pet.scale.small' : scale === 10 ? 'pet.scale.medium' : 'pet.scale.large');
}

function notifySessionEnd(event) {
  if (!Notification.isSupported()) return;
  const missed = Date.now() - event.endedAt > 30_000;
  const phaseName = event.phase === 'work' ? 'Focus session' : 'Break';
  new Notification({
    title: missed
      ? phaseName + ' ended while you were away'
      : phaseName + ' complete',
    body:
      event.phase === 'work'
        ? 'Time for a short break.'
        : 'Ready when you are.',
  }).show();
}

function notifyReminder(reminder) {
  if (!Notification.isSupported()) return;
  new Notification({
    title: reminder.missed ? 'Missed reminder' : 'Task reminder',
    body: reminder.task.title,
  }).show();
}

async function confirmTaskDelete(task) {
  const result = await dialog.showMessageBox(panelWindow, {
    type: 'warning',
    title: 'Delete task?',
    message: 'Delete “' + task.title + '”?',
    detail: 'Curie will remove this task from your task list.',
    buttons: ['Delete task', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return result.response === 0;
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
  timerService.configure(settings.workMinutes, settings.breakMinutes);
  nudgeService.configure(nudgeConfig(settings));
  providerClient.setProviders(buildProviders(settingsStore));
  providerClient.setLimits({
    maxCallsPerHour: settings.maxLlmCallsPerHour,
    maxCallsPerDay: settings.maxLlmCallsPerDay,
  });
  shortcutRunner = makeShortcutRunner(settings);
  const petSize = petWindowSize(settings.petScale);
  petPositionController?.setSize(petSize);
  petWindow?.setSize(petSize.width, petSize.height);
  petWindow?.webContents.send('pet:set-scale', settings.petScale);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  return settings;
}
