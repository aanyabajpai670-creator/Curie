import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'curie-electron-smoke-'));
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let stdout = '';
let stderr = '';

const child = spawn(command, ['run', 'start'], {
  cwd: root,
  env: {
    ...process.env,
    CURIE_ELECTRON_SMOKE: '1',
    CURIE_ELECTRON_SMOKE_USER_DATA: userDataPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
  shell: process.platform === 'win32',
});

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
  process.stderr.write(chunk);
});

const exit = await new Promise((resolve) => {
  const timeout = setTimeout(() => {
    if (child.pid) {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    }
    resolve({ code: null, signal: 'TIMEOUT' });
  }, 20_000);
  child.once('exit', (code, signal) => {
    clearTimeout(timeout);
    resolve({ code, signal });
  });
});

const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith('CURIE_SMOKE_RESULT '));
const result = resultLine ? JSON.parse(resultLine.slice('CURIE_SMOKE_RESULT '.length)) : null;
const logPath = path.join(userDataPath, 'logs', 'curie.log');
const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
const errors = log.split(/\r?\n/).filter((line) => /\b(error|exception|fatal)\b/i.test(line));

process.stdout.write('Electron exit: code=' + exit.code + ' signal=' + exit.signal + '\n');
process.stdout.write('Smoke result: ' + JSON.stringify(result) + '\n');
process.stdout.write('curie.log: ' + (fs.existsSync(logPath) ? log.split(/\r?\n/).filter(Boolean).length + ' lines' : 'not created') + '\n');
process.stdout.write('curie.log errors: ' + (errors.length ? errors.join(' | ') : 'none') + '\n');

fs.rmSync(userDataPath, { recursive: true, force: true });
if (!result?.passed || exit.code !== 0 || errors.length) {
  process.stderr.write('Electron smoke test failed. Captured stderr: ' + (stderr.trim() || '(empty)') + '\n');
  process.exitCode = 1;
}
