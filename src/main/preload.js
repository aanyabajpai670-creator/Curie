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
  }),
);
