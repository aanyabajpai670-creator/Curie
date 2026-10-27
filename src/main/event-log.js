import fs from 'node:fs';
import path from 'node:path';

const EVENT_NAMES = new Set([
  'pet.ready',
  'pet.click',
  'pet.panel.open',
  'pet.contextmenu',
  'pet.drag.start',
  'pet.drag.end',
  'pet.wander.start',
  'pet.wander.stop',
  'pet.calm.click',
  'pet.calm.menu',
  'pet.calm.shortcut',
  'pet.calm.timer-focus',
  'pet.calm.timer-focus-end',
  'pet.calm.timer',
  'pet.calm.legacy-api',
  'pet.scale.small',
  'pet.scale.medium',
  'pet.scale.large',
  'pet.state.idle',
  'pet.state.focused',
  'pet.state.alert',
  'pet.state.sleep',
  'pet.state.done',
  'anomaly.non_finite_cursor',
  'anomaly.cursor_outside_displays',
  'anomaly.position_reversal',
  'anomaly.gaze_not_delivered',
  'anomaly.gaze_watchdog',
  'anomaly.poll_error',
]);

export function createEventLogger(filePath, clock = () => new Date()) {
  if (!filePath) throw new TypeError('A log path is required');

  function log(eventName) {
    if (!EVENT_NAMES.has(eventName) && !(typeof eventName === 'string' && (/^(timer|reminder|notification|scheduler)\.[a-z0-9.,=_-]+$/.test(eventName) || /^agent\.(request|key)\.[a-z0-9.,=_\x2f-]+$/.test(eventName) || /^agent\.request\.error\.[a-z0-9_-]+\.http-400\.[A-Za-z0-9 .,;:_()'/-]{1,300}$/.test(eventName) || /^proposal\.(confirm-card|resolved)\.[a-z0-9.,=_-]+$/.test(eventName) || /^conversation\.[a-z0-9.,=_-]+$/.test(eventName) || /^ui\.[a-z0-9.,=_-]+$/.test(eventName)))) return false;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, clock().toISOString() + ' ' + eventName + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    return true;
  }

  return { log };
}

export function createAnomalyLogger(eventLogger, minimumIntervalMs = 1000, now = () => Date.now()) {
  let lastLoggedAt = -Infinity;
  return {
    log(name) {
      if (!EVENT_NAMES.has(name) || !name.startsWith('anomaly.')) return false;
      const current = now();
      if (current - lastLoggedAt < minimumIntervalMs) return false;
      lastLoggedAt = current;
      return eventLogger.log(name);
    },
  };
}
