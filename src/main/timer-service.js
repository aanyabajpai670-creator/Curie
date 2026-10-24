import fs from 'node:fs';
import path from 'node:path';
import { StudyTimer } from '../core/timer.js';

const STATE_FILE = 'timer-state.json';

export function createTimerService({
  userDataPath,
  workMinutes = 25,
  breakMinutes = 5,
  clock = Date.now,
  notify = () => {},
  onUpdate = () => {},
}) {
  const timer = new StudyTimer({
    clock,
    workMinutes,
    breakMinutes,
    initialState: loadState(userDataPath),
  });
  let interval;

  function persist() {
    const target = path.join(userDataPath, STATE_FILE);
    const temporary = target + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(timer.serialize()), 'utf8');
    fs.renameSync(temporary, target);
  }

  function publish(result) {
    persist();
    result.events.forEach(notify);
    onUpdate(result);
    return result;
  }

  function refresh() {
    return publish(timer.status());
  }

  function dispatch(action) {
    const allowed = ['start', 'pause', 'resume', 'reset', 'skip', 'status'];
    if (!allowed.includes(action)) throw new Error('Unknown timer action');
    return publish(action === 'status' ? timer.status() : timer[action]());
  }

  function configure(workMinutes, breakMinutes) {
    timer.workMs = positiveDuration(workMinutes) * 60_000;
    timer.breakMs = positiveDuration(breakMinutes) * 60_000;
    if (timer.state.status === 'idle' || timer.state.status === 'done') {
      timer.state.remainingMs = timer.workMs;
    }
    return refresh();
  }

  function start() {
    if (interval) return;
    refresh();
    interval = setInterval(refresh, 1000);
  }

  function stop() {
    clearInterval(interval);
    interval = undefined;
    persist();
  }

  return { dispatch, start, stop, refresh, configure };
}

function positiveDuration(value) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError('Timer duration must be positive');
  return value;
}

function loadState(userDataPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userDataPath, STATE_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}
