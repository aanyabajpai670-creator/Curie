import {
  clampPosition,
  DEFAULT_REST_MS,
  DEFAULT_LIFT_PER_FRAME,
  createPetInteraction,
  createPetModeController,
  createPetRhythmController,
  createHorizontalWanderController,
  eyeCells,
  frameSourceRect,
  lift,
  PET_LIFT_MAX,
  PET_FRAME_SIZE,
  PET_FRAME_COUNT,
  PET_USER_SCALES,
  pixelScaleFor,
  validateBehaviorConfig,
  validateEyeConfig,
} from '../core/pet-behavior.js';
import { createGazeWatchdog, createPetGazeController } from '../core/pet-gaze.js';

const canvas = document.querySelector('#pet');
const context = canvas.getContext('2d');
const debug = document.querySelector('#debug');
const scaleMenu = document.querySelector('#scale-menu');
const previewPanel = document.querySelector('#browser-panel');
const params = new URLSearchParams(location.search);
const previewMode = params.get('preview') === '1';
const electronMode = Boolean(window.curie?.beginPetDrag);
const gazeWatchdog = electronMode ? createGazeWatchdog() : undefined;
const previewGaze = previewMode ? createPetGazeController() : undefined;
let userScale = readScale(params.get('scale'));
let pixelScale = 1;
let eyes;
let motion;
let sheet;
const behavior = createPetModeController();
let rhythm = createPetRhythmController({ restMs: DEFAULT_REST_MS });
rhythm.start(performance.now());
let gaze = { dx: 0, dy: 0 };
let frame = 0;
let lastEvent = 'pet.ready';
let dragging = false;
let position = { x: 30, y: 30 };
let wander;
let assetStatus = 'loading';
let lastReportedMotion;
const interaction = createPetInteraction();

if (previewMode) {
  document.body.dataset.preview = 'true';
  debug.hidden = false;
  scaleMenu.hidden = true;
  previewPanel.hidden = true;
  wander = createHorizontalWanderController({ speed: 36 });
}

function readScale(value) {
  const parsed = Number(value);
  return PET_USER_SCALES.includes(parsed) ? parsed : 10;
}

function configureCanvas() {
  const dpr = window.devicePixelRatio || 1;
  pixelScale = pixelScaleFor(userScale, dpr);
  canvas.width = PET_FRAME_SIZE * pixelScale;
  const liftMax = motion?.liftMax ?? PET_LIFT_MAX;
  canvas.height = (PET_FRAME_SIZE + liftMax) * pixelScale;
  canvas.style.width = PET_FRAME_SIZE * userScale + 'px';
  canvas.style.height = (PET_FRAME_SIZE + liftMax) * userScale + 'px';
  document.documentElement.style.setProperty('--user-scale', String(userScale));
  if (previewMode) {
    position = clampPosition(position, { width: canvas.clientWidth, height: canvas.clientHeight }, viewportArea());
    setPreviewPosition(position);
  }
  render(performance.now());
}

function viewportArea() {
  return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

function setPreviewPosition(next) {
  position = next;
  canvas.style.left = next.x + 'px';
  canvas.style.top = next.y + 'px';
}

function render(now) {
  if (electronMode && gazeWatchdog) {
    const recoveredGaze = gazeWatchdog.update(now);
    gaze = { dx: recoveredGaze.dx, dy: recoveredGaze.dy };
    if (recoveredGaze.shouldReport) window.curie.reportGazeWatchdog();
  }
  const previousMode = behavior.getMode();
  const motionState = rhythm.update(now, {
    continuous: previousMode === 'WANDER',
    paused: previousMode === 'CALM',
  });
  behavior.advance(motionState.frame, now);
  frame = behavior.getMode() === 'CALM'
    ? behavior.getCalmFrame()
    : behavior.getSettlingFrame() ?? motionState.frame;
  const mode = behavior.getMode();
  const resting = mode === 'CALM' || motionState.resting || behavior.getSettlingFrame() !== undefined;
  const liftValue = resting
    ? 0
    : lift(motionState.timeInCycle, motion?.liftPerFrame || DEFAULT_LIFT_PER_FRAME);
  const liftMax = motion?.liftMax ?? PET_LIFT_MAX;
  const breathScale = resting ? breathingScale(now) : 1;
  const spriteHeight = PET_FRAME_SIZE * pixelScale * breathScale;
  const spriteY = (liftMax - liftValue) * pixelScale + PET_FRAME_SIZE * pixelScale - spriteHeight;
  const blinking = behavior.isBlinking(now) || (mode !== 'CALM' && rhythm.isBlinking(now));

  if (previewMode && wander) {
    const next = wander.step(
      position,
      { width: canvas.clientWidth, height: canvas.clientHeight },
      viewportArea(),
      now,
      Math.random,
      motionState.airborne,
      mode === 'CALM' || mode === 'CALM pending',
    );
    if (next.x !== position.x) setPreviewPosition(next);
    behavior.setWandering(wander.isWandering());
  }

  const currentMode = behavior.getMode();
  const airborne = !resting && frame >= 5 && frame <= 11;
  const motionSignature = currentMode + ':' + airborne;
  if (electronMode && motionSignature !== lastReportedMotion) {
    lastReportedMotion = motionSignature;
    window.curie.setPetBehavior(currentMode, airborne);
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  const shadowWidth = 10 - (liftMax > 0 ? Math.min(liftValue / liftMax, 1) * 4 : 0);
  context.globalAlpha = 0.35 * (liftMax > 0 ? Math.max(0, 1 - liftValue / liftMax) : 1);
  context.fillStyle = eyes?.eyeCellColors[0] || 'rgb(59 42 63)';
  context.beginPath();
  context.ellipse(
    8 * pixelScale,
    (liftMax + 15) * pixelScale,
    shadowWidth * pixelScale / 2,
    0.65 * pixelScale,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.globalAlpha = 1;
  if (sheet?.complete && sheet.naturalWidth >= PET_FRAME_SIZE * PET_FRAME_COUNT) {
    const source = frameSourceRect(frame);
    context.drawImage(
      sheet,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      spriteY,
      PET_FRAME_SIZE * pixelScale,
      spriteHeight,
    );
  }
  if (eyes) {
    const eyeDraw = blinking
      ? eyes.eyeColumns.map((x) => ({ x, y: eyes.eyeTopY[frame] + 1, color: eyes.eyeCellColors[1] }))
      : eyeCells({
          columns: eyes.eyeColumns,
          topY: eyes.eyeTopY[frame],
          colors: eyes.eyeCellColors,
          ...gaze,
        });
    for (const cell of eyeDraw) {
      context.fillStyle = cell.color;
      context.fillRect(
        cell.x * pixelScale,
        (liftMax - liftValue + cell.y * breathScale + PET_FRAME_SIZE * (1 - breathScale)) * pixelScale,
        pixelScale,
        pixelScale,
      );
    }
  }
  updateDebug();
}

function breathingScale(now) {
  return 1 + 0.012 * Math.sin((now * Math.PI * 2) / 2400);
}

function updateDebug() {
  if (!previewMode) return;
  debug.textContent = [
    'state: ' + behavior.getMode(),
    'frame: ' + frame + ' / ' + (PET_FRAME_COUNT - 1),
    'gaze: dx ' + gaze.dx + ', dy ' + gaze.dy,
    'last event: ' + lastEvent,
    'asset status: ' + assetStatus,
  ].filter(Boolean).join('\n');
}

function setLastEvent(name) {
  lastEvent = name;
  if (electronMode) window.curie.logPetEvent(name);
  updateDebug();
}

function updateGaze(point) {
  if (!previewMode) return;
  const rect = canvas.getBoundingClientRect();
  gaze = previewGaze.update(point, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}

function handlePetClick(event) {
  const previousMode = behavior.getMode();
  const now = performance.now();
  const currentMotion = rhythm.update(now, {
    continuous: previousMode === 'WANDER',
    paused: previousMode === 'CALM',
  });
  setLastEvent('pet.click');
  behavior.dispatch(event, currentMotion.frame, now, currentMotion.resting);
  if (previousMode === 'CALM' || previousMode === 'CALM pending') {
    behavior.setWandering(false);
    rhythm.start(now);
  }
  updateDebug();
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  if (electronMode) window.curie.beginPetDrag();
  interaction.pointerDown({ x: event.clientX, y: event.clientY });
});

canvas.addEventListener('pointermove', (event) => {
  updateGaze({ x: event.clientX, y: event.clientY });
  if (!event.buttons) return;
  const result = interaction.pointerMove({ x: event.clientX, y: event.clientY });
  if (!result.dragging) return;
  if (!dragging) {
    dragging = true;
    setLastEvent('pet.drag.start');
  }
  if (electronMode) {
    window.curie.dragPet();
  } else if (previewMode) {
    const next = clampPosition(
      { x: position.x + result.dx, y: position.y + result.dy },
      { width: canvas.clientWidth, height: canvas.clientHeight },
      viewportArea(),
    );
    setPreviewPosition(next);
  }
});

canvas.addEventListener('pointerup', (event) => {
  const result = interaction.pointerUp({ x: event.clientX, y: event.clientY });
  if (dragging) {
    dragging = false;
    setLastEvent('pet.drag.end');
    if (electronMode) window.curie.endPetDrag();
  } else if (electronMode) {
    window.curie.cancelPetDrag();
  } else if (result.clicked) {
    handlePetClick(result);
  }
});

canvas.addEventListener('pointercancel', () => {
  const result = interaction.pointerCancel();
  if (dragging && result.dragged) {
    dragging = false;
    setLastEvent('pet.drag.end');
    if (electronMode) window.curie.endPetDrag();
  } else if (electronMode) {
    window.curie.cancelPetDrag();
  }
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  interaction.contextMenu();
  setLastEvent('pet.contextmenu');
  if (electronMode) window.curie.showMenu();
  else if (previewMode) openScaleMenu(event.clientX, event.clientY);
});

canvas.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  handlePetClick({ type: 'pet.click' });
});

function openScaleMenu(x, y) {
  scaleMenu.style.left = Math.max(0, Math.min(x, innerWidth - 150)) + 'px';
  scaleMenu.style.top = Math.max(0, Math.min(y, innerHeight - 130)) + 'px';
  scaleMenu.hidden = false;
}

scaleMenu.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="open-panel"]')) {
    previewPanel.hidden = !previewPanel.hidden;
    scaleMenu.hidden = true;
    setLastEvent('pet.panel.open');
    return;
  }
  const scale = Number(event.target.closest('[data-scale]')?.dataset.scale);
  if (!PET_USER_SCALES.includes(scale)) return;
  userScale = scale;
  configureCanvas();
  scaleMenu.hidden = true;
  setLastEvent('pet.scale.' + scale);
});

document.addEventListener('pointerdown', (event) => {
  if (previewMode && !scaleMenu.contains(event.target) && event.target !== canvas) {
    scaleMenu.hidden = true;
  }
});

if (electronMode) {
  gazeWatchdog.receive({ dx: 0, dy: 0 }, performance.now());
  window.curie.onPetGaze((offset) => {
    gazeWatchdog.receive(offset, performance.now());
    gaze = offset;
    window.curie.ackPetGaze();
  });
  window.curie.onPetWander((wandering) => behavior.setWandering(wandering));
  window.curie.onPetScale((scale) => {
    userScale = readScale(scale);
    configureCanvas();
  });
}

async function loadAssets() {
  try {
    const [sheetResponse, eyesResponse, motionResponse] = await Promise.all([
      fetch('../../assets/pink_slime_body_sheet_16px.png'),
      fetch('../../assets/pink_slime_eyes.json'),
      fetch('../../assets/behaviour.json'),
    ]);
    if (!sheetResponse.ok || !eyesResponse.ok || !motionResponse.ok) throw new Error('missing pet art');
    eyes = validateEyeConfig(await eyesResponse.json());
    motion = validateBehaviorConfig(await motionResponse.json());
    rhythm = createPetRhythmController({ restMs: motion.restMs });
    rhythm.start(performance.now());
    sheet = new Image();
    sheet.src = URL.createObjectURL(await sheetResponse.blob());
    await sheet.decode();
    if (sheet.naturalWidth !== PET_FRAME_SIZE * PET_FRAME_COUNT || sheet.naturalHeight !== PET_FRAME_SIZE) {
      throw new Error('pet sheet must be a single row of twelve 16px frames');
    }
    assetStatus = 'ready';
    setLastEvent('pet.assets.ready');
  } catch {
    assetStatus = 'missing required pet art';
    setLastEvent('pet.assets.missing');
  }
  configureCanvas();
}

window.addEventListener('pointermove', (event) => {
  if (previewMode && event.target !== canvas) updateGaze({ x: event.clientX, y: event.clientY });
});

window.addEventListener('resize', () => {
  if (previewMode && !dragging) {
    setPreviewPosition(clampPosition(position, { width: canvas.clientWidth, height: canvas.clientHeight }, viewportArea()));
  }
  configureCanvas();
});

let previousRender = 0;
function animate(now) {
  if (now - previousRender >= 1000 / 60) {
    render(now);
    previousRender = now;
  }
  requestAnimationFrame(animate);
}

configureCanvas();
loadAssets();
requestAnimationFrame(animate);
