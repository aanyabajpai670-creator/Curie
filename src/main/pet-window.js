import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPetPosition, savePetPosition } from './window-state.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const PET_SIZE = 112;

export function createPetWindow(app) {
  const position = readPetPosition(app.getPath('userData'));
  const pet = new BrowserWindow({
    ...position,
    width: PET_SIZE,
    height: PET_SIZE,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
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
  pet.loadFile(path.join(currentDir, '../renderer/pet.html'));
  pet.on('moved', () => savePetPosition(app.getPath('userData'), pet.getBounds()));
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
