import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_NUDGE_SETTINGS, evaluateNudges } from '../core/nudges.js';

export function createNudgeService({
  filePath,
  getTasks,
  config = DEFAULT_NUDGE_SETTINGS,
  clock = Date.now,
  onNudge = () => {},
  onUpdate = () => {},
}) {
  if (!filePath || typeof getTasks !== 'function') {
    throw new TypeError('filePath and getTasks are required');
  }
  let state = loadState(filePath);
  let interval;

  function configure(nextConfig) {
    config = nextConfig;
    if (interval) {
      clearInterval(interval);
      interval = setInterval(check, config.frequencyMinutes * 60_000);
    }
    return check();
  }

  function check() {
    const result = evaluateNudges(getTasks(), clock(), config, state);
    state = result.state;
    saveState(filePath, state);
    result.nudges.forEach(onNudge);
    onUpdate(result.nudges);
    return result.nudges;
  }

  function start() {
    if (interval) return;
    check();
    interval = setInterval(check, (config.frequencyMinutes || 30) * 60_000);
  }

  function stop() {
    clearInterval(interval);
    interval = undefined;
  }

  return { check, start, stop, configure };
}

function loadState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function saveState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(state), 'utf8');
  fs.renameSync(temporary, filePath);
}
