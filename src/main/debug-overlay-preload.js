import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('curieDebug', Object.freeze({
  onRefresh: (callback) => ipcRenderer.on('debug:refresh', (_event, text) => callback(text)),
}));
