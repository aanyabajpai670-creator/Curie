import { createConversationClient, renderConfirmationCard, resolveConfirmationCard } from './conversation-client.js';

const form = document.querySelector('#form');
const input = document.querySelector('#message');
const status = document.querySelector('#status');
const confirmBox = document.querySelector('#confirmation');
const list = document.querySelector('#proposals');
let activeConfirmationId;

const client = createConversationClient({
  windowName: 'ask', bridge: window.curieConversation,
  onPending: ({ text }) => { status.textContent = text; confirmBox.hidden = true; },
  onConfirmation: (value) => {
    activeConfirmationId = value.requestId;
    renderConfirmationCard({ container: confirmBox, list, proposals: value.proposals, requestId: value.requestId, confirmationToken: value.confirmationToken,
      onConfirm: (requestId, confirmationToken) => client.confirm(requestId, true, confirmationToken),
      onCancel: (requestId, confirmationToken) => client.confirm(requestId, false, confirmationToken) });
    status.textContent = 'Confirm these changes?';
  },
  onProposalResults: (result) => {
    if (result.requestId !== activeConfirmationId) return;
    const items = result.items || [];
    resolveConfirmationCard(confirmBox, items.map((item) => item.statusText).join(' · ') || 'Saved');
  },
  onOutcome: ({ outcome, text }) => {
    status.textContent = text;
    if (outcome === 'reply') { input.value = ''; input.focus(); }
  },
  onClear: () => { input.value = ''; status.textContent = ''; confirmBox.hidden = true; },
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (text) client.request(text);
});
document.querySelector('#close').addEventListener('click', () => window.curieConversation.close());
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') window.curieConversation.close(); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
window.curieConversation.onUpdate((result) => client.resolve(result));
window.curieConversation.onConfirmation((result) => client.confirmation(result));
window.curieConversation.onProposalResults((result) => client.proposalResults(result));
