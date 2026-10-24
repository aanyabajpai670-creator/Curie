import { app, ipcMain } from 'electron';
import { createPetWindow } from './pet-window.js';
import { createTray, showPetMenu } from './app-menu.js';
import { togglePanel } from './panel-window.js';

let petWindow;
let panelWindow;

function openPanel() {
  panelWindow = togglePanel(petWindow, panelWindow);
  panelWindow.once('closed', () => { panelWindow = null; });
}

function registerWindowControls() {
  ipcMain.on('pet:toggle-panel', openPanel);
  ipcMain.on('pet:show-menu', () => showPetMenu(app, petWindow, openPanel));
  ipcMain.on('pet:set-state', (_event, state) => {
    if (['idle', 'focused', 'alert', 'sleep', 'done'].includes(state)) {
      petWindow?.webContents.send('pet:set-state', state);
    }
  });
}

app.whenReady().then(() => {
  petWindow = createPetWindow(app);
  createTray(app, petWindow, openPanel);
  registerWindowControls();
  app.on('activate', openPanel);
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
