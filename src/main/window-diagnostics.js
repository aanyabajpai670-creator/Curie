export function attachWindowDiagnostics(window, name, log, secrets = () => []) {
  const contents = window?.webContents;
  if (!contents?.on) return () => {};
  const clean = (value) => {
    let text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
    for (const secret of secrets()) if (secret) text = text.split(secret).join('[redacted]');
    return text.replace(/[^A-Za-z0-9 .,;:_()'/-]/g, '_');
  };
  const event = (kind, value = '') => log(`ui.${name}.${kind}.${clean(value || 'none').replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase()}`);
  const onConsole = (details = {}) => {
    if (details.level === 'warning' || details.level === 'error') {
      event(details.level === 'error' ? 'console-error' : 'console-warning', details.message);
    }
  };
  const onGone = (_event, details) => event('render-process-gone', `${details?.reason || 'unknown'}-${details?.exitCode ?? 'none'}`);
  const onFail = (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => event('did-fail-load', `${errorCode}-${errorDescription}-${isMainFrame ? 'main' : 'subframe'}`);
  contents.on('console-message', onConsole);
  contents.on('render-process-gone', onGone);
  contents.on('did-fail-load', onFail);
  return () => {
    contents.removeListener?.('console-message', onConsole);
    contents.removeListener?.('render-process-gone', onGone);
    contents.removeListener?.('did-fail-load', onFail);
  };
}

export function rendererErrorEvent(name, kind, message, secrets = []) {
  let safe = String(message ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
  for (const secret of secrets) if (secret) safe = safe.split(secret).join('[redacted]');
  return { windowName: name, kind: String(kind || 'renderer-error').slice(0, 60), message: safe.replace(/[^A-Za-z0-9 .,;:_()'/-]/g, '_') };
}
