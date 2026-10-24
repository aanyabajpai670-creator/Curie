import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function togglePanel(pet, currentPanel) {
  if (currentPanel && !currentPanel.isDestroyed()) {
    currentPanel.isVisible() ? currentPanel.hide() : showBesidePet(pet, currentPanel);
    return currentPanel;
  }
  const panel = new BrowserWindow({
    width: 340,
    height: 440,
    show: false,
    resizable: false,
    title: 'Curie',
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panel.loadFile(path.join(currentDir, '../renderer/panel.html'));
  panel.once('ready-to-show', () => showBesidePet(pet, panel));
  return panel;
}

export function showBesidePet(pet, panel) {
  if (!pet || pet.isDestroyed() || !panel || panel.isDestroyed()) return;
  const bounds = pet.getBounds();
  panel.setPosition(bounds.x + bounds.width + 10, bounds.y);
  panel.show();
  panel.focus();
}
