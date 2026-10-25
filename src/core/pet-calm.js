export function createPetCalmController({ blinkMs = 160 } = {}) {
  let calm = false;
  let mode = 'ACTIVE';
  let frame = 0;
  let resting = false;
  let calmFrame;
  let targetFrame;
  let targetReached = false;
  let blinkUntil = 0;
  let source = 'startup';
  let lastChangeSource = 'startup';
  let revision = 0;
  let wandering = false;
  const changes = [];

  function note(nextMode, nextSource, now) {
    lastChangeSource = nextSource;
    changes.push({ mode: nextMode, source: nextSource, at: now });
    if (changes.length > 5) changes.shift();
  }

  function setCalm(value, nextSource = 'other', now = Date.now()) {
    const nextCalm = Boolean(value);
    if (!nextSource || !Number.isFinite(now)) throw new TypeError('A source and finite timestamp are required');
    source = nextSource;
    if (!['timer-focus', 'timer-focus-end', 'timer', 'ask-window'].includes(nextSource)) revision += 1;
    if (nextCalm === calm) {
      note(mode, nextSource, now);
      return snapshot();
    }
    calm = nextCalm;
    wandering = false;
    if (calm) {
      mode = 'CALM pending';
      targetFrame = resting && frame === 0 ? 0 : frame < 6 ? 6 : 0;
      targetReached = frame === targetFrame;
      calmFrame = undefined;
      blinkUntil = now + blinkMs;
    } else {
      mode = 'ACTIVE';
      targetFrame = undefined;
      targetReached = false;
      calmFrame = undefined;
      blinkUntil = 0;
    }
    note(mode, nextSource, now);
    return snapshot();
  }

  function updateFrame(nextFrame, nextResting, now = Date.now()) {
    if (!Number.isInteger(nextFrame) || nextFrame < 0 || nextFrame > 11) return snapshot();
    frame = nextFrame;
    resting = Boolean(nextResting);
    if (mode === 'CALM pending') {
      if (frame === targetFrame) targetReached = true;
      if (targetReached && now >= blinkUntil) {
        mode = 'CALM';
        calmFrame = targetFrame;
        targetFrame = undefined;
        note(mode, 'settled', now);
      }
    }
    return snapshot();
  }

  function advance(now = Date.now()) {
    if (mode === 'CALM pending' && targetReached && now >= blinkUntil) {
      mode = 'CALM';
      calmFrame = targetFrame;
      targetFrame = undefined;
      note(mode, 'settled', now);
    }
    return snapshot();
  }

  function setWandering(value, now = Date.now()) {
    const next = Boolean(value) && !calm;
    if (next === wandering) return snapshot();
    wandering = next;
    mode = calm ? mode : wandering ? 'WANDER' : 'ACTIVE';
    note(mode, 'wander', now);
    return snapshot();
  }

  function canWander(dragging = false) {
    return !calm && !dragging;
  }

  function snapshot() {
    return {
      calm,
      mode,
      frame,
      resting,
      calmFrame,
      targetFrame,
      targetReached,
      blinkUntil,
      source,
      lastChangeSource,
      history: changes.map((change) => ({ ...change })),
      wandering,
    };
  }

  return { setCalm, updateFrame, advance, setWandering, canWander, snapshot, getRevision: () => revision };
}

export function createPetWanderSchedule({ restMs = [600, 1600], random = Math.random } = {}) {
  if (!Array.isArray(restMs) || restMs.length !== 2 || restMs[0] < 0 || restMs[0] > restMs[1]) {
    throw new TypeError('A valid [minimum, maximum] wander delay is required');
  }
  let startsAt = 0;
  let suspended = false;
  return {
    suspend() { suspended = true; },
    resume(now) {
      const sample = Math.max(0, Math.min(1, random()));
      startsAt = now + restMs[0] + sample * (restMs[1] - restMs[0]);
      suspended = false;
      return startsAt;
    },
    isReady(now, calm, dragging) {
      return !suspended && !calm && !dragging && now >= startsAt;
    },
    startsAt: () => startsAt,
  };
}

export function createTimerFocusCalmLease({ getCalm, getRevision, setCalm, source = 'timer-focus' } = {}) {
  let snapshot;
  function begin(now) {
      if (snapshot) return;
      snapshot = { calm: getCalm(), revision: getRevision() };
      setCalm(true, source, now);
  }
  function end(now) {
      if (!snapshot) return;
      const previous = snapshot;
      snapshot = undefined;
      const desired = getRevision() === previous.revision ? previous.calm : getCalm();
      setCalm(desired, source === 'timer-focus' ? 'timer-focus-end' : source, now);
  }
  return {
    begin,
    end,
    sync(focusRunning, enabled, now) {
      if (focusRunning && enabled) begin(now);
      else end(now);
    },
    isActive: () => Boolean(snapshot),
  };
}

export function createPetStateHeartbeat(intervalMs = 250) {
  let lastSentAt = -Infinity;
  let lastState;
  return {
    due(state, now) {
      const serialized = JSON.stringify(state);
      return serialized !== lastState || now - lastSentAt >= intervalMs;
    },
    sent(state, now) {
      lastState = JSON.stringify(state);
      lastSentAt = now;
    },
  };
}
