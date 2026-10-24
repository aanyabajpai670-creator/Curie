import { execFile as nodeExecFile } from 'node:child_process';

const execFile = nodeExecFile;

// Run user-selected Shortcuts without a shell so names stay a single argument.
export function createShortcutRunner({
  enabled = false,
  platform = process.platform,
  startName = '',
  endName = '',
  execFileImpl = execFile,
  onHint = () => {},
}) {
  const hinted = new Set();

  async function run(name, purpose) {
    if (!enabled || platform !== 'darwin' || !name.trim()) return false;
    try {
      const { stdout } = await callExecFile(execFileImpl, 'shortcuts', ['list']);
      if (!stdout.split(/\r?\n/).includes(name)) {
        hintOnce(name, purpose);
        return false;
      }
      await callExecFile(execFileImpl, 'shortcuts', ['run', name]);
      return true;
    } catch {
      hintOnce(name, purpose);
      return false;
    }
  }

  function hintOnce(name, purpose) {
    if (hinted.has(name)) return;
    hinted.add(name);
    onHint({ name, purpose });
  }

  return {
    start: () => run(startName, 'start'),
    end: () => run(endName, 'end'),
  };
}

function callExecFile(execFileImpl, file, args) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      file,
      args,
      { timeout: 10_000, windowsHide: true },
      (error, stdout = '', stderr = '') => {
        if (error) reject(Object.assign(error, { stderr }));
        else resolve({ stdout, stderr });
      },
    );
  });
}
