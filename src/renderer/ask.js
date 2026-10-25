import { createAskRequestState } from '../core/ask-request.js';

const form = document.querySelector('#form');
const input = document.querySelector('#message');
const status = document.querySelector('#status');
const confirmBox = document.querySelector('#confirmation');
const list = document.querySelector('#proposals');
const requestState = createAskRequestState();
let requestId = 0;
let timeoutHandle;

function render(next) {
  status.textContent = next.text;
  confirmBox.hidden = next.status !== 'confirm';
}

function finish(message) {
  clearTimeout(timeoutHandle);
  const outcome = message.outcome || (message.error ? 'error' : 'reply');
  const next = requestState.resolve({ outcome, text: message.text, requestId: message.requestId ?? requestId });
  render(next);
  if (next.status === 'reply') {
    input.value = '';
    input.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || requestState.current().status === 'pending') return;
  requestId += 1;
  render(requestState.begin(requestId));
  status.textContent = 'thinking...';
  list.replaceChildren();
  clearTimeout(timeoutHandle);
  timeoutHandle = setTimeout(() => {
    const next = requestState.timeout('Request timed out after 60 seconds. You can edit the message and resend it.');
    render(next);
    requestId += 1;
  }, 60_000);
  window.curieAsk.send(text, requestId);
});

document.querySelector('#yes').addEventListener('click', () => {
  render(requestState.begin(requestId));
  status.textContent = 'Continuing...';
  window.curieAsk.confirm(true);
});
document.querySelector('#no').addEventListener('click', () => {
  render(requestState.begin(requestId));
  status.textContent = 'Cancelling...';
  window.curieAsk.confirm(false);
});
document.querySelector('#close').addEventListener('click', () => window.curieAsk.close());
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.curieAsk.close(); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });

window.curieAsk.onUpdate((message) => finish(message));
window.curieAsk.onConfirmation((proposals) => {
  clearTimeout(timeoutHandle);
  list.replaceChildren(...proposals.map((proposal) => {
    const item = document.createElement('li');
    item.textContent = proposal.label;
    return item;
  }));
  render(requestState.confirmation('Confirm these changes?'));
});
