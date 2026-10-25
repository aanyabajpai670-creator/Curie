import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPetPosition, savePetPosition } from './window-state.js';
import { PET_LIFT_MAX, petWindowSize } from '../core/pet-behavior.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createPetWindow(app, userScale = 10) {
  const { width, height } = petWindowSize(userScale, PET_LIFT_MAX);
  const position = readPetPosition(app.getPath('userData'));
  const pet = new BrowserWindow({
    ...position,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
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
  let persistPosition;
  pet.on('moved', () => {
    clearTimeout(persistPosition);
    persistPosition = setTimeout(
      () => savePetPosition(app.getPath('userData'), pet.getBounds()),
      500,
    );
  });
  pet.on('close', () => {
    clearTimeout(persistPosition);
    savePetPosition(app.getPath('userData'), pet.getBounds());
  });
  pet.on('ready-to-show', () => keepOnScreen(pet));
  return pet;
}

function keepOnScreen(window) {
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height);
  window.setPosition(x, y);
}
