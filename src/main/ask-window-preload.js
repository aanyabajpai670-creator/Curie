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
function subscribe(channel, callback) { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); }
contextBridge.exposeInMainWorld('curieConversation', Object.freeze({
  send: (payload) => ipcRenderer.send('conversation:send', payload),
  confirm: (payload) => ipcRenderer.send('conversation:confirm', payload),
  clear: (windowName) => ipcRenderer.send('conversation:clear', windowName),
  close: () => ipcRenderer.send('conversation:close', 'ask'),
  stage: (requestId, windowName, stage, detail) => ipcRenderer.send('conversation:stage', { requestId, windowName, stage, detail }),
  forwardError: (kind, message) => ipcRenderer.send('ui:renderer-error', { windowName: 'ask', kind, message }),
  onUpdate: (callback) => subscribe('conversation:update', callback),
  onConfirmation: (callback) => subscribe('conversation:confirmation', callback),
  onProposalResults: (callback) => subscribe('conversation:proposal-results', callback),
}));
