import fs from 'node:fs';
import path from 'node:path';
import { StudyTimer, normalizeConfig } from '../core/timer.js';

const STATE_FILE = 'timer-state.json';

export function createTimerService({
  userDataPath,
  config,
  workMinutes,
  breakMinutes,
  clock = Date.now,
  notify = () => {},
  onUpdate = () => {},
  log = () => {},
  writeState = atomicWrite,
}) {
  const timerConfig = normalizeConfig(config || {
    focusMinutes: workMinutes ?? 25,
    shortBreakMinutes: breakMinutes ?? 5,
  });
  const loaded = loadState(userDataPath, log);
  const timer = new StudyTimer({ clock, config: timerConfig, initialState: loaded.state });
  let interval;
  let lastPersisted = JSON.stringify(timer.serialize());
  let lastNotification = { shown: false, result: 'none' };
  const history = [];
  let startupEvents = [];

  function persistIfChanged() {
    const serialized = JSON.stringify(timer.serialize());
    if (serialized === lastPersisted) return false;
    writeState(userDataPath, STATE_FILE, serialized);
    lastPersisted = serialized;
    return true;
  }

  function record(action, source, result) {
    const now = clock();
    history.push({ action, source, at: now, phase: result.phase, status: result.status });
    if (history.length > 5) history.shift();
    result = { ...result, timerEvents: history.map((event) => ({ ...event })), lastNotification: { ...lastNotification } };
    try { onUpdate(result); }
    catch (error) { log(`timer.error.publish.${error?.name || 'Error'}`); }
    return result;
  }

  function processEvents(events, source, now = clock()) {
    events.forEach((event) => {
      if (event.type === 'phase-ended') {
        log(`timer.phase-ended.${event.phase.toLowerCase()}.${source}`);
      }
    });
    const notification = [...events].reverse().find((event) => event.notification);
    if (notification) {
      try {
        lastNotification = { shown: Boolean(notify(notification)), result: 'shown', phase: notification.phase, at: now };
        if (lastNotification.shown === false) lastNotification.result = 'unsupported';
      } catch (error) {
        lastNotification = { shown: false, result: 'failed', phase: notification.phase, at: now };
        log(`timer.notification.failed.${source}`);
        log(`timer.error.notification.${error?.name || 'Error'}`);
      }
    }
  }

  function execute(action, source = 'action') {
    try {
      if (!['start', 'startFocus', 'pause', 'resume', 'skip', 'stop', 'reset', 'status'].includes(action)) {
        throw new Error('Unknown timer action');
      }
      log(`timer.action.${action}.${source}`);
      const result = action === 'status'
        ? timer.status()
        : action === 'start' || action === 'startFocus' ? timer.startFocus(source)
          : action === 'reset' || action === 'stop' ? timer.stop(source)
            : timer[action](source);
      processEvents(result.events, source);
      persistIfChanged();
      return record(action, source, result);
    } catch (error) {
      log(`timer.error.${action}.${error?.name || 'Error'}`);
      return record(action, source, timer.status());
    }
  }

  function dispatch(action, source = 'action') { return execute(action, source); }

  function refresh() {
    try {
      log('timer.tick');
      const result = timer.status();
      processEvents(result.events, 'tick');
      persistIfChanged();
      const published = startupEvents.length ? { ...result, events: [...startupEvents, ...result.events] } : result;
      startupEvents = [];
      return record('tick', 'timer', published);
    } catch (error) {
      log(`timer.error.tick.${error?.name || 'Error'}`);
      return record('tick', 'timer', timer.status());
    }
  }

  function configure(nextConfigOrFocus, shortBreakMinutes) {
    try {
      log('timer.action.configure.settings');
      const next = typeof nextConfigOrFocus === 'object'
        ? normalizeConfig(nextConfigOrFocus)
        : normalizeConfig({ ...timerConfig, focusMinutes: nextConfigOrFocus, shortBreakMinutes });
      Object.assign(timerConfig, next);
      Object.assign(timer.config, next);
      return refresh();
    } catch (error) {
      log(`timer.error.configure.${error?.name || 'Error'}`);
      return timer.status();
    }
  }

  function start() {
    if (interval) return;
    refresh(); // One catch-up pass after launch.
    interval = setInterval(refresh, 1000);
  }

  function stopService() {
    clearInterval(interval);
    interval = undefined;
  }

  if (loaded.recovered) log('timer.state.recovered');
  const restored = timer.status();
  if (restored.events.length) {
    processEvents(restored.events, 'restore');
    startupEvents = restored.events;
    persistIfChanged();
  }

  return { dispatch, start, stop: stopService, refresh, configure, status: () => timer.status(), config: () => ({ ...timerConfig }) };
}

function loadState(userDataPath, log) {
  const target = path.join(userDataPath, STATE_FILE);
  try {
    return { state: JSON.parse(fs.readFileSync(target, 'utf8')), recovered: false };
  } catch (error) {
    log(error?.code === 'ENOENT' ? 'timer.state.missing' : 'timer.state.corrupt');
    return { state: undefined, recovered: true };
  }
}

function atomicWrite(directory, fileName, contents) {
  const target = path.join(directory, fileName);
  const temporary = target + '.tmp';
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(temporary, contents, 'utf8');
  fs.renameSync(temporary, target);
}
