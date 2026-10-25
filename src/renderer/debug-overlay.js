const output = document.querySelector('#diagnostics');
window.curieDebug.onRefresh((text) => {
  output.textContent = String(text ?? '');
});
