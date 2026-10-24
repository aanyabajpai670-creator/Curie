import { app, ipcMain, Notification, powerMonitor } from 'electron';
import { createPetWindow } from './pet-window.js';
import { createTray, showPetMenu } from './app-menu.js';
import { togglePanel } from './panel-window.js';
import { createTimerService } from './timer-service.js';

let petWindow;
let panelWindow;
let timerService;

function openPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) {
    panelWindow = togglePanel(petWindow, null);
    panelWindow.once('closed', () => { panelWindow = null; });
    return;
  }
  panelWindow = togglePanel(petWindow, panelWindow);
}

function registerWindowControls() {
  ipcMain.on('pet:toggle-panel', openPanel);
  ipcMain.on('pet:show-menu', () => showPetMenu(app, petWindow, openPanel, timerService));
  ipcMain.handle('timer:action', (_event, action) => timerService.dispatch(action));
  ipcMain.handle('timer:status', () => timerService.dispatch('status'));
}

app.whenReady().then(() => {
  petWindow = createPetWindow(app);
  timerService = createTimerService({
    userDataPath: app.getPath('userData'),
    notify: notifySessionEnd,
    onUpdate: updateTimerWindows,
  });
  createTray(app, petWindow, openPanel, timerService);
  registerWindowControls();
  timerService.start();
  powerMonitor.on('resume', () => timerService.refresh());
  app.on('activate', openPanel);
});

app.on('before-quit', () => timerService?.stop());
app.on('window-all-closed', (event) => event.preventDefault());

function updateTimerWindows(status) {
  const petState = status.status === 'done'
    ? 'done'
    : status.status === 'running' && status.phase === 'work'
      ? 'focused'
      : status.status === 'running' && status.phase === 'break'
        ? 'sleep'
        : 'idle';
  petWindow?.webContents.send('pet:set-state', petState);
  panelWindow?.webContents.send('timer:update', status);
}

function notifySessionEnd(event) {
  if (!Notification.isSupported()) return;
  const missed = Date.now() - event.endedAt > 30_000;
  const phaseName = event.phase === 'work' ? 'Focus session' : 'Break';
  new Notification({
    title: missed ? phaseName + ' ended while you were away' : phaseName + ' complete',
    body: event.phase === 'work' ? 'Time for a short break.' : 'Ready when you are.',
  }).show();
}
