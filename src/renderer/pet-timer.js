const output = document.querySelector('#time');
window.curieTimerReadout.onUpdate((text) => { output.textContent = text; });
