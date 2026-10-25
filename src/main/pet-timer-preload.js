const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('curieTimerReadout', Object.freeze({
  onUpdate(callback) {
    ipcRenderer.on('timer-readout:update', (_event, text) => callback(String(text ?? '')));
  },
}));
