import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = listJavaScript(path.join(root, 'src'));
for (const file of sourceFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const main = read('src/main/main.js');
const preload = read('src/main/preload.js');
const renderer = read('src/renderer/pet.js');
const appMenu = read('src/main/app-menu.js');
const petTimerWindow = read('src/main/pet-timer-window.js');
const petTimerPreload = read('src/main/pet-timer-preload.js');
const debugPreload = read('src/main/debug-overlay-preload.js');
const debugWindow = read('src/main/debug-overlay-window.js');
const askPreload = read('src/main/ask-window-preload.js');
const keyPreload = read('src/main/key-window-preload.js');
const keyRenderer = read('src/renderer/api-keys.js');
const askRenderer = read('src/renderer/ask.js');
const routes = [
  ['pet:drag-start', preload, /ipcRenderer\.send\('pet:drag-start'/, main, /ipcMain\.on\('pet:drag-start'/],
  ['pet:drag-move', preload, /ipcRenderer\.send\('pet:drag-move'/, main, /ipcMain\.on\('pet:drag-move'/],
  ['pet:drag-end', preload, /ipcRenderer\.send\('pet:drag-end'/, main, /ipcMain\.on\('pet:drag-end'/],
  ['pet:drag-cancel', preload, /ipcRenderer\.send\('pet:drag-cancel'/, main, /ipcMain\.on\('pet:drag-cancel'/],
  ['pet:gaze-received', preload, /ipcRenderer\.send\('pet:gaze-received'/, main, /ipcMain\.on\('pet:gaze-received'/],
  ['pet:gaze-watchdog', preload, /ipcRenderer\.send\('pet:gaze-watchdog'/, main, /ipcMain\.on\('pet:gaze-watchdog'/],
  ['pet:behavior', preload, /ipcRenderer\.send\('pet:behavior'/, main, /ipcMain\.on\('pet:behavior'[^]*?setCalm\(state\.mode === 'CALM'/],
  ['pet:calm-toggle', preload, /ipcRenderer\.send\('pet:calm-toggle'/, main, /ipcMain\.on\('pet:calm-toggle'[^]*?setCalm\(!petCalm\.snapshot\(\)\.calm, 'click'\)/],
  ['pet:calm-toggle renderer click', renderer, /window\.curie\.togglePetCalm\(\)/, preload, /togglePetCalm: \(\) => ipcRenderer\.send\('pet:calm-toggle'/],
  ['pet:frame', preload, /ipcRenderer\.send\('pet:frame'/, main, /ipcMain\.on\('pet:frame'/],
  ['pet:calm-state', main, /webContents\.send\('pet:calm-state'/, preload, /subscribe\('pet:calm-state'/],
  ['pet:gaze', main, /webContents\.send\('pet:gaze'/, preload, /subscribe\('pet:gaze'/],
  ['pet:set-scale', main, /webContents\.send\('pet:set-scale'/, preload, /subscribe\('pet:set-scale'/],
  ['timer:action', preload, /ipcRenderer\.invoke\('timer:action'/, main, /ipcMain\.handle\('timer:action'[^]*?timerService\.dispatch\(action\)/],
  ['timer:status', preload, /ipcRenderer\.invoke\('timer:status'/, main, /ipcMain\.handle\('timer:status'/],
  ['timer:update', main, /webContents\.send\('timer:update'/, preload, /subscribe\('timer:update'/],
  ['timer-readout:update', petTimerWindow, /webContents\.send\('timer-readout:update'/, petTimerPreload, /ipcRenderer\.on\('timer-readout:update'/],
  ['pet:timer-visual', main, /webContents\.send\('pet:timer-visual'/, preload, /subscribe\('pet:timer-visual'/],
  ['debug:refresh', debugWindow, /webContents\.send\('debug:refresh'/, debugPreload, /ipcRenderer\.on\('debug:refresh'/],
  ['ask:send', askPreload, /ipcRenderer\.send\('ask:send'/, main, /ipcMain\.on\('ask:send'/],
  ['ask:confirm', askPreload, /ipcRenderer\.send\('ask:confirm'/, main, /ipcMain\.on\('ask:confirm'/],
  ['ask:close', askPreload, /ipcRenderer\.send\('ask:close'/, main, /ipcMain\.on\('ask:close'/],
  ['ask:update', main, /webContents\.send\('ask:update'/, askPreload, /ipcRenderer\.on\('ask:update'/],
  ['ask:confirmation', main, /webContents\.send\('ask:confirmation'/, askPreload, /ipcRenderer\.on\('ask:confirmation'/],
  ['keys:status', keyPreload, /ipcRenderer\.invoke\('keys:status'/, main, /ipcMain\.handle\('keys:status'/],
  ['keys:save', keyPreload, /ipcRenderer\.invoke\('keys:save'/, main, /ipcMain\.handle\('keys:save'/],
  ['keys:test', keyPreload, /ipcRenderer\.invoke\('keys:test'/, main, /ipcMain\.handle\('keys:test'/],
];

for (const [channel, sender, sendPattern, receiver, receivePattern] of routes) {
  if (!sendPattern.test(sender) || !receivePattern.test(receiver)) {
    throw new Error('IPC route is incomplete: ' + channel);
  }
}

if (!/setCalm\(value, 'menu'\)/.test(main) || !/setCalm\?\.\(item\.checked\)/.test(appMenu)) {
  throw new Error('The right-click/tray Calm menu is not connected to the main state owner');
}
if (!/globalShortcut\.register\('Control\+Alt\+C', \(\) => setCalm\([^]*?'shortcut'\)\)/.test(main)) {
  throw new Error('The Ctrl+Option+C calm shortcut is not connected to the main state owner');
}
if (!/timerCalmLease\.sync\(shouldFocus, calmForFocus, Date\.now\(\)\)/.test(main)) {
  throw new Error('Timer focus entry and exit are not connected to the main calm state owner');
}
if (!/source: 'timer'/.test(main) || !/setCalm\(value, source\)/.test(main)) {
  throw new Error('Timer focus calm does not use the main setCalm owner with source timer');
}
if (!/globalShortcut\.register\('Control\+Alt\+T'[^]*?timerService\.dispatch/.test(main)
    || !/timerService\.dispatch\('startFocus', 'menu'\)/.test(appMenu)) {
  throw new Error('Timer shortcut and menu do not dispatch through the shared timer service');
}
if (!/label: 'Calm during focus'/.test(appMenu) || !/label: 'Show time on pet'/.test(appMenu)) {
  throw new Error('Timer pet display preferences are missing from the native menus');
}
if (!/label: 'Ask Curie\.\.\.'[^]*?preferences\.openAsk/.test(appMenu) || !/globalShortcut\.register\('Control\+Alt\+A', openAskWindow\)/.test(main)) {
  throw new Error('Ask menu and shortcut do not use the same openAskWindow function');
}
if (!/label: 'API keys\.\.\.'[^]*?preferences\.openKeys/.test(appMenu) || !/safeStorage\.isEncryptionAvailable\(\)/.test(main)) {
  throw new Error('API key settings menu or safeStorage check is missing');
}
if (!/askCalmLease\.begin\(Date\.now\(\)\)/.test(main) || !/askCalmLease\.end\(Date\.now\(\)\)/.test(main)) {
  throw new Error('Ask window does not acquire and restore the existing calm lease');
}
if (!/onConfirmation/.test(askPreload) || !/curieAsk\.onConfirmation/.test(askRenderer) || !/testProvider\(provider/.test(main)) {
  throw new Error('Ask confirmation or key-test route is incomplete');
}
if (!/curieKeys\.status\(\)/.test(keyRenderer) || !/curieKeys\.save\(/.test(keyRenderer) || !/curieKeys\.test\(/.test(keyRenderer)) {
  throw new Error('API key status, save, and test UI calls are incomplete');
}

process.stdout.write(`Doctor passed: syntax checked ${sourceFiles.length} source files and verified ${routes.length} IPC routes.\n`);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listJavaScript(target) : entry.isFile() && target.endsWith('.js') ? [target] : [];
  });
}
