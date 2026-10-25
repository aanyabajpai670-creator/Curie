import test from 'node:test';
import assert from 'node:assert/strict';
import { clampToWorkAreas, createPetPositionController } from '../src/core/pet-position.js';

const areas = [
  { x: 0, y: 0, width: 500, height: 400 },
  { x: 500, y: -100, width: 500, height: 600 },
];
const size = { width: 100, height: 100 };

function makeController(options = {}) {
  const writes = [];
  const persisted = [];
  let now = 10;
  const controller = createPetPositionController({
    initialPosition: { x: 100, y: 100 },
    size,
    workAreas: areas,
    clock: () => now,
    apply: (position, source) => writes.push({ position, source }),
    persist: (position) => persisted.push(position),
    ...options,
  });
  return { controller, writes, persisted, advance: (ms) => { now += ms; } };
}

test('drag uses mousedown and current screen cursor positions and persists only at drag end', () => {
  const { controller, writes, persisted } = makeController();
  controller.beginDrag({ x: 300, y: 200 });
  controller.dragTo({ x: 340, y: 225 });
  assert.deepEqual(controller.getPosition(), { x: 140, y: 125 });
  assert.equal(writes.at(-1).source, 'drag');
  assert.equal(persisted.length, 0);
  controller.endDrag();
  assert.deepEqual(persisted, [{ x: 140, y: 125 }]);
});

test('drag may leave the central wander target strip and clamps only to display work areas', () => {
  const { controller } = makeController();
  controller.beginDrag({ x: 400, y: 200 });
  controller.dragTo({ x: 650, y: 200 });
  assert.deepEqual(controller.getPosition(), { x: 350, y: 100 });
});

test('wander and restore cannot write while dragging', () => {
  const { controller, writes } = makeController();
  const token = controller.getRevision();
  controller.beginDrag({ x: 300, y: 200 });
  const count = writes.length;
  assert.equal(controller.wanderTo({ x: 160, y: 110 }, { airborne: true }), false);
  assert.equal(controller.restore({ x: 200, y: 100 }, token), false);
  assert.equal(writes.length, count);
});

test('a restore started before a drag cannot override that newer drag', () => {
  const { controller } = makeController();
  const staleRestore = controller.getRevision();
  controller.beginDrag({ x: 300, y: 200 });
  controller.dragTo({ x: 350, y: 220 });
  controller.endDrag();
  assert.equal(controller.restore({ x: 20, y: 20 }, staleRestore), false);
  assert.deepEqual(controller.getPosition(), { x: 150, y: 120 });
});

test('all written coordinates are integers and the injected clock is recorded', () => {
  const { controller, writes, advance } = makeController();
  advance(7);
  controller.beginDrag({ x: 100, y: 100 });
  controller.dragTo({ x: 110.4, y: 110.7 });
  assert.deepEqual(writes.at(-1), { position: { x: 110, y: 111 }, source: 'drag' });
  assert.equal(controller.getLastWriteAt(), 17);
});

test('clamping chooses the nearest display work area including negative origins', () => {
  assert.deepEqual(clampToWorkAreas({ x: -900, y: 900 }, size, areas), { x: 0, y: 300 });
  assert.deepEqual(clampToWorkAreas({ x: 850, y: 0 }, size, areas), { x: 850, y: 0 });
});

test('calm, ground frames, and drag suspend wander position writes', () => {
  const { controller, writes } = makeController();
  assert.equal(controller.wanderTo({ x: 130, y: 100 }, { airborne: false }), false);
  assert.equal(controller.wanderTo({ x: 130, y: 100 }, { airborne: true, calm: true }), false);
  assert.equal(writes.length, 0);
});
