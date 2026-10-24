import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BOUNDS = { x: 40, y: 80 };

export function readPetPosition(userDataPath) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(userDataPath, 'pet-position.json'), 'utf8'));
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) return { x: saved.x, y: saved.y };
  } catch {
    // A missing or damaged position file should not block app startup.
  }
  return DEFAULT_BOUNDS;
}

export function savePetPosition(userDataPath, bounds) {
  fs.writeFileSync(
    path.join(userDataPath, 'pet-position.json'),
    JSON.stringify({ x: bounds.x, y: bounds.y }),
    'utf8',
  );
}
