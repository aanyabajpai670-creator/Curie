const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('curieKeys', Object.freeze({
  status: () => ipcRenderer.invoke('keys:status'),
  save: (keys) => ipcRenderer.invoke('keys:save', keys),
  test: (provider, key, model) => ipcRenderer.invoke('keys:test', provider, key, model),
}));
