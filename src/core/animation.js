export function getAnimationState(states, name) {
  const state = states[name];
  if (!state || !Array.isArray(state.frames) || state.frames.length === 0) {
    throw new Error('Unknown or empty animation state: ' + name);
  }
  if (!Number.isFinite(state.fps) || state.fps <= 0) {
    throw new Error('Animation state ' + name + ' needs a positive fps');
  }
  return state;
}

export function nextFrameIndex(state, currentIndex) {
  if (currentIndex < state.frames.length - 1) return currentIndex + 1;
  return state.loop ? 0 : currentIndex;
}
