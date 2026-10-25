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
import { clampPosition, createHorizontalWanderController, petStateFor, petWindowSize } from '../core/pet-behavior.js';
import { createEventLogger } from './event-log.js';

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
let petDragging = false;
let petCurrentState = 'idle';
let petWander;
let lastWanderEvent = false;
let petBehaviorMode = 'ACTIVE';
let petAirborne = false;

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
    showPetMenu(app, openPanel, timerService, setPetScale, () => settingsStore.get().petScale),
  );
  ipcMain.on('pet:log', (_event, name) => {
    if (name === 'pet.drag.start') petDragging = true;
    if (name === 'pet.drag.end') petDragging = false;
    eventLogger?.log(name);
  });
  ipcMain.on('pet:move', (_event, delta) => movePet(delta));
  ipcMain.on('pet:behavior', (_event, state) => {
    if (!state || !['ACTIVE', 'WANDER', 'CALM', 'CALM pending'].includes(state.mode) || typeof state.airborne !== 'boolean') return;
    petBehaviorMode = state.mode;
    petAirborne = state.airborne;
  });
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
  settingsStore = createSettingsStore({
    filePath: path.join(app.getPath('userData'), 'settings.json'),
    safeStorage,
  });
  const settings = settingsStore.get();
  petWindow = createPetWindow(app, settings.petScale);
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
  createTray(app, openPanel, timerService, setPetScale, () => settingsStore.get().petScale);
  registerWindowControls();
  timerService.start();
  taskService.start();
  nudgeService.start();
  petPoll = setInterval(pollPet, 30);
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

function pollPet() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  petWindow.webContents.send('pet:cursor', {
    x: cursor.x - bounds.x,
    y: cursor.y - bounds.y,
  });
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
  if (Math.abs(moved.x - bounds.x) > 0.5) petWindow.setPosition(Math.round(moved.x), bounds.y);
}

function movePet(delta) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (!delta || !Number.isFinite(delta.dx) || !Number.isFinite(delta.dy)) return;
  const bounds = petWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const position = clampPosition(
    { x: bounds.x + Math.max(-250, Math.min(250, delta.dx)), y: bounds.y + Math.max(-250, Math.min(250, delta.dy)) },
    { width: bounds.width, height: bounds.height },
    area,
  );
  petWindow.setPosition(Math.round(position.x), Math.round(position.y));
}

function setPetScale(scale) {
  if (![6, 10, 14].includes(scale)) return;
  const settings = settingsStore.get();
  settingsStore.save({ ...settings, petScale: scale });
  const size = petWindowSize(scale);
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
  petWindow?.setSize(petSize.width, petSize.height);
  petWindow?.webContents.send('pet:set-scale', settings.petScale);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  return settings;
}
