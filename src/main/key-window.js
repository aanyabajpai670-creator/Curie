import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
export function createKeyWindow() {
  const window = new BrowserWindow({ width: 410, height: 390, show: false, title: 'Curie API keys', resizable: false, webPreferences: { preload: path.join(currentDir, 'key-window-preload.js'), contextIsolation: true, nodeIntegration: false } });
  window.loadFile(path.join(currentDir, '../renderer/api-keys.html'));
  window.once('ready-to-show', () => window.show());
  return window;
}
