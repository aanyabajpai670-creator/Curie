import test from 'node:test';
import assert from 'node:assert/strict';
import { getAnimationState, nextFrameIndex } from '../src/core/animation.js';

const states = {
  idle: { frames: [0, 1, 2], fps: 3, loop: true },
  focused: { frames: [5], fps: 1, loop: false },
};

test('animation state validation rejects missing or invalid states', () => {
  assert.throws(() => getAnimationState(states, 'missing'), /Unknown/);
  assert.throws(() => getAnimationState({ bad: { frames: [], fps: 1 } }, 'bad'), /empty/);
});

test('animation advances, loops, and holds for a still state', () => {
  assert.equal(nextFrameIndex(states.idle, 1), 2);
  assert.equal(nextFrameIndex(states.idle, 2), 0);
  assert.equal(nextFrameIndex(states.focused, 0), 0);
});
