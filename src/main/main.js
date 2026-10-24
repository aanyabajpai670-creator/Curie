import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 420,
    height: 320,
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(currentDir, '../renderer/index.html'));
}

app.whenReady().then(createWindow);
