const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('curieReminder', Object.freeze({
  sendReply: (payload) => ipcRenderer.send('conversation:send', payload),
  action: (action, ids, options = {}) => ipcRenderer.send('reminder-bubble:action', { action, ids, ...options }),
  startFocus: (ids) => ipcRenderer.send('reminder-bubble:start-focus', { ids }),
  close: (source) => ipcRenderer.send('reminder-bubble:close', source),
  shown: (ids) => ipcRenderer.send('reminder-bubble:shown', ids),
  onUpdate: (callback) => subscribe('reminder-bubble:update', callback),
  onPushback: (callback) => subscribe('reminder-bubble:pushback', callback),
  onLocalReply: (callback) => subscribe('reminder-bubble:local-reply', callback),
  confirm: (payload) => ipcRenderer.send('conversation:confirm', payload),
  stage: (requestId, windowName, stage, detail) => ipcRenderer.send('conversation:stage', { requestId, windowName, stage, detail }),
  forwardError: (kind, message) => ipcRenderer.send('ui:renderer-error', { kind, message }),
  onConversationUpdate: (callback) => subscribe('conversation:update', callback),
  onConversationConfirmation: (callback) => subscribe('conversation:confirmation', callback),
  onConversationProposalResults: (callback) => subscribe('conversation:proposal-results', callback),
  openPanel: () => ipcRenderer.send('reminder-bubble:open-panel'),
}));
