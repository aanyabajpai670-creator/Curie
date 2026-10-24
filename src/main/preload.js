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
}));
