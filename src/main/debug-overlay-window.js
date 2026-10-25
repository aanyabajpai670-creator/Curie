import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createDebugOverlayWindow() {
  const overlay = new BrowserWindow({
    width: 430,
    height: 170,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(currentDir, 'debug-overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(currentDir, '../renderer/debug-overlay.html'));
  return overlay;
}

export function updateDebugOverlay(overlay, petBounds, text) {
  if (!overlay || overlay.isDestroyed()) return;
  const [, height] = overlay.getSize();
  overlay.setPosition(Math.round(petBounds.x), Math.round(petBounds.y - height - 8));
  if (!overlay.isVisible()) overlay.showInactive();
  overlay.webContents.send('debug:refresh', text);
}
