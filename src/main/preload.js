import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('curie', Object.freeze({
  version: '0.1.0',
  togglePanel: () => ipcRenderer.send('pet:toggle-panel'),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
  setPetState: (state) => ipcRenderer.send('pet:set-state', state),
  onPetState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('pet:set-state', listener);
    return () => ipcRenderer.removeListener('pet:set-state', listener);
  },
  timerAction: (action) => ipcRenderer.invoke('timer:action', action),
  getTimerStatus: () => ipcRenderer.invoke('timer:status'),
  onTimerUpdate: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('timer:update', listener);
    return () => ipcRenderer.removeListener('timer:update', listener);
  },
}));
