import { app, dialog, ipcMain, Notification, powerMonitor } from 'electron';
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

let petWindow;
let panelWindow;
let timerService;
let taskService;
let timerStatus;
let agentController;
let nudgeService;
let shortcutRunner;
let focusShortcutActive = false;

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
  ipcMain.on('pet:show-menu', () => showPetMenu(app, openPanel, timerService));
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
  ipcMain.handle('reminders:resolve', (_event, id, action) =>
    taskService.resolve(id, action),
  );
}

app.whenReady().then(() => {
  petWindow = createPetWindow(app);
  timerService = createTimerService({
    userDataPath: app.getPath('userData'),
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
    onNudge: notifyNudge,
  });
  shortcutRunner = createShortcutRunner({
    enabled: process.env.CURIE_FOCUS_SHORTCUTS === '1',
    startName: process.env.CURIE_START_SHORTCUT || '',
    endName: process.env.CURIE_END_SHORTCUT || '',
    onHint: notifyShortcutHint,
  });
  const agentTools = createAgentTools({
    taskService,
    timerService,
    confirmDelete: confirmTaskDelete,
  });
  agentController = createAgentController({
    providerClient: createProviderClient(),
    taskService,
    executeTool: agentTools.executeTool,
  });
  createTray(app, openPanel, timerService);
  registerWindowControls();
  timerService.start();
  taskService.start();
  nudgeService.start();
  powerMonitor.on('resume', () => {
    timerService.refresh();
    taskService.check();
    nudgeService.check();
  });
  app.on('activate', openPanel);
});

app.on('before-quit', () => {
  endFocusShortcut();
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
  const petState = taskService?.pending().length
    ? 'alert'
    : timerStatus?.status === 'done'
      ? 'done'
      : timerStatus?.status === 'running' && timerStatus.phase === 'work'
        ? 'focused'
        : timerStatus?.status === 'running' && timerStatus.phase === 'break'
          ? 'sleep'
          : 'idle';
  petWindow?.webContents.send('pet:set-state', petState);
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
