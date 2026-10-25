export const PET_FRAME_COUNT = 12;
export const PET_FRAME_MS = 80;
export const PET_USER_SCALES = Object.freeze([6, 10, 14]);
export const PET_FRAME_SIZE = 16;
export const PET_LIFT_MAX = 5;
export const DEFAULT_LIFT_PER_FRAME = Object.freeze([0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 4, 2]);
export const DEFAULT_REST_MS = Object.freeze([600, 1600]);

export function petWindowSize(userScale, liftMax = PET_LIFT_MAX) {
  if (!PET_USER_SCALES.includes(userScale) || !Number.isInteger(liftMax) || liftMax < 0) {
    throw new TypeError('A supported user scale and nonnegative integer lift are required');
  }
  return { width: PET_FRAME_SIZE * userScale, height: (PET_FRAME_SIZE + liftMax) * userScale };
}

export function validateBehaviorConfig(config) {
  if (
    !config ||
    config.frameSize !== PET_FRAME_SIZE ||
    config.frameCount !== PET_FRAME_COUNT ||
    config.frameMs !== PET_FRAME_MS ||
    !Number.isInteger(config.liftMax) ||
    config.liftMax < 0 ||
    !Array.isArray(config.liftPerFrame) ||
    config.liftPerFrame.length !== PET_FRAME_COUNT ||
    !config.liftPerFrame.every((value) => Number.isFinite(value) && value >= 0 && value <= config.liftMax) ||
    !Array.isArray(config.restMs) ||
    config.restMs.length !== 2 ||
    !config.restMs.every((value) => Number.isFinite(value) && value >= 0) ||
    config.restMs[0] > config.restMs[1]
  ) {
    throw new TypeError('Pet behavior settings have invalid frame, lift, or rest values');
  }
  return config;
}

export function lift(timeInCycle, liftPerFrame = DEFAULT_LIFT_PER_FRAME, frameMs = PET_FRAME_MS) {
  if (!Number.isFinite(timeInCycle) || !Number.isFinite(frameMs) || frameMs <= 0 ||
      !Array.isArray(liftPerFrame) || liftPerFrame.length !== PET_FRAME_COUNT ||
      !liftPerFrame.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new TypeError('A finite cycle time, frame duration, and nonnegative lift profile are required');
  }
  const cycleDuration = frameMs * PET_FRAME_COUNT;
  const wrapped = modulo(timeInCycle, cycleDuration);
  const index = Math.floor(wrapped / frameMs);
  const amount = (wrapped - index * frameMs) / frameMs;
  const eased = amount * amount * (3 - 2 * amount);
  const from = liftPerFrame[index];
  const to = liftPerFrame[(index + 1) % PET_FRAME_COUNT];
  return from + (to - from) * eased;
}

export function pixelScaleFor(userScale, devicePixelRatio = 1) {
  if (!PET_USER_SCALES.includes(userScale) || !Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    throw new TypeError('A supported user scale and positive device pixel ratio are required');
  }
  return Math.max(1, Math.round(userScale * devicePixelRatio));
}

export function frameSourceRect(frame) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= PET_FRAME_COUNT) {
    throw new RangeError('Sprite frame is outside the 12-frame sheet');
  }
  return { x: frame * PET_FRAME_SIZE, y: 0, width: PET_FRAME_SIZE, height: PET_FRAME_SIZE };
}

export function frameAt(timeMs, frameMs = PET_FRAME_MS, frameCount = PET_FRAME_COUNT) {
  if (!Number.isFinite(timeMs) || !Number.isFinite(frameMs) || frameMs <= 0) {
    throw new TypeError('A finite time and positive frame duration are required');
  }
  return modulo(Math.floor(timeMs / frameMs), frameCount);
}

export function createPetModeController({ blinkMs = PET_FRAME_MS * 2 } = {}) {
  let mode = 'ACTIVE';
  let wandering = false;
  let calmTargetFrame;
  let calmTargetReached = false;
  let calmFrame;
  let blinkUntil = 0;

  function dispatch(event, currentFrame, now = 0, resting = false) {
    if (event?.type !== 'pet.click') return mode;
    if (mode === 'CALM' || mode === 'CALM pending') {
      mode = 'ACTIVE';
      wandering = false;
      calmTargetFrame = undefined;
      calmTargetReached = false;
      calmFrame = undefined;
      blinkUntil = 0;
      return mode;
    }
    wandering = false;
    mode = 'CALM pending';
    calmTargetFrame = resting && currentFrame === 0 ? 0 : currentFrame < 6 ? 6 : 0;
    calmTargetReached = false;
    blinkUntil = now + blinkMs;
    return mode;
  }

  function advance(currentFrame, now) {
    if (mode === 'CALM pending') {
      if (currentFrame === calmTargetFrame) calmTargetReached = true;
      if (calmTargetReached && now >= blinkUntil) {
        mode = 'CALM';
        calmFrame = calmTargetFrame;
        calmTargetFrame = undefined;
      }
    }
    return mode;
  }

  function isBlinking(now) {
    return mode === 'CALM pending' && now < blinkUntil;
  }

  function setWandering(value) {
    wandering = Boolean(value);
  }

  function getMode() {
    return mode === 'ACTIVE' && wandering ? 'WANDER' : mode;
  }

  function getSettlingFrame() {
    return mode === 'CALM pending' && calmTargetReached ? calmTargetFrame : undefined;
  }

  return { dispatch, advance, isBlinking, setWandering, getMode, getCalmFrame: () => calmFrame, getSettlingFrame };
}

export function createPetRhythmController({ restMs = DEFAULT_REST_MS, random = Math.random } = {}) {
  if (!Array.isArray(restMs) || restMs.length !== 2 || restMs[0] < 0 || restMs[0] > restMs[1]) {
    throw new TypeError('A valid [minimum, maximum] rest interval is required');
  }
  const cycleDuration = PET_FRAME_COUNT * PET_FRAME_MS;
  let hopStart;
  let restUntil;
  let blinkUntil = 0;
  let nextBlinkAt;

  function start(now) {
    if (!Number.isFinite(now)) throw new TypeError('A finite start time is required');
    hopStart = now;
    restUntil = undefined;
    nextBlinkAt = undefined;
    blinkUntil = 0;
  }

  function sampleRest() {
    return restMs[0] + Math.max(0, Math.min(1, random())) * (restMs[1] - restMs[0]);
  }

  function beginRest(at) {
    const duration = sampleRest();
    restUntil = at + duration;
    nextBlinkAt = at + Math.min(300, duration / 3);
    return duration;
  }

  function updateRestBlink(now) {
    if (nextBlinkAt === undefined) return;
    if (now >= nextBlinkAt) {
      blinkUntil = now + 120;
      nextBlinkAt = now + 1800 + Math.max(0, Math.min(1, random())) * 1800;
    }
  }

  function update(now, { continuous = false, paused = false } = {}) {
    if (!Number.isFinite(now)) throw new TypeError('A finite update time is required');
    if (hopStart === undefined) start(now);
    if (paused) {
      return { frame: 0, timeInCycle: 0, resting: true, airborne: false };
    }
    if (restUntil !== undefined) {
      if (continuous) {
        hopStart = now;
        restUntil = undefined;
        nextBlinkAt = undefined;
      } else if (now < restUntil) {
        updateRestBlink(now);
        return { frame: 0, timeInCycle: 0, resting: true, airborne: false };
      } else {
        hopStart = restUntil;
        restUntil = undefined;
        nextBlinkAt = undefined;
      }
    }
    while (now - hopStart >= cycleDuration) {
      const hopEnd = hopStart + cycleDuration;
      if (continuous) {
        hopStart = hopEnd;
      } else {
        const duration = beginRest(hopEnd);
        if (now < hopEnd + duration) {
          updateRestBlink(now);
          return { frame: 0, timeInCycle: 0, resting: true, airborne: false };
        }
        hopStart = hopEnd + duration;
        restUntil = undefined;
        nextBlinkAt = undefined;
      }
    }
    const timeInCycle = now - hopStart;
    const frame = frameAt(timeInCycle);
    return { frame, timeInCycle, resting: false, airborne: frame >= 5 && frame <= 11 };
  }

  return { start, update, isBlinking: (now) => restUntil !== undefined && now < blinkUntil };
}

export function petStateFor({ pendingReminders = 0, timerStatus = 'idle', phase = 'work' } = {}) {
  if (pendingReminders > 0) return 'alert';
  if (timerStatus === 'done') return 'done';
  if (timerStatus === 'running' && (phase === 'work' || phase === 'FOCUS')) return 'focused';
  if (timerStatus === 'running' && ['break', 'SHORT_BREAK', 'LONG_BREAK'].includes(phase)) return 'sleep';
  return 'idle';
}

export function gazeOffset(cursor, bounds) {
  if (!cursor || !bounds) return { dx: 0, dy: 0 };
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height * 0.46;
  const horizontalThreshold = bounds.width * 0.12;
  return {
    dx: cursor.x < centerX - horizontalThreshold ? -1 : cursor.x > centerX + horizontalThreshold ? 1 : 0,
    dy: cursor.y < centerY - bounds.height * 0.08 ? -1 : cursor.y > centerY + bounds.height * 0.08 ? 1 : 0,
  };
}

export function eyeCells({ columns, topY, colors, dx = 0, dy = 0 }) {
  const horizontal = clampInteger(dx, -1, 1);
  const vertical = clampInteger(dy, -1, 1);
  if (!Array.isArray(columns) || !Array.isArray(colors) || colors.length !== 3) {
    throw new TypeError('Eye columns and three cell colors are required');
  }
  return columns.flatMap((x) => {
    if (vertical === 1) {
      return colors.slice(1).map((color, index) => ({ x: x + horizontal, y: topY + index + 1, color }));
    }
    return colors.map((color, index) => ({ x: x + horizontal, y: topY + vertical + index, color }));
  });
}

export function validateEyeConfig(config) {
  if (
    !config ||
    config.frameSize !== PET_FRAME_SIZE ||
    config.frameCount !== PET_FRAME_COUNT ||
    config.frameMs !== PET_FRAME_MS ||
    config.neutralFrame !== 0
  ) {
    throw new TypeError('Eye settings must use the documented 80ms cycle and neutral frame 0');
  }
  if (
    !Array.isArray(config.eyeColumns) ||
    config.eyeColumns.length !== 2 ||
    config.eyeColumns[0] !== 5 ||
    config.eyeColumns[1] !== 10 ||
    !Array.isArray(config.eyeCellColors) ||
    config.eyeCellColors.length !== 3 ||
    !config.eyeCellColors.every((color) =>
      Array.isArray(color) && color.length === 3 && color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255),
    ) ||
    !Array.isArray(config.frames) ||
    config.frames.length !== PET_FRAME_COUNT ||
    !config.frames.every((frame, index) => frame?.frame === index)
  ) {
    throw new TypeError('Eye color or column data is invalid');
  }
  const normalized = {
    ...config,
    eyeCellColors: config.eyeCellColors.map((color) => 'rgb(' + color.join(' ') + ')'),
    eyeTopY: config.frames.map((frame) => frame.eyeTopY),
    bodyTopY: config.frames.map((frame) => frame.bodyTopY),
    bodyBottomY: config.frames.map((frame) => frame.bodyBottomY),
    bodyHeight: config.frames.map((frame) => frame.bodyHeight),
  };
  const bottoms = new Set(normalized.bodyBottomY);
  if (bottoms.size !== 1) throw new TypeError('The slime body must land on the same row in every frame');
  for (let frame = 0; frame < PET_FRAME_COUNT; frame += 1) {
    if (
      !Number.isInteger(normalized.eyeTopY[frame]) ||
      !Number.isInteger(normalized.bodyTopY[frame]) ||
      !Number.isInteger(normalized.bodyBottomY[frame]) ||
      normalized.bodyHeight[frame] !== normalized.bodyBottomY[frame] - normalized.bodyTopY[frame] + 1 ||
      normalized.eyeTopY[frame] < normalized.bodyTopY[frame] ||
      normalized.eyeTopY[frame] + normalized.eyeCellColors.length - 1 > normalized.bodyBottomY[frame]
    ) {
      throw new TypeError('Body and eye geometry is invalid at frame ' + frame);
    }
  }
  if (normalized.bodyHeight[0] !== 12 || normalized.bodyHeight[6] !== 12 || normalized.eyeTopY[0] !== normalized.eyeTopY[6]) {
    throw new TypeError('Frames 0 and 6 must share the 12-pixel neutral pose');
  }
  if (
    ![1, 2, 3].every((frame) => normalized.bodyHeight[frame] < 12) ||
    ![7, 8, 9].every((frame) => normalized.bodyHeight[frame] > 12)
  ) {
    throw new TypeError('Frames 1-3 must squash and frames 7-9 must stretch');
  }
  return normalized;
}

export function clampPosition(position, size, area) {
  return {
    x: clamp(position.x, area.x, area.x + area.width - size.width),
    y: clamp(position.y, area.y, area.y + area.height - size.height),
  };
}

export function createPetInteraction({ clickDistance = 5 } = {}) {
  let pointerStart;
  let pointerLast;
  let dragged = false;
  let lastEvent = 'ready';

  function pointerDown(point) {
    pointerStart = { ...point };
    pointerLast = { ...point };
    dragged = false;
    lastEvent = 'pointer.down';
    return { type: 'pointer.down' };
  }

  function pointerMove(point) {
    if (!pointerStart) return { type: 'pointer.move', dx: 0, dy: 0, dragging: false };
    const dx = point.x - pointerLast.x;
    const dy = point.y - pointerLast.y;
    pointerLast = { ...point };
    if (Math.hypot(point.x - pointerStart.x, point.y - pointerStart.y) >= clickDistance) {
      dragged = true;
    }
    if (dragged) lastEvent = 'drag.move';
    return { type: dragged ? 'drag.move' : 'pointer.move', dx, dy, dragging: dragged };
  }

  function pointerUp(point) {
    if (!pointerStart) return { type: 'pointer.up', clicked: false };
    const moved = Math.hypot(point.x - pointerStart.x, point.y - pointerStart.y);
    const clicked = !dragged && moved < clickDistance;
    lastEvent = clicked ? 'pet.click' : 'drag.end';
    pointerStart = undefined;
    pointerLast = undefined;
    dragged = false;
    return { type: lastEvent, clicked };
  }

  function contextMenu() {
    lastEvent = 'pet.contextmenu';
    return { type: lastEvent };
  }

  function pointerCancel() {
    const wasDragging = dragged;
    pointerStart = undefined;
    pointerLast = undefined;
    dragged = false;
    lastEvent = wasDragging ? 'drag.end' : 'pointer.cancel';
    return { type: lastEvent, dragged: wasDragging };
  }

  function getLastEvent() {
    return lastEvent;
  }

  return { pointerDown, pointerMove, pointerUp, pointerCancel, contextMenu, getLastEvent };
}

export function createWanderController({ speed = 24, pauseMs = 1800 } = {}) {
  let target;
  let lastStepAt;
  let nextMoveAt = 0;

  function step(position, size, area, now, random = Math.random, paused = false) {
    const bounded = clampPosition(position, size, area);
    if (paused) {
      target = undefined;
      lastStepAt = now;
      nextMoveAt = now + pauseMs;
      return bounded;
    }
    if (!target && now >= nextMoveAt) {
      const maxX = Math.max(area.x, area.x + area.width - size.width);
      const maxY = Math.max(area.y, area.y + area.height - size.height);
      target = {
        x: area.x + random() * (maxX - area.x),
        y: area.y + random() * (maxY - area.y),
      };
      lastStepAt = now;
    }
    if (!target) return bounded;
    const elapsed = Math.max(0, now - lastStepAt) / 1000;
    lastStepAt = now;
    const dx = target.x - bounded.x;
    const dy = target.y - bounded.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) {
      target = undefined;
      nextMoveAt = now + pauseMs;
      return bounded;
    }
    const travel = Math.min(distance, speed * elapsed);
    const moved = clampPosition({
      x: bounded.x + (dx / distance) * travel,
      y: bounded.y + (dy / distance) * travel,
    }, size, area);
    if (travel === distance) {
      target = undefined;
      nextMoveAt = now + pauseMs;
    }
    return moved;
  }

  return { step };
}

export function createHorizontalWanderController({ speed = 22, roamInset = 0.2 } = {}) {
  let targetX;
  let targetY;
  let startX;
  let travelMs;
  let elapsedMs = 0;
  let lastStepAt;

  function step(position, size, area, now, random = Math.random, airborne = false, paused = false) {
    const bounded = clampPosition(position, size, area);
    if (paused) {
      targetX = undefined;
      targetY = undefined;
      startX = undefined;
      elapsedMs = 0;
      lastStepAt = now;
      return bounded;
    }
    if (!airborne) {
      lastStepAt = now;
      return bounded;
    }
    if (targetX === undefined) {
      const minX = area.x + area.width * Math.max(0, Math.min(0.45, roamInset));
      const maxX = Math.max(minX, area.x + area.width * (1 - Math.max(0, Math.min(0.45, roamInset))) - size.width);
      targetX = minX + Math.max(0, Math.min(1, random())) * (maxX - minX);
      targetY = bounded.y;
      startX = bounded.x;
      travelMs = Math.max(800, Math.min(3000, (Math.abs(targetX - startX) / Math.max(1, speed)) * 1000));
      elapsedMs = 0;
      lastStepAt = now;
    }
    elapsedMs += Math.max(0, now - lastStepAt);
    lastStepAt = now;
    const dx = targetX - bounded.x;
    if (Math.abs(dx) < 1) {
      targetX = undefined;
      targetY = undefined;
      startX = undefined;
      return bounded;
    }
    const progress = Math.min(1, elapsedMs / travelMs);
    const eased = progress * progress * (3 - 2 * progress);
    const moved = clampPosition({
      x: startX + (targetX - startX) * eased,
      y: bounded.y,
    }, size, area);
    if (progress >= 1 || Math.abs(targetX - moved.x) < 1) {
      targetX = undefined;
      targetY = undefined;
      startX = undefined;
    }
    return moved;
  }

  return {
    step,
    isWandering: () => targetX !== undefined,
    getTarget: () => targetX === undefined ? undefined : { x: Math.round(targetX), y: Math.round(targetY) },
    cancel: () => { targetX = undefined; targetY = undefined; startX = undefined; elapsedMs = 0; },
  };
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(clamp(value, min, max));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
