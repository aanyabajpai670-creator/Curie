const { contextBridge, ipcRenderer } = require('electron');

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
    resolveReminder: (id, action) =>
      ipcRenderer.invoke('reminders:resolve', id, action),
    onTasksUpdate: (callback) => subscribe('tasks:update', callback),
    sendChat: (message) => ipcRenderer.invoke('agent:send', message),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  }),
);
