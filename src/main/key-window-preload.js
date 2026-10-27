const { contextBridge, ipcRenderer } = require('electron');
installRendererErrorReporting();
function installRendererErrorReporting() {
  const report = (kind, detail) => ipcRenderer.send('ui:renderer-error', { kind, message: String(detail?.message || detail?.stack || detail || 'renderer error').slice(0, 240) });
  window.addEventListener('error', (event) => report('uncaught-exception', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => report('unhandled-rejection', event.reason));
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('uncaughtExceptionMonitor', (error) => report('uncaught-exception', error));
    process.on('unhandledRejection', (reason) => report('unhandled-rejection', reason));
  }
}
contextBridge.exposeInMainWorld('curieKeys', Object.freeze({
  status: () => ipcRenderer.invoke('keys:status'),
  save: (keys) => ipcRenderer.invoke('keys:save', keys),
  test: (provider, key, model) => ipcRenderer.invoke('keys:test', provider, key, model),
}));
