import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = listJavaScript(path.join(root, 'src'));
for (const file of sourceFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const main = read('src/main/main.js');
const preload = read('src/main/preload.js');
const debugPreload = read('src/main/debug-overlay-preload.js');
const debugWindow = read('src/main/debug-overlay-window.js');
const routes = [
  ['pet:drag-start', preload, /ipcRenderer\.send\('pet:drag-start'/, main, /ipcMain\.on\('pet:drag-start'/],
  ['pet:drag-move', preload, /ipcRenderer\.send\('pet:drag-move'/, main, /ipcMain\.on\('pet:drag-move'/],
  ['pet:drag-end', preload, /ipcRenderer\.send\('pet:drag-end'/, main, /ipcMain\.on\('pet:drag-end'/],
  ['pet:drag-cancel', preload, /ipcRenderer\.send\('pet:drag-cancel'/, main, /ipcMain\.on\('pet:drag-cancel'/],
  ['pet:gaze-received', preload, /ipcRenderer\.send\('pet:gaze-received'/, main, /ipcMain\.on\('pet:gaze-received'/],
  ['pet:gaze-watchdog', preload, /ipcRenderer\.send\('pet:gaze-watchdog'/, main, /ipcMain\.on\('pet:gaze-watchdog'/],
  ['pet:behavior', preload, /ipcRenderer\.send\('pet:behavior'/, main, /ipcMain\.on\('pet:behavior'/],
  ['pet:gaze', main, /webContents\.send\('pet:gaze'/, preload, /subscribe\('pet:gaze'/],
  ['pet:set-wander', main, /webContents\.send\('pet:set-wander'/, preload, /subscribe\('pet:set-wander'/],
  ['pet:set-scale', main, /webContents\.send\('pet:set-scale'/, preload, /subscribe\('pet:set-scale'/],
  ['debug:refresh', debugWindow, /webContents\.send\('debug:refresh'/, debugPreload, /ipcRenderer\.on\('debug:refresh'/],
];

for (const [channel, sender, sendPattern, receiver, receivePattern] of routes) {
  if (!sendPattern.test(sender) || !receivePattern.test(receiver)) {
    throw new Error('IPC route is incomplete: ' + channel);
  }
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
