function report(ipcRenderer, windowName, kind, detail) {
  const value = detail?.reason || detail?.message || detail?.stack || String(detail || 'renderer error');
  ipcRenderer.send('ui:renderer-error', { windowName, kind, message: String(value).slice(0, 240) });
}

module.exports = function installRendererErrorReporting(ipcRenderer, windowName) {
  window.addEventListener('error', (event) => report(ipcRenderer, windowName, 'uncaught-exception', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => report(ipcRenderer, windowName, 'unhandled-rejection', event.reason));
  process.on('uncaughtExceptionMonitor', (error) => report(ipcRenderer, windowName, 'uncaught-exception', error));
  process.on('unhandledRejection', (reason) => report(ipcRenderer, windowName, 'unhandled-rejection', reason));
};
