import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PET_LIFT_MAX, petWindowSize } from '../core/pet-behavior.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createPetWindow(app, userScale = 10, position, positionController, restoreToken) {
  const { width, height } = petWindowSize(userScale, PET_LIFT_MAX);
  const pet = new BrowserWindow({
    ...position,
    width,
    height,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pet.loadFile(path.join(currentDir, '../renderer/pet.html'), {
    query: { scale: String(userScale) },
  });
  pet.on('ready-to-show', () => {
    pet.show();
    // macOS can apply its initial window placement during show(). Apply the
    // saved controller position after that native placement has completed.
    positionController.restore(position, restoreToken);
  });
  return pet;
}
