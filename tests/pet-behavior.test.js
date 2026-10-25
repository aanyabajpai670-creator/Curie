import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPosition,
  createPetInteraction,
  createWanderController,
  eyeCells,
  frameAt,
  frameSourceRect,
  gazeOffset,
  PET_FRAME_COUNT,
  PET_FRAME_SIZE,
  PET_FRAME_MS,
  petStateFor,
  pixelScaleFor,
  validateEyeConfig,
} from '../src/core/pet-behavior.js';

test('the squash-and-stretch cycle advances every 80ms and loops at frame 12', () => {
  assert.equal(PET_FRAME_COUNT, 12);
  assert.equal(PET_FRAME_MS, 80);
  assert.equal(frameAt(0), 0);
  assert.equal(frameAt(79), 0);
  assert.equal(frameAt(80), 1);
  assert.equal(frameAt(959), 11);
  assert.equal(frameAt(960), 0);
});

test('sprite source rectangles select one exact 16px frame and canvas scale stays integral', () => {
  assert.deepEqual(frameSourceRect(11), { x: 176, y: 0, width: 16, height: 16 });
  assert.equal(PET_FRAME_SIZE, 16);
  assert.equal(pixelScaleFor(10, 2), 20);
  assert.equal(pixelScaleFor(6, 1.5), 9);
  assert.equal(pixelScaleFor(14, 0.5), 7);
  assert.throws(() => frameSourceRect(PET_FRAME_COUNT), RangeError);
  assert.throws(() => pixelScaleFor(7, 2), TypeError);
});

test('pet mood follows reminder priority and timer phase', () => {
  assert.equal(petStateFor({ timerStatus: 'running', phase: 'work' }), 'focused');
  assert.equal(petStateFor({ timerStatus: 'running', phase: 'break' }), 'sleep');
  assert.equal(petStateFor({ timerStatus: 'done' }), 'done');
  assert.equal(petStateFor({ pendingReminders: 1, timerStatus: 'running' }), 'alert');
  assert.equal(petStateFor(), 'idle');
});

test('gaze follows the cursor and never moves down', () => {
  const bounds = { x: 0, y: 0, width: 160, height: 160 };
  assert.deepEqual(gazeOffset({ x: 0, y: 0 }, bounds), { dx: -1, dy: -1 });
  assert.deepEqual(gazeOffset({ x: 160, y: 160 }, bounds), { dx: 1, dy: 0 });
  assert.deepEqual(gazeOffset({ x: 80, y: 80 }, bounds), { dx: 0, dy: 0 });
});

test('eye cells use sprite-pixel gaze offsets constrained to left, center, or up', () => {
  const cells = eyeCells({
    columns: [5, 10],
    topY: 4,
    colors: ['top', 'middle', 'bottom'],
    dx: 99,
    dy: 99,
  });
  assert.deepEqual(cells.slice(0, 3), [
    { x: 6, y: 4, color: 'top' },
    { x: 6, y: 5, color: 'middle' },
    { x: 6, y: 6, color: 'bottom' },
  ]);
  assert.equal(cells[3].x, 11);
  const upward = eyeCells({ columns: [5], topY: 4, colors: [1, 2, 3], dy: -1 });
  assert.deepEqual(upward.map((cell) => cell.y), [3, 4, 5]);
});

test('eye config validates common ground row and neutral frame geometry', () => {
  const config = {
    frameSize: 16,
    frameCount: 12,
    frameMs: 80,
    neutralFrame: 0,
    eyeColumns: [5, 10],
    eyeCellColors: [[59, 42, 63], [38, 24, 44], [66, 46, 72]],
    frames: [
      [6, 2, 13, 12], [7, 3, 13, 11], [7, 3, 13, 11], [8, 3, 13, 11],
      [8, 2, 13, 12], [7, 2, 13, 12], [6, 2, 13, 12], [5, 1, 13, 13],
      [5, 1, 13, 13], [4, 1, 13, 13], [4, 2, 13, 12], [5, 2, 13, 12],
    ].map(([eyeTopY, bodyTopY, bodyBottomY, bodyHeight], frame) => ({
      frame, eyeTopY, bodyTopY, bodyBottomY, bodyHeight,
    })),
  };
  const normalized = validateEyeConfig(config);
  assert.equal(normalized.eyeCellColors[0], 'rgb(59 42 63)');
  assert.deepEqual(normalized.bodyBottomY, Array(12).fill(13));
  assert.throws(() => validateEyeConfig({
    ...config,
    frames: [...config.frames.slice(0, 11), { ...config.frames[11], bodyBottomY: 12, bodyHeight: 11 }],
  }), /same row/);
  assert.throws(() => validateEyeConfig({ ...config, eyeColumns: [4, 10] }), /Eye color or column/);
  assert.throws(() => validateEyeConfig({
    ...config,
    frames: [...config.frames.slice(0, 2), { ...config.frames[2], bodyTopY: 2, bodyHeight: 12 }, ...config.frames.slice(3)],
  }), /squash/);
});

test('interaction distinguishes clicks, drags, and right-clicks', () => {
  const interaction = createPetInteraction();
  interaction.pointerDown({ x: 10, y: 10 });
  assert.deepEqual(interaction.pointerUp({ x: 12, y: 12 }), { type: 'pet.click', clicked: true });
  interaction.pointerDown({ x: 10, y: 10 });
  assert.deepEqual(interaction.pointerMove({ x: 30, y: 10 }), {
    type: 'drag.move', dx: 20, dy: 0, dragging: true,
  });
  assert.deepEqual(interaction.pointerUp({ x: 30, y: 10 }), { type: 'drag.end', clicked: false });
  assert.deepEqual(interaction.contextMenu(), { type: 'pet.contextmenu' });
  assert.equal(interaction.getLastEvent(), 'pet.contextmenu');
  interaction.pointerDown({ x: 10, y: 10 });
  interaction.pointerMove({ x: 20, y: 10 });
  assert.deepEqual(interaction.pointerCancel(), { type: 'drag.end', dragged: true });
  assert.deepEqual(interaction.pointerMove({ x: 30, y: 10 }), { type: 'pointer.move', dx: 0, dy: 0, dragging: false });
});

test('pet stays within the screen and wandering pauses while dragged', () => {
  const area = { x: 10, y: 20, width: 100, height: 80 };
  const size = { width: 40, height: 40 };
  assert.deepEqual(clampPosition({ x: 99, y: -3 }, size, area), { x: 70, y: 20 });
  const wander = createWanderController({ speed: 100, pauseMs: 500 });
  const randomValues = [1, 1];
  const random = () => randomValues.shift() ?? 1;
  const start = { x: 10, y: 20 };
  const first = wander.step(start, size, area, 1000, random);
  assert.deepEqual(first, start);
  const moved = wander.step(first, size, area, 1500, random);
  assert.ok(moved.x <= 70 && moved.y <= 60);
  assert.ok(moved.x > first.x && moved.y > first.y);
  assert.deepEqual(wander.step(moved, size, area, 1600, random, true), moved);
  assert.deepEqual(wander.step(moved, size, area, 2099, random), moved);
  assert.deepEqual(wander.step(moved, size, area, 2100, random), moved);
  const resumed = wander.step(moved, size, area, 2600, random);
  assert.ok(resumed.x > moved.x && resumed.y > moved.y);
});
