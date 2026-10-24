const DEFAULT_WORK_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;

export class StudyTimer {
  constructor({
    clock = Date.now,
    workMinutes = DEFAULT_WORK_MINUTES,
    breakMinutes = DEFAULT_BREAK_MINUTES,
    initialState,
  } = {}) {
    this.clock = clock;
    this.workMs = positiveMinutes(workMinutes, 'workMinutes') * 60_000;
    this.breakMs = positiveMinutes(breakMinutes, 'breakMinutes') * 60_000;
    this.state = normalizeState(initialState, this.workMs);
  }

  start() {
    const events = this.tick();
    if (this.state.status === 'idle' || this.state.status === 'done') {
      this.state.phase = 'work';
      this.state.status = 'running';
      this.state.remainingMs = this.workMs;
      this.state.endsAt = this.clock() + this.workMs;
    }
    return this.result(events);
  }

  pause() {
    const events = this.tick();
    if (this.state.status === 'running') {
      this.state.remainingMs = Math.max(0, this.state.endsAt - this.clock());
      this.state.endsAt = null;
      this.state.status = 'paused';
    }
    return this.result(events);
  }

  resume() {
    const events = this.tick();
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.state.endsAt = this.clock() + this.state.remainingMs;
    }
    return this.result(events);
  }

  reset() {
    this.state = freshState(this.workMs);
    return this.result([]);
  }

  skip() {
    const events = this.tick();
    if (this.state.status === 'running' || this.state.status === 'paused') {
      events.push(this.endPhase(this.clock()));
      if (events.at(-1).phase === 'break') this.state.status = 'done';
    }
    return this.result(events);
  }

  tick() {
    const events = [];
    while (this.state.status === 'running' && this.clock() >= this.state.endsAt) {
      const endedAt = this.state.endsAt;
      events.push(this.endPhase(endedAt));
      if (events.at(-1).phase === 'break') {
        this.state.status = 'done';
        this.state.endsAt = null;
        this.state.remainingMs = this.workMs;
      }
    }
    return events;
  }

  status() {
    const events = this.tick();
    const remainingMs = this.state.status === 'running'
      ? Math.max(0, this.state.endsAt - this.clock())
      : this.state.remainingMs;
    return {
      ...this.state,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      events,
    };
  }

  serialize() {
    return { ...this.state };
  }

  result(events) {
    const snapshot = this.status();
    return { ...snapshot, events: [...events, ...snapshot.events] };
  }

  endPhase(endedAt) {
    const phase = this.state.phase;
    if (phase === 'work') {
      this.state.completedSessions += 1;
      this.state.phase = 'break';
      this.state.status = 'running';
      this.state.remainingMs = this.breakMs;
      this.state.endsAt = endedAt + this.breakMs;
    } else {
      this.state.phase = 'work';
      this.state.remainingMs = this.workMs;
      this.state.endsAt = null;
    }
    return { type: 'phase-ended', phase, endedAt };
  }
}

function positiveMinutes(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(name + ' must be positive');
  return value;
}

function freshState(workMs) {
  return {
    status: 'idle',
    phase: 'work',
    endsAt: null,
    remainingMs: workMs,
    completedSessions: 0,
  };
}

function normalizeState(state, workMs) {
  if (!state) return freshState(workMs);
  const allowedStatus = ['idle', 'running', 'paused', 'done'];
  const allowedPhase = ['work', 'break'];
  if (
    !allowedStatus.includes(state.status) ||
    !allowedPhase.includes(state.phase) ||
    !Number.isFinite(state.remainingMs) ||
    state.remainingMs < 0 ||
    !Number.isInteger(state.completedSessions) ||
    state.completedSessions < 0 ||
    (state.status === 'running' && !Number.isFinite(state.endsAt))
  ) {
    return freshState(workMs);
  }
  return { ...state };
}
