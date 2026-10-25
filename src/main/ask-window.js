import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
export function createAskWindow(pet) {
  const bounds = pet?.getBounds() ?? { x: 100, y: 100, width: 160, height: 160 };
  const window = new BrowserWindow({ width: 360, height: 230, x: bounds.x + bounds.width + 12, y: bounds.y, show: false, frame: true, title: 'Ask Curie', alwaysOnTop: true, resizable: false, webPreferences: { preload: path.join(currentDir, 'ask-window-preload.js'), contextIsolation: true, nodeIntegration: false } });
  window.loadFile(path.join(currentDir, '../renderer/ask.html'));
  window.once('ready-to-show', () => { window.show(); window.focus(); });
  return window;
}
