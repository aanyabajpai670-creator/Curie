import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createTray(app, pet, openPanel) {
  const sheet = nativeImage.createFromPath(path.join(currentDir, '../../assets/pink_slime_sheet_16px.png'));
  const icon = sheet.crop({ x: 0, y: 0, width: 16, height: 16 }).resize({ width: 18, height: 18 });
  const tray = new Tray(icon);
  tray.setToolTip('Curie');
  tray.setContextMenu(createAppMenu(app, pet, openPanel));
  return tray;
}

export function showPetMenu(app, pet, openPanel, position) {
  createAppMenu(app, pet, openPanel).popup(position ? { x: position.x, y: position.y } : {});
}

function createAppMenu(app, pet, openPanel) {
  return Menu.buildFromTemplate([
    { label: 'Open Curie', click: openPanel },
    { label: 'Start timer', click: () => pet.webContents.send('pet:set-state', 'focused') },
    { label: 'Open settings', click: openPanel },
    { type: 'separator' },
    { label: 'Quit Curie', click: () => app.quit() },
  ]);
}
