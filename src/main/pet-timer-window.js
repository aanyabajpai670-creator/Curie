import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createPetTimerWindow() {
  const timer = new BrowserWindow({
    width: 160,
    height: 18,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(currentDir, 'pet-timer-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  timer.setIgnoreMouseEvents(true);
  timer.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  timer.loadFile(path.join(currentDir, '../renderer/pet-timer.html'));
  return timer;
}

export function updatePetTimerWindow(timer, petBounds, status, showEnabled) {
  if (!timer || timer.isDestroyed() || !petBounds) return;
  const workArea = screen.getDisplayMatching(petBounds).workArea;
  const below = petBounds.y + petBounds.height;
  const y = below + 18 <= workArea.y + workArea.height
    ? below
    : Math.max(workArea.y, petBounds.y - 18);
  timer.setBounds({
    x: Math.round(petBounds.x),
    y: Math.round(y),
    width: Math.round(petBounds.width),
    height: 18,
  });
  const running = showEnabled && status?.status === 'running';
  if (!running) {
    if (timer.isVisible()) timer.hide();
    return;
  }
  const seconds = Math.ceil(status.remainingMs / 1000);
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (!timer.isVisible()) timer.showInactive();
  timer.webContents.send('timer-readout:update', text);
}
