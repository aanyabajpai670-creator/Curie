const DEFAULTS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
});

export class StudyTimer {
  constructor({ clock = Date.now, config = {}, initialState } = {}) {
    this.clock = clock;
    this.config = normalizeConfig(config);
    this.state = normalizeState(initialState, this.config);
    this.events = [];
  }

  startFocus(source = 'action') {
    const events = this.advance();
    if (this.state.status === 'idle') {
      const now = this.clock();
      this.state.phase = 'FOCUS';
      this.state.status = 'running';
      this.state.doneEmitted = false;
      this.state.pausedAt = null;
      this.state.pausedRemainingMs = null;
      this.state.endAt = now + this.durationFor('FOCUS');
      events.push({ type: 'phase-started', phase: 'FOCUS', at: now, source });
    }
    return this.result(events);
  }

  start(source) { return this.startFocus(source); }

  pause(source = 'action') {
    const events = this.advance();
    if (this.state.status === 'running') {
      const now = this.clock();
      this.state.pausedRemainingMs = Math.max(0, this.state.endAt - now);
      this.state.pausedAt = now;
      this.state.status = 'paused';
      events.push({ type: 'paused', phase: this.state.phase, at: now, source });
    }
    return this.result(events);
  }

  resume(source = 'action') {
    const events = this.advance();
    if (this.state.status === 'paused') {
      const now = this.clock();
      this.state.endAt = now + this.state.pausedRemainingMs;
      this.state.pausedAt = null;
      this.state.pausedRemainingMs = null;
      this.state.status = 'running';
      events.push({ type: 'resumed', phase: this.state.phase, at: now, source });
    }
    return this.result(events);
  }

  skip(source = 'action') {
    const events = this.advance();
    if (this.state.status === 'running' || this.state.status === 'paused') {
      events.push(...this.endCurrentPhase(this.clock(), source));
    }
    return this.result(events);
  }

  stop(source = 'action') {
    const events = this.advance();
    if (this.state.status !== 'idle') {
      const now = this.clock();
      events.push({ type: 'stopped', phase: this.state.phase, at: now, source, completed: this.state.completedSessions > 0 });
      this.state = freshState(this.state.completedSessions, this.state.cycleCount, this.state.doneEmitted);
    }
    if (this.state.completedSessions > 0 && !this.state.doneEmitted) {
      events.push({ type: 'session-complete', phase: this.state.phase, at: this.clock(), source });
      this.state.doneEmitted = true;
    }
    return this.result(events);
  }

  reset(source) { return this.stop(source); }

  /** Advance across any missed boundaries. One call can describe many transitions;
   * the service deliberately emits only one native notification for catch-up. */
  advance() {
    const events = [];
    while (this.state.status === 'running' && this.clock() >= this.state.endAt) {
      const endedAt = this.state.endAt;
      events.push(...this.endCurrentPhase(endedAt, 'timer'));
      if (this.state.status === 'idle') break;
    }
    return events;
  }

  tick() { return this.result(this.advance()); }

  status() {
    const events = this.advance();
    const remainingMs = this.state.status === 'running'
      ? Math.max(0, this.state.endAt - this.clock())
      : this.state.status === 'paused' ? this.state.pausedRemainingMs : 0;
    return this.result(events, remainingMs);
  }

  serialize() { return { ...this.state }; }

  durationFor(phase) {
    const minutes = phase === 'FOCUS'
      ? this.config.focusMinutes
      : phase === 'LONG_BREAK' ? this.config.longBreakMinutes : this.config.shortBreakMinutes;
    return minutes * 60_000;
  }

  endCurrentPhase(endedAt, source) {
    const endedPhase = this.state.phase;
    const events = [{ type: 'phase-ended', phase: endedPhase, endedAt, source, notification: true }];
    if (endedPhase === 'FOCUS') {
      this.state.completedSessions += 1;
      this.state.cycleCount = Math.floor(this.state.completedSessions / this.config.longBreakEvery);
      this.state.phase = this.state.completedSessions % this.config.longBreakEvery === 0 ? 'LONG_BREAK' : 'SHORT_BREAK';
      this.state.endAt = endedAt + this.durationFor(this.state.phase);
      events[0].nextPhase = this.state.phase;
      events[0].nextDurationMinutes = this.durationFor(this.state.phase) / 60_000;
      events.push({ type: 'phase-started', phase: this.state.phase, at: endedAt, source });
    } else {
      const doneAlreadyEmitted = this.state.doneEmitted;
      this.state = freshState(this.state.completedSessions, this.state.cycleCount, endedPhase === 'LONG_BREAK' || doneAlreadyEmitted);
      if (endedPhase === 'LONG_BREAK' && !doneAlreadyEmitted) {
        events.push({ type: 'session-complete', phase: endedPhase, at: endedAt, source });
      }
    }
    return events;
  }

  result(events = [], remainingOverride) {
    const remainingMs = remainingOverride ?? (this.state.status === 'running'
      ? Math.max(0, this.state.endAt - this.clock())
      : this.state.status === 'paused' ? this.state.pausedRemainingMs : 0);
    return {
      ...this.state,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      events,
    };
  }
}

export function normalizeConfig(config = {}) {
  const merged = { ...DEFAULTS, ...config };
  for (const field of ['focusMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakEvery']) {
    if (!Number.isFinite(merged[field]) || merged[field] <= 0) throw new TypeError(`Invalid timer ${field}`);
  }
  if (!Number.isInteger(merged.longBreakEvery)) throw new TypeError('Invalid timer longBreakEvery');
  return merged;
}

function freshState(completedSessions = 0, cycleCount = 0, doneEmitted = false) {
  return {
    status: 'idle',
    phase: 'IDLE',
    endAt: null,
    pausedAt: null,
    pausedRemainingMs: null,
    completedSessions,
    cycleCount,
    doneEmitted,
  };
}

function normalizeState(state, config) {
  if (!state) return freshState();
  // Convert state written by the pre-phase timer once, without carrying its tick counter forward.
  if (['work', 'break'].includes(state.phase)) {
    if (state.status === 'running' && Number.isFinite(state.endsAt)) {
      return { ...freshState(state.completedSessions || 0), status: 'running', phase: state.phase === 'work' ? 'FOCUS' : 'SHORT_BREAK', endAt: state.endsAt };
    }
    if (state.status === 'paused' && Number.isFinite(state.remainingMs) && state.remainingMs >= 0) {
      return { ...freshState(state.completedSessions || 0), status: 'paused', phase: state.phase === 'work' ? 'FOCUS' : 'SHORT_BREAK', pausedAt: 0, pausedRemainingMs: state.remainingMs };
    }
    return freshState(state.completedSessions || 0);
  }
  const valid = ['IDLE', 'FOCUS', 'SHORT_BREAK', 'LONG_BREAK'].includes(state.phase)
    && ['idle', 'running', 'paused'].includes(state.status)
    && Number.isInteger(state.completedSessions) && state.completedSessions >= 0
    && Number.isInteger(state.cycleCount) && state.cycleCount >= 0
    && (state.doneEmitted === undefined || typeof state.doneEmitted === 'boolean')
    && (state.status !== 'running' || Number.isFinite(state.endAt))
    && (state.status !== 'paused' || (Number.isFinite(state.pausedAt) && Number.isFinite(state.pausedRemainingMs) && state.pausedRemainingMs >= 0));
  if (!valid) return freshState();
  if (state.phase === 'IDLE' && state.status !== 'idle') return freshState();
  const cycleCount = Math.floor(state.completedSessions / config.longBreakEvery);
  return { ...state, cycleCount, doneEmitted: Boolean(state.doneEmitted) };
}
