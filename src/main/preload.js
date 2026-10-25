import { contextBridge, ipcRenderer } from 'electron';

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
    onPetCursor: (callback) => subscribe('pet:cursor', callback),
    onPetWander: (callback) => subscribe('pet:set-wander', callback),
    onPetScale: (callback) => subscribe('pet:set-scale', callback),
    setPetBehavior: (mode, airborne) => ipcRenderer.send('pet:behavior', { mode, airborne }),
    movePetBy: (delta) => ipcRenderer.send('pet:move', delta),
    logPetEvent: (name) => ipcRenderer.send('pet:log', name),
    timerAction: (action) => ipcRenderer.invoke('timer:action', action),
    getTimerStatus: () => ipcRenderer.invoke('timer:status'),
    onTimerUpdate: (callback) => subscribe('timer:update', callback),
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
