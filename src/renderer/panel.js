const timerDisplay = document.querySelector('#timer');
const phaseLabel = document.querySelector('#phase');
const primaryButton = document.querySelector('#primary');
const pauseButton = document.querySelector('#pause');
const resetButton = document.querySelector('#reset');
const skipButton = document.querySelector('#skip');

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
}

function render(status) {
  if (!status) return;
  timerDisplay.textContent = formatTime(status.remainingSeconds);
  phaseLabel.textContent = status.phase === 'break' ? 'BREAK' : 'FOCUS SESSION';
  primaryButton.textContent = status.status === 'running'
    ? 'Timer running'
    : status.status === 'paused'
      ? 'Resume studying'
      : status.status === 'done'
        ? 'Start next session'
        : 'Start studying';
  primaryButton.disabled = status.status === 'running';
  pauseButton.disabled = status.status !== 'running';
  document.querySelector('#session-count').textContent =
    status.completedSessions + (status.completedSessions === 1 ? ' session complete' : ' sessions complete');
}

primaryButton.addEventListener('click', async () => {
  const status = await window.curie.getTimerStatus();
  await window.curie.timerAction(status.status === 'paused' ? 'resume' : 'start');
});
pauseButton.addEventListener('click', () => window.curie.timerAction('pause'));
resetButton.addEventListener('click', () => window.curie.timerAction('reset'));
skipButton.addEventListener('click', () => window.curie.timerAction('skip'));
window.curie.onTimerUpdate(render);
window.curie.getTimerStatus().then(render);
