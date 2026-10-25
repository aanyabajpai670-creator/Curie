export function clampToWorkAreas(position, size, workAreas) {
  if (!isFinitePoint(position) || !validSize(size) || !Array.isArray(workAreas) || workAreas.length === 0) {
    throw new TypeError('A finite position, positive window size, and display work areas are required');
  }
  const desired = integerPoint(position);
  const candidates = workAreas.map((area) => clampToArea(desired, size, area));
  const alreadyInside = candidates.find((candidate, index) =>
    candidate.x === desired.x && candidate.y === desired.y && fitsInArea(desired, size, workAreas[index]),
  );
  if (alreadyInside) return alreadyInside;
  return candidates.reduce((nearest, candidate) =>
    distanceSquared(candidate, desired) < distanceSquared(nearest, desired) ? candidate : nearest,
  );
}

export function createPetPositionController({
  initialPosition = { x: 0, y: 0 },
  size,
  workAreas,
  clock = () => Date.now(),
  apply = () => {},
  persist = () => {},
} = {}) {
  if (!isFinitePoint(initialPosition) || !validSize(size) || !Array.isArray(workAreas) || workAreas.length === 0) {
    throw new TypeError('A finite position, positive window size, and display work areas are required');
  }
  let position = integerPoint(initialPosition);
  let windowSize = { width: Math.round(size.width), height: Math.round(size.height) };
  let areas = workAreas.map(normalizeArea);
  let revision = 0;
  let dragging = false;
  let dragOrigin;
  let lastWriteAt = clock();

  function write(next, source, { allowClamp = true } = {}) {
    if (dragging && source !== 'drag' && source !== 'clamp') return false;
    const bounded = allowClamp ? clampToWorkAreas(next, windowSize, areas) : integerPoint(next);
    const tag = bounded.x !== Math.round(next.x) || bounded.y !== Math.round(next.y) ? 'clamp' : source;
    if (bounded.x === position.x && bounded.y === position.y) return false;
    position = bounded;
    lastWriteAt = clock();
    apply({ ...position }, tag);
    return true;
  }

  function restore(next, token = revision) {
    if (dragging || token < revision) return false;
    return write(next, 'restore');
  }

  function beginDrag(cursorPoint) {
    if (!isFinitePoint(cursorPoint)) return false;
    dragging = true;
    revision += 1;
    dragOrigin = { cursor: { ...cursorPoint }, position: { ...position } };
    return true;
  }

  function dragTo(cursorPoint) {
    if (!dragging || !isFinitePoint(cursorPoint)) return false;
    const next = {
      x: dragOrigin.position.x + cursorPoint.x - dragOrigin.cursor.x,
      y: dragOrigin.position.y + cursorPoint.y - dragOrigin.cursor.y,
    };
    return write(next, 'drag');
  }

  function endDrag() {
    if (!dragging) return false;
    dragging = false;
    dragOrigin = undefined;
    persist({ ...position });
    return true;
  }

  function cancelDrag() {
    if (!dragging) return false;
    dragging = false;
    dragOrigin = undefined;
    return true;
  }

  function wanderTo(next, { airborne = false, calm = false } = {}) {
    if (dragging || calm || !airborne || !isFinitePoint(next)) return false;
    return write(next, 'wander');
  }

  function setWorkAreas(nextAreas) {
    areas = nextAreas.map(normalizeArea);
    if (dragging) return false;
    return write(position, 'clamp');
  }

  function setSize(nextSize) {
    if (!validSize(nextSize)) throw new TypeError('A positive integer window size is required');
    windowSize = { width: Math.round(nextSize.width), height: Math.round(nextSize.height) };
    if (dragging) return { ...position };
    write(position, 'clamp');
    return { ...position };
  }

  return {
    beginDrag,
    dragTo,
    endDrag,
    cancelDrag,
    restore,
    wanderTo,
    setWorkAreas,
    setSize,
    getPosition: () => ({ ...position }),
    getSize: () => ({ ...windowSize }),
    getRevision: () => revision,
    getLastWriteAt: () => lastWriteAt,
    isDragging: () => dragging,
    now: clock,
  };
}

function clampToArea(position, size, area) {
  const maxX = Math.max(area.x, area.x + area.width - size.width);
  const maxY = Math.max(area.y, area.y + area.height - size.height);
  return {
    x: Math.round(Math.min(Math.max(position.x, area.x), maxX)),
    y: Math.round(Math.min(Math.max(position.y, area.y), maxY)),
  };
}

function fitsInArea(position, size, area) {
  return position.x >= area.x && position.y >= area.y &&
    position.x + size.width <= area.x + area.width &&
    position.y + size.height <= area.y + area.height;
}

function normalizeArea(area) {
  if (!area || ![area.x, area.y, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0) {
    throw new TypeError('Display work areas must have finite positive dimensions');
  }
  return { x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height) };
}

function integerPoint(point) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function distanceSquared(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function isFinitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validSize(size) {
  return size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}
