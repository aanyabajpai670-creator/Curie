const { contextBridge, ipcRenderer } = require('electron');
installRendererErrorReporting('renderer');

function installRendererErrorReporting(windowName) {
  const report = (kind, detail) => {
    const value = detail?.reason || detail?.message || detail?.stack || String(detail || 'renderer error');
    ipcRenderer.send('ui:renderer-error', { windowName, kind, message: String(value).slice(0, 240) });
  };
  window.addEventListener('error', (event) => report('uncaught-exception', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => report('unhandled-rejection', event.reason));
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('uncaughtExceptionMonitor', (error) => report('uncaught-exception', error));
    process.on('unhandledRejection', (reason) => report('unhandled-rejection', reason));
  }
}

function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld(
  'curie',
  Object.freeze({
    version: '0.1.0',
    togglePanel: () => ipcRenderer.send('pet:toggle-panel'),
    showMenu: () => ipcRenderer.send('pet:show-menu'),
    onPetState: (callback) => subscribe('pet:set-state', callback),
    onPetCalmState: (callback) => subscribe('pet:calm-state', callback),
    onPetGaze: (callback) => subscribe('pet:gaze', callback),
    ackPetGaze: () => ipcRenderer.send('pet:gaze-received'),
    reportGazeWatchdog: () => ipcRenderer.send('pet:gaze-watchdog'),
    onPetScale: (callback) => subscribe('pet:set-scale', callback),
    setPetBehavior: (mode, airborne) => ipcRenderer.send('pet:behavior', { mode, airborne }),
    togglePetCalm: () => ipcRenderer.send('pet:calm-toggle'),
    reportPetFrame: (frame) => ipcRenderer.send('pet:frame', frame),
    beginPetDrag: (point) => ipcRenderer.send('pet:drag-start', point),
    dragPet: (point) => ipcRenderer.send('pet:drag-move', point),
    endPetDrag: () => ipcRenderer.send('pet:drag-end'),
    cancelPetDrag: () => ipcRenderer.send('pet:drag-cancel'),
    logPetEvent: (name) => ipcRenderer.send('pet:log', name),
    timerAction: (action) => ipcRenderer.invoke('timer:action', action),
    getTimerStatus: () => ipcRenderer.invoke('timer:status'),
    onTimerUpdate: (callback) => subscribe('timer:update', callback),
    onTimerVisual: (callback) => subscribe('pet:timer-visual', callback),
    listTasks: () => ipcRenderer.invoke('tasks:list'),
    addTask: (input) => ipcRenderer.invoke('tasks:add', input),
    updateTask: (id, changes) =>
      ipcRenderer.invoke('tasks:update', id, changes),
    completeTask: (id) => ipcRenderer.invoke('tasks:complete', id),
    deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
    listReminders: () => ipcRenderer.invoke('reminders:list'),
    reportRemindersShown: (ids) => ipcRenderer.send('reminders:shown-in-panel', ids),
    resolveReminder: (id, action) =>
      ipcRenderer.invoke('reminders:resolve', id, action),
    onTasksUpdate: (callback) => subscribe('tasks:update', callback),
    onReminderActionError: (callback) => subscribe('reminder:action-error', callback),
    sendConversation: (payload) => ipcRenderer.send('conversation:send', payload),
    confirmConversation: (payload) => ipcRenderer.send('conversation:confirm', payload),
    clearConversation: (windowName) => ipcRenderer.send('conversation:clear', windowName),
    closeConversation: () => ipcRenderer.send('conversation:close', 'panel'),
    onConversationUpdate: (callback) => subscribe('conversation:update', callback),
    onConversationConfirmation: (callback) => subscribe('conversation:confirmation', callback),
    onConversationProposalResults: (callback) => subscribe('conversation:proposal-results', callback),
    conversationStage: (requestId, windowName, stage, detail) => ipcRenderer.send('conversation:stage', { requestId, windowName, stage, detail }),
    rendererError: (kind, message) => ipcRenderer.send('ui:renderer-error', { windowName: 'panel', kind, message }),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  }),
);
