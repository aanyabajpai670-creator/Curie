const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('curieAsk', Object.freeze({
  send: (text, requestId) => ipcRenderer.send('ask:send', text, requestId),
  confirm: (approved) => ipcRenderer.send('ask:confirm', Boolean(approved)),
  close: () => ipcRenderer.send('ask:close'),
  onUpdate: (callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on('ask:update', listener); return () => ipcRenderer.removeListener('ask:update', listener); },
  onConfirmation: (callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on('ask:confirmation', listener); return () => ipcRenderer.removeListener('ask:confirmation', listener); },
}));
