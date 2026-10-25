import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createTray(app, openPanel, timerService, setPetScale, getPetScale) {
  const sheet = nativeImage.createFromPath(
    path.join(currentDir, '../../assets/pink_slime_body_sheet_16px.png'),
  );
  const icon = sheet.isEmpty()
    ? nativeImage.createFromDataURL(
        'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="8" fill="#ffb8d2"/></svg>'),
      )
    : sheet.crop({ x: 0, y: 0, width: 16, height: 16 }).resize({ width: 18, height: 18 });
  const tray = new Tray(icon);
  tray.setToolTip('Curie');
  tray.setContextMenu(createAppMenu(app, openPanel, timerService, setPetScale, getPetScale));
  return tray;
}

export function showPetMenu(app, openPanel, timerService, setPetScale, getPetScale, position) {
  createAppMenu(app, openPanel, timerService, setPetScale, getPetScale).popup(
    position ? { x: position.x, y: position.y } : {},
  );
}

function createAppMenu(app, openPanel, timerService, setPetScale, getPetScale) {
  const petScale = getPetScale();
  return Menu.buildFromTemplate([
    { label: 'Open Curie', click: openPanel },
    { label: 'Start timer', click: () => timerService.dispatch('start') },
    { label: 'Resume timer', click: () => timerService.dispatch('resume') },
    { label: 'Pause timer', click: () => timerService.dispatch('pause') },
    { label: 'Reset timer', click: () => timerService.dispatch('reset') },
    { label: 'Open settings', click: openPanel },
    {
      label: 'Pet size',
      submenu: [
        { label: 'Small (6×)', type: 'radio', checked: petScale === 6, click: () => setPetScale(6) },
        { label: 'Medium (10×)', type: 'radio', checked: petScale === 10, click: () => setPetScale(10) },
        { label: 'Large (14×)', type: 'radio', checked: petScale === 14, click: () => setPetScale(14) },
      ],
    },
    { type: 'separator' },
    { label: 'Quit Curie', click: () => app.quit() },
  ]);
}
