import fs from 'node:fs';
import path from 'node:path';

const EVENT_NAMES = new Set([
  'pet.ready',
  'pet.click',
  'pet.contextmenu',
  'pet.drag.start',
  'pet.drag.end',
  'pet.wander.start',
  'pet.wander.stop',
  'pet.scale.small',
  'pet.scale.medium',
  'pet.scale.large',
  'pet.state.idle',
  'pet.state.focused',
  'pet.state.alert',
  'pet.state.sleep',
  'pet.state.done',
]);

export function createEventLogger(filePath, clock = () => new Date()) {
  if (!filePath) throw new TypeError('A log path is required');

  function log(eventName) {
    if (!EVENT_NAMES.has(eventName)) return false;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, clock().toISOString() + ' ' + eventName + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    return true;
  }

  return { log };
}
