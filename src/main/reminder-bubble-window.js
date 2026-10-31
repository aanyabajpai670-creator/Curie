import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const REMINDER_BUBBLE_SIZE = Object.freeze({ width: 360, height: 440 });

export function createReminderBubbleWindow() {
  const window = new BrowserWindow({
    width: REMINDER_BUBBLE_SIZE.width,
    height: REMINDER_BUBBLE_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(currentDir, 'reminder-bubble-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(path.join(currentDir, '../renderer/reminder-bubble.html'));
  return window;
}

export function positionReminderBubble(window, petBounds) {
  if (!window || window.isDestroyed() || !petBounds) return;
  const { width, height } = REMINDER_BUBBLE_SIZE;
  const display = screen.getDisplayMatching(petBounds);
  const work = display.workArea;
  const x = Math.max(work.x, Math.min(work.x + work.width - width, Math.round(petBounds.x + petBounds.width / 2 - width / 2)));
  const above = petBounds.y - height - 12;
  const y = Math.max(work.y, above);
  window.setBounds({ x, y: Math.round(y), width, height });
}

export function showReminderBubble(window, petBounds, payload) {
  if (!window || window.isDestroyed()) return;
  positionReminderBubble(window, petBounds);
  window.webContents.send('reminder-bubble:update', payload);
  if (!window.isVisible()) window.showInactive();
}
