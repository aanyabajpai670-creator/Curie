const startButton = document.querySelector('#start');

startButton.addEventListener('click', () => {
  window.curie.setPetState('focused');
  startButton.textContent = 'Timer arrives in Phase 2';
  startButton.disabled = true;
});
