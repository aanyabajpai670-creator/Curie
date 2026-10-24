import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createTray(app, pet, openPanel, timerService) {
  const sheet = nativeImage.createFromPath(path.join(currentDir, '../../assets/pink_slime_sheet_16px.png'));
  const icon = sheet.crop({ x: 0, y: 0, width: 16, height: 16 }).resize({ width: 18, height: 18 });
  const tray = new Tray(icon);
  tray.setToolTip('Curie');
  tray.setContextMenu(createAppMenu(app, pet, openPanel, timerService));
  return tray;
}

export function showPetMenu(app, pet, openPanel, timerService, position) {
  createAppMenu(app, pet, openPanel, timerService).popup(position ? { x: position.x, y: position.y } : {});
}

function createAppMenu(app, pet, openPanel, timerService) {
  return Menu.buildFromTemplate([
    { label: 'Open Curie', click: openPanel },
    { label: 'Start timer', click: () => timerService.dispatch('start') },
    { label: 'Pause timer', click: () => timerService.dispatch('pause') },
    { label: 'Reset timer', click: () => timerService.dispatch('reset') },
    { label: 'Open settings', click: openPanel },
    { type: 'separator' },
    { label: 'Quit Curie', click: () => app.quit() },
  ]);
}
