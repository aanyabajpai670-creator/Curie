import test from 'node:test';
import assert from 'node:assert/strict';
import { createHorizontalWanderController, createPetRhythmController } from '../src/core/pet-behavior.js';
import { createPetPositionController } from '../src/core/pet-position.js';
import {
  createPetCalmController,
  createPetStateHeartbeat,
  createPetWanderSchedule,
  createTimerFocusCalmLease,
} from '../src/core/pet-calm.js';

test('active wander stops at click and cannot write during 60 seconds of calm', () => {
  let position = { x: 100, y: 100 };
  const writes = [];
  const calm = createPetCalmController();
  const schedule = createPetWanderSchedule({ restMs: [600, 1600], random: () => 0.5 });
  const wander = createHorizontalWanderController({ speed: 60 });
  const positionController = createPetPositionController({
    initialPosition: position,
    size: { width: 40, height: 40 },
    workAreas: [{ x: 0, y: 0, width: 600, height: 400 }],
    clock: () => 0,
    apply: (next) => writes.push(next),
  });
  calm.setWandering(true, 0);
  let writesAtClick = -1;
  for (let now = 0; now <= 61_000; now += 30) {
    if (now === 1020) {
      calm.setCalm(true, 'click', now);
      schedule.suspend();
      wander.cancel();
      writesAtClick = writes.length;
    }
    if (!calm.canWander(false) || !schedule.isReady(now, calm.snapshot().calm, false)) continue;
    const next = wander.step(position, { width: 40, height: 40 }, { x: 0, y: 0, width: 600, height: 400 }, now, () => 1, true, false);
    if (positionController.wanderTo(next, { airborne: true, calm: calm.snapshot().calm })) {
      position = positionController.getPosition();
    }
  }
  assert.ok(writesAtClick > 0, 'wander should have moved before the click');
  assert.equal(writes.length, writesAtClick, 'no position writes should occur after the click');
  assert.equal(calm.snapshot().mode, 'CALM pending');
  assert.equal(calm.snapshot().wandering, false);
});

test('calm gates wander and never starts a hop for the full calm interval', () => {
  const calm = createPetCalmController();
  const rhythm = createPetRhythmController({ restMs: [0, 0], random: () => 0 });
  rhythm.start(0);
  calm.setCalm(true, 'menu', 0);
  for (let now = 0; now <= 60_000; now += 80) {
    const state = calm.snapshot();
    assert.equal(calm.canWander(false), false);
    assert.deepEqual(rhythm.update(now, { paused: state.calm }), {
      frame: 0, timeInCycle: 0, resting: true, airborne: false,
    });
  }
});

test('second click reactivates and delays the first wander by the configured random rest', () => {
  const calm = createPetCalmController();
  const schedule = createPetWanderSchedule({ restMs: [600, 1600], random: () => 0.5 });
  calm.setCalm(true, 'click', 100);
  schedule.suspend();
  calm.setCalm(false, 'click', 200);
  schedule.resume(200);
  assert.equal(calm.snapshot().mode, 'ACTIVE');
  assert.equal(schedule.isReady(1299, false, false), false);
  assert.equal(schedule.isReady(1300, false, false), true);
});

test('click, menu, shortcut, legacy API, and timer focus all use the main calm state', () => {
  const calm = createPetCalmController();
  for (const source of ['click', 'menu', 'shortcut', 'legacy-api']) {
    calm.setCalm(true, source, 10);
    assert.equal(calm.snapshot().calm, true, source + ' should enter calm');
    calm.setCalm(false, source, 20);
    assert.equal(calm.snapshot().calm, false, source + ' should leave calm');
  }

  const lease = createTimerFocusCalmLease({
    getCalm: () => calm.snapshot().calm,
    getRevision: () => calm.getRevision(),
    setCalm: (...args) => calm.setCalm(...args),
  });
  lease.begin(30);
  assert.equal(calm.snapshot().calm, true);
  lease.end(40);
  assert.equal(calm.snapshot().calm, false);
  assert.ok(calm.snapshot().history.some((change) => change.source === 'timer-focus'));
  assert.ok(calm.snapshot().history.some((change) => change.source === 'timer-focus-end'));
});

test('timer focus end preserves a manual change made during the focus phase', () => {
  const calm = createPetCalmController();
  const lease = createTimerFocusCalmLease({
    getCalm: () => calm.snapshot().calm,
    getRevision: () => calm.getRevision(),
    setCalm: (...args) => calm.setCalm(...args),
  });
  lease.begin(0);
  calm.setCalm(false, 'click', 50);
  lease.end(100);
  assert.equal(calm.snapshot().calm, false);
  assert.equal(calm.snapshot().source, 'timer-focus-end');
});

test('timer source restores the previous mode when enabled and does not override a manual toggle', () => {
  const calm = createPetCalmController();
  const lease = createTimerFocusCalmLease({
    getCalm: () => calm.snapshot().calm,
    getRevision: () => calm.getRevision(),
    setCalm: (...args) => calm.setCalm(...args),
    source: 'timer',
  });
  lease.begin(0);
  assert.equal(calm.snapshot().calm, true);
  lease.end(1);
  assert.equal(calm.snapshot().calm, false);
  assert.equal(calm.snapshot().source, 'timer');
  lease.begin(2);
  calm.setCalm(false, 'click', 3);
  lease.end(4);
  assert.equal(calm.snapshot().calm, false);
  assert.equal(calm.snapshot().source, 'timer');
});

test('calm-during-focus setting off skips calm; enabling it restores the prior mode at focus end', () => {
  const calm = createPetCalmController();
  const lease = createTimerFocusCalmLease({
    getCalm: () => calm.snapshot().calm,
    getRevision: () => calm.getRevision(),
    setCalm: (...args) => calm.setCalm(...args),
    source: 'timer',
  });
  lease.sync(true, false, 0);
  assert.equal(calm.snapshot().calm, false);
  lease.sync(true, true, 10);
  assert.equal(calm.snapshot().calm, true);
  lease.sync(false, true, 20);
  assert.equal(calm.snapshot().calm, false);
});

test('CALM pending settles at the next neutral frame after its blink', () => {
  const calm = createPetCalmController({ blinkMs: 160 });
  calm.updateFrame(7, false, 0);
  calm.setCalm(true, 'click', 0);
  calm.updateFrame(0, false, 80);
  assert.equal(calm.snapshot().mode, 'CALM pending');
  calm.advance(159);
  assert.equal(calm.snapshot().mode, 'CALM pending');
  calm.advance(160);
  assert.equal(calm.snapshot().mode, 'CALM');
  assert.equal(calm.snapshot().source, 'click');
  assert.equal(calm.snapshot().lastChangeSource, 'settled');
});

test('a click during the frame-zero rest can finish its blink without waiting for another frame event', () => {
  const calm = createPetCalmController({ blinkMs: 160 });
  calm.updateFrame(0, true, 0);
  calm.setCalm(true, 'click', 0);
  assert.equal(calm.snapshot().targetReached, true);
  calm.advance(160);
  assert.equal(calm.snapshot().mode, 'CALM');
  assert.equal(calm.snapshot().calmFrame, 0);
});

test('a dropped calm-state message is repaired by a heartbeat within 250 ms', () => {
  const heartbeat = createPetStateHeartbeat(250);
  const main = { calm: true, mode: 'CALM pending', source: 'click' };
  let renderer;
  if (heartbeat.due(main, 0)) heartbeat.sent(main, 0); // dropped
  if (heartbeat.due(main, 249)) renderer = main;
  assert.equal(renderer, undefined);
  if (heartbeat.due(main, 250)) {
    renderer = main;
    heartbeat.sent(main, 250);
  }
  assert.deepEqual(renderer, main);
});
