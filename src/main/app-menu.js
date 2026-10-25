import { Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export function createTray(app, openPanel, timerService, setPetScale, getPetScale, setDebugOverlay, getDebugOverlay, setCalm, getCalm, preferences = {}) {
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
  const menu = createAppMenu(app, openPanel, timerService, setPetScale, getPetScale, setDebugOverlay, getDebugOverlay, setCalm, getCalm, preferences);
  tray.setContextMenu(menu);
  return {
    tray,
    updateTimerMenu(status) {
      const setEnabled = (id, enabled) => {
        const item = menu.getMenuItemById(id);
        if (item) item.enabled = enabled;
      };
      setEnabled('timer-start', status.status === 'idle');
      setEnabled('timer-pause', status.status === 'running');
      setEnabled('timer-resume', status.status === 'paused');
      setEnabled('timer-skip', status.status === 'running' || status.status === 'paused');
      setEnabled('timer-stop', status.status === 'running' || status.status === 'paused');
    },
  };
}

export function showPetMenu(app, openPanel, timerService, setPetScale, getPetScale, position, setDebugOverlay, getDebugOverlay, setCalm, getCalm, preferences = {}) {
  createAppMenu(app, openPanel, timerService, setPetScale, getPetScale, setDebugOverlay, getDebugOverlay, setCalm, getCalm, preferences).popup(
    position ? { x: position.x, y: position.y } : {},
  );
}

function createAppMenu(app, openPanel, timerService, setPetScale, getPetScale, setDebugOverlay, getDebugOverlay, setCalm, getCalm, preferences = {}) {
  const petScale = getPetScale();
  const timer = timerService.dispatch('status', 'menu');
  const settings = preferences.getSettings?.() ?? {};
  const running = timer.status === 'running';
  const paused = timer.status === 'paused';
  const active = running || paused;
  return Menu.buildFromTemplate([
    { label: 'Open panel', click: openPanel },
    { label: 'Ask Curie...', click: preferences.openAsk ?? (() => {}) },
    { label: 'API keys...', click: preferences.openKeys ?? (() => {}) },
    { id: 'timer-start', label: 'Start focus', enabled: timer.status === 'idle', click: () => timerService.dispatch('startFocus', 'menu') },
    { id: 'timer-pause', label: 'Pause timer', enabled: running, click: () => timerService.dispatch('pause', 'menu') },
    { id: 'timer-resume', label: 'Resume timer', enabled: paused, click: () => timerService.dispatch('resume', 'menu') },
    { id: 'timer-skip', label: 'Skip phase', enabled: active, click: () => timerService.dispatch('skip', 'menu') },
    { id: 'timer-stop', label: 'Stop timer', enabled: active, click: () => timerService.dispatch('stop', 'menu') },
    { label: 'Open settings', click: openPanel },
    { label: 'Calm', type: 'checkbox', checked: Boolean(getCalm?.()), click: (item) => setCalm?.(item.checked) },
    { label: 'Calm during focus', type: 'checkbox', checked: settings.calmDuringFocus !== false, click: (item) => preferences.setPreference?.('calmDuringFocus', item.checked) },
    { label: 'Show time on pet', type: 'checkbox', checked: preferences.getShowTime?.() !== false, click: (item) => preferences.setPreference?.('showTimeOnPet', item.checked) },
    { label: 'Debug overlay', type: 'checkbox', checked: Boolean(getDebugOverlay?.()), click: (item) => setDebugOverlay?.(item.checked) },
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
