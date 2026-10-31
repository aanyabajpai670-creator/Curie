import { createConversationClient, renderConfirmationCard, resolveConfirmationCard } from './conversation-client.js';

const messages = document.querySelector('#messages');
const reminders = document.querySelector('#reminders');
const heading = document.querySelector('#heading');
const missed = document.querySelector('#missed');
const input = document.querySelector('#reply');
const pending = new Map();
const cards = new Map();
let currentReminderIds = [];
let pushbackState = null;

function hidePushback() {
  pushbackState = null;
  document.querySelector('#pushback').hidden = true;
  for (const item of document.querySelectorAll('[data-action]')) item.disabled = false;
}

function showPushback(payload) {
  if (!payload?.message) return;
  pushbackState = payload;
  document.querySelector('#pushback-message').textContent = payload.message;
  document.querySelector('#pushback-confirm').textContent = payload.action === 'snooze' ? 'Snooze anyway' : 'Skip anyway';
  document.querySelector('#pushback-start').disabled = false;
  document.querySelector('#pushback-confirm').disabled = false;
  document.querySelector('#pushback').hidden = false;
  for (const item of document.querySelectorAll('#actions [data-action]')) item.disabled = true;
}

function appendMessage(role, text) {
  const item = document.createElement('div');
  item.className = `message ${role}`;
  item.textContent = text;
  messages.append(item);
  while (messages.children.length > 6) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function renderSnapshot(payload = {}) {
  const group = payload.group || { count: 0, missedCount: 0, items: [] };
  currentReminderIds = (group.items || []).map((item) => item.id);
  heading.textContent = group.count > 1 ? `${group.count} reminders` : group.count ? 'Reminder' : (payload.test ? 'Test reminder bubble' : 'Reminder');
  missed.textContent = group.missedCount ? `${group.missedCount} missed` : '';
  reminders.replaceChildren(...(group.items || []).map((item) => {
    const row = document.createElement('li');
    const title = document.createElement('strong'); title.textContent = item.title;
    const due = document.createElement('small'); due.textContent = `${item.dueLabel || (item.missed ? 'Missed' : 'Due now')} · ${new Date(item.due).toLocaleString()}`;
    row.append(title, due);
    return row;
  }));
  document.querySelector('#actions').hidden = false;
  hidePushback();
  document.querySelector('#status').textContent = payload.test ? 'Temporary test reminder · normal actions enabled.' : '';
  const shownIds = (group.items || []).filter((item) => !item.shown).map((item) => item.id);
  if (shownIds.length) window.curieReminder.shown(shownIds);
}

const client = createConversationClient({
  windowName: 'reminder',
  bridge: {
    send: (payload) => window.curieReminder.sendReply(payload),
    confirm: (payload) => window.curieReminder.confirm(payload),
    clear() {},
    stage: (...args) => window.curieReminder.stage(...args),
    forwardError: (kind, message) => window.curieReminder.forwardError(kind, message),
  },
  onPending: ({ requestId }) => pending.set(requestId, appendMessage('assistant', 'Thinking…')),
  onConfirmation: (value) => {
    const card = document.createElement('section'); card.id = 'confirmation'; card.className = 'message assistant';
    const proposalList = document.createElement('ul');
    const status = document.createElement('p'); status.dataset.confirmationStatus = ''; status.setAttribute('aria-live', 'polite');
    const confirmButton = document.createElement('button'); confirmButton.type = 'button'; confirmButton.dataset.confirm = ''; confirmButton.textContent = 'Confirm all';
    const cancelButton = document.createElement('button'); cancelButton.type = 'button'; cancelButton.dataset.cancel = ''; cancelButton.textContent = 'Cancel all';
    card.append(proposalList, status, confirmButton, cancelButton);
    messages.append(card); cards.set(value.requestId, card);
    renderConfirmationCard({ container: card, list: proposalList, proposals: value.proposals, requestId: value.requestId, confirmationToken: value.confirmationToken,
      onConfirm: (requestId, confirmationToken) => client.confirm(requestId, true, confirmationToken),
      onCancel: (requestId, confirmationToken) => client.confirm(requestId, false, confirmationToken) });
    messages.scrollTop = messages.scrollHeight;
  },
  onProposalResults: (result) => {
    const card = cards.get(result.requestId);
    if (card) resolveConfirmationCard(card, (result.items || []).map((item) => item.statusText).join(' · ') || 'Saved');
  },
  onOutcome: ({ requestId, text, outcome }) => {
    const node = pending.get(requestId);
    if (node) { node.textContent = text; pending.delete(requestId); }
    else appendMessage('assistant', text);
    if (outcome === 'reply' && node) input.value = '';
    messages.scrollTop = messages.scrollHeight;
  },
});

document.querySelector('#reply-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  appendMessage('user', text);
  client.request(text);
});
input.addEventListener('click', () => input.focus());
for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', () => {
  for (const item of document.querySelectorAll('[data-action]')) item.disabled = true;
  window.curieReminder.action(button.dataset.action, currentReminderIds);
});
document.querySelector('#pushback-confirm').addEventListener('click', () => {
  if (!pushbackState) return;
  const { action, ids, minutes } = pushbackState;
  document.querySelector('#pushback-confirm').disabled = true;
  document.querySelector('#pushback-start').disabled = true;
  window.curieReminder.action(action, ids, { minutes, confirm: true });
});
document.querySelector('#pushback-start').addEventListener('click', () => {
  if (!pushbackState) return;
  const ids = pushbackState.ids;
  document.querySelector('#pushback-start').disabled = true;
  window.curieReminder.startFocus(ids);
  document.querySelector('#status').textContent = 'Focus started. Your task is still due.';
  document.querySelector('#pushback').hidden = true;
  pushbackState = null;
  for (const item of document.querySelectorAll('[data-action]')) item.disabled = false;
});
document.querySelector('#pushback-keep').addEventListener('click', () => {
  hidePushback();
  document.querySelector('#status').textContent = 'Still on your list.';
});
document.querySelector('#open-panel').addEventListener('click', () => window.curieReminder.openPanel());
document.querySelector('#close-bubble').addEventListener('click', () => window.curieReminder.close('close'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); window.curieReminder.close('escape'); }
});
window.curieReminder.onUpdate(renderSnapshot);
window.curieReminder.onPushback(showPushback);
window.curieReminder.onConversationUpdate((result) => client.resolve(result));
window.curieReminder.onConversationConfirmation((result) => client.confirmation(result));
window.curieReminder.onConversationProposalResults((result) => client.proposalResults(result));
