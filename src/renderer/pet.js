import { getAnimationState, nextFrameIndex } from '../core/animation.js';

const pet = document.querySelector('#pet');
const sprite = document.querySelector('#sprite');
const badge = document.querySelector('#badge');
const SCALE = Number(new URLSearchParams(location.search).get('scale')) || 6;
let states;
let currentState = 'idle';
let frameIndex = 0;
let frameTimer;

document.documentElement.style.setProperty('--sprite-scale', SCALE);

async function loadStates() {
  const response = await fetch('../../assets/states.json');
  if (!response.ok) throw new Error('Could not load animation settings');
  states = await response.json();
  renderState(currentState);
}

function renderState(name) {
  const animation = getAnimationState(states, name);
  currentState = name;
  frameIndex = 0;
  pet.dataset.state = name;
  badge.textContent = ({ alert: '!', sleep: 'z', done: '✦' })[name] || '';
  drawFrame(animation.frames[frameIndex]);
  clearInterval(frameTimer);
  frameTimer = setInterval(() => {
    frameIndex = nextFrameIndex(animation, frameIndex);
    drawFrame(animation.frames[frameIndex]);
  }, 1000 / animation.fps);
}

function drawFrame(frame) {
  sprite.style.backgroundPosition = '-' + (frame * 16 * SCALE) + 'px 0';
  sprite.style.backgroundSize = (192 * SCALE) + 'px ' + (16 * SCALE) + 'px';
}

pet.addEventListener('click', () => window.curie.togglePanel());
pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.curie.showMenu();
});
pet.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') window.curie.togglePanel();
});
window.curie.onPetState(renderState);
loadStates().catch(() => renderState('idle'));
