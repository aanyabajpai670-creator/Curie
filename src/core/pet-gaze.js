export function clampCursorToDisplays(point, displays) {
  if (!isFinitePoint(point)) return null;
  if (!Array.isArray(displays) || displays.length === 0) return null;
  const bounds = displays.map((display) => display.bounds);
  const inside = bounds.find((area) => contains(area, point));
  if (inside) return { x: point.x, y: point.y, clamped: false };
  const candidates = bounds.map((area) => ({
    x: Math.min(Math.max(point.x, area.x), area.x + area.width - 1),
    y: Math.min(Math.max(point.y, area.y), area.y + area.height - 1),
  }));
  const nearest = candidates.reduce((best, candidate) => distanceSquared(point, candidate) < distanceSquared(point, best) ? candidate : best);
  return { ...nearest, clamped: true };
}

export function createPetGazeController({ deadZoneX = 0.12, deadZoneY = 0.08, hysteresis = 0.04 } = {}) {
  let gaze = { dx: 0, dy: 0 };

  function update(cursor, bounds) {
    if (!isFinitePoint(cursor) || !isWindowRect(bounds)) return { ...gaze };
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height * 0.46;
    gaze = {
      dx: quantize(cursor.x - centerX, bounds.width * deadZoneX, bounds.width * hysteresis, gaze.dx),
      dy: quantize(cursor.y - centerY, bounds.height * deadZoneY, bounds.height * hysteresis, gaze.dy),
    };
    return { ...gaze };
  }

  function getGaze() {
    return { ...gaze };
  }

  return { update, getGaze };
}

export function shouldSendGaze(next, previous, now, previousAt, heartbeatMs = 250) {
  return !previous || next.dx !== previous.dx || next.dy !== previous.dy || now - previousAt >= heartbeatMs;
}

export function createGazeWatchdog({ timeoutMs = 1000, easeMs = 200 } = {}) {
  let lastMessageAt = 0;
  let current = { dx: 0, dy: 0 };
  let easeStartedAt;
  let easeFrom = { dx: 0, dy: 0 };
  let reported = false;

  function receive(gaze, now) {
    current = { dx: sign(gaze?.dx), dy: sign(gaze?.dy) };
    lastMessageAt = now;
    easeStartedAt = undefined;
    reported = false;
  }

  function update(now) {
    if (now - lastMessageAt < timeoutMs) return { ...current, timedOut: false, shouldReport: false };
    if (easeStartedAt === undefined) {
      easeStartedAt = now;
      easeFrom = { ...current };
    }
    const amount = Math.min(1, Math.max(0, (now - easeStartedAt) / easeMs));
    const eased = amount * amount * (3 - 2 * amount);
    current = {
      dx: amount === 1 ? 0 : snap(easeFrom.dx * (1 - eased)),
      dy: amount === 1 ? 0 : snap(easeFrom.dy * (1 - eased)),
    };
    const shouldReport = !reported;
    reported = true;
    return { ...current, timedOut: true, shouldReport };
  }

  return { receive, update, getLastMessageAt: () => lastMessageAt };
}

export function createResilientTick(tick, onError = () => {}) {
  return (...args) => {
    try {
      return tick(...args);
    } catch (error) {
      try { onError(error); } catch { /* Keep the interval alive even if diagnostics fail. */ }
      return undefined;
    }
  };
}

function quantize(value, deadZone, hysteresis, previous) {
  if (previous < 0 && value < -deadZone + hysteresis) return -1;
  if (previous > 0 && value > deadZone - hysteresis) return 1;
  if (value < -deadZone) return -1;
  if (value > deadZone) return 1;
  return 0;
}

function snap(value) {
  return Math.abs(value) < 0.5 ? 0 : Math.sign(value) * Math.round(Math.abs(value));
}

function sign(value) {
  return value === -1 || value === 1 ? value : 0;
}

function contains(area, point) {
  return point.x >= area.x && point.x < area.x + area.width && point.y >= area.y && point.y < area.y + area.height;
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function isFinitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isWindowRect(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0;
}
