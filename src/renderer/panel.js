import { createConversationClient, renderConfirmationCard, resolveConfirmationCard } from './conversation-client.js';

const timerDisplay = document.querySelector('#timer');
const phaseLabel = document.querySelector('#phase');
const primaryButton = document.querySelector('#primary');
const pauseButton = document.querySelector('#pause');
const resetButton = document.querySelector('#reset');
const skipButton = document.querySelector('#skip');
const taskList = document.querySelector('#task-list');
const reminderCard = document.querySelector('#reminder');
const settingsForm = document.querySelector('#settings-form');
const explicitlyEditedSettings = new Set();
for (const eventName of ['input', 'change']) settingsForm.addEventListener(eventName, (event) => {
  const name = event.target?.name;
  if (name && !['geminiApiKey', 'groqApiKey', 'clearGeminiKey', 'clearGroqKey'].includes(name)) explicitlyEditedSettings.add(name);
});

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return (
    String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0')
  );
}

function renderTimer(status) {
  if (!status) return;
  timerDisplay.textContent = formatTime(status.remainingSeconds);
  phaseLabel.textContent = status.phase === 'SHORT_BREAK' ? 'SHORT BREAK' : status.phase === 'LONG_BREAK' ? 'LONG BREAK' : status.phase === 'FOCUS' ? 'FOCUS SESSION' : 'READY';
  primaryButton.textContent =
    status.status === 'running'
      ? 'Timer running'
      : status.status === 'paused'
        ? 'Resume studying'
        : status.status === 'done'
          ? 'Start next session'
          : 'Start studying';
  primaryButton.disabled = status.status === 'running';
  pauseButton.disabled = status.status !== 'running';
  document.querySelector('#session-count').textContent =
    status.completedSessions +
    (status.completedSessions === 1
      ? ' session complete'
      : ' sessions complete');
}

function orderedTasks(tasks = []) {
  const ids = new Set(tasks.map((task) => task.id));
  const childrenByParent = new Map();
  for (const task of tasks) {
    if (!task.parentId || !ids.has(task.parentId)) continue;
    if (!childrenByParent.has(task.parentId)) childrenByParent.set(task.parentId, []);
    childrenByParent.get(task.parentId).push(task);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => (Date.parse(a.blockStart || a.createdAt) || 0) - (Date.parse(b.blockStart || b.createdAt) || 0));
  }
  const ordered = [];
  const visit = (task, depth) => {
    ordered.push({ task, depth });
    for (const child of childrenByParent.get(task.id) || []) visit(child, depth + 1);
  };
  for (const task of tasks) {
    if (task.parentId && ids.has(task.parentId)) continue;
    visit(task, 0);
  }
  return ordered;
}

function blockLabel(task) {
  if (!task.blockStart || !task.blockEnd) return '';
  const format = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${format(task.blockStart)}–${format(task.blockEnd)}`;
}

function renderTasks(tasks = []) {
  taskList.replaceChildren();
  document.querySelector('#task-count').textContent = String(
    tasks.filter((task) => task.status !== 'done').length,
  );
  for (const { task, depth } of orderedTasks(tasks)) {
    const item = document.createElement('li');
    if (depth) item.className = 'task-child';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.status === 'done';
    checkbox.disabled = checkbox.checked;
    checkbox.addEventListener('change', () =>
      window.curie.completeTask(task.id),
    );
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = (depth ? '↳ ' : '') + task.title;
    label.append(checkbox, title);

    const meta = document.createElement('span');
    meta.className = 'task-meta';
    meta.textContent = [
      task.subject,
      blockLabel(task),
      task.blockStart ? '' : task.due ? new Date(task.due).toLocaleString() : '',
      task.estimateMinutes ? `${task.estimateMinutes} min` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-task';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      if (window.confirm('Delete “' + task.title + '”?'))
        await window.curie.deleteTask(task.id);
    });
    item.append(label, meta, remove);
    taskList.append(item);
  }
}

function renderSnapshot(snapshot) {
  renderTasks(snapshot.tasks);
  renderReminders(snapshot.reminders);
  renderScheduledReminders(snapshot.tasks);
}

const shownReminderKeys = new Set();
function renderScheduledReminders(tasks = []) {
  const list = document.querySelector('#upcoming-reminders');
  const scheduled = tasks.filter((task) => task.status !== 'done' && task.reminder && ['pending', 'snoozed'].includes(task.reminder.state))
    .map((task) => ({
      task,
      at: task.reminder.nextAt || task.reminder.at || task.reminder.schedule?.[0],
      more: Math.max(0, (task.reminder.schedule?.length || 0) - 1),
    }))
    .filter(({ at }) => at && Number.isFinite(Date.parse(at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  list.replaceChildren(...scheduled.map(({ task, at, more }) => {
    const item = document.createElement('li');
    item.textContent = `${task.title} — ${new Date(at).toLocaleString()}${more ? ` (+${more} more)` : ''}`;
    return item;
  }));
}

async function resolveReminderWithPushback(active, action) {
  const result = await window.curie.resolveReminder(active.task.id, action);
  if (!result?.pushback) return;
  reminderCard.querySelector('.pushback')?.remove();
  const box = document.createElement('div');
  box.className = 'pushback';
  const message = document.createElement('p');
  message.textContent = result.pushback.message;
  const anyway = document.createElement('button');
  anyway.type = 'button';
  anyway.textContent = action === 'snooze' ? 'Snooze anyway' : 'Skip anyway';
  anyway.addEventListener('click', () => window.curie.resolveReminder(active.task.id, action, { confirm: true }));
  const keep = document.createElement('button');
  keep.type = 'button';
  keep.textContent = 'Keep working';
  keep.addEventListener('click', () => box.remove());
  box.append(message, anyway, keep);
  reminderCard.append(box);
}

function renderNotices(notices = []) {
  const section = document.querySelector('#notices');
  const list = document.querySelector('#notice-list');
  section.hidden = notices.length === 0;
  list.replaceChildren(...notices.map((notice) => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = notice.title || 'From Curie';
    const message = document.createElement('p');
    message.textContent = notice.message;
    const ack = document.createElement('button');
    ack.type = 'button';
    ack.textContent = 'Got it';
    ack.addEventListener('click', () => window.curie.ackNotice(notice.key));
    item.append(title, message, ack);
    return item;
  }));
}

function renderReminders(reminders = []) {
  reminderCard.replaceChildren();
  reminderCard.hidden = reminders.length === 0;
  const visibleIds = [];
  for (const active of reminders) {
    const title = document.createElement('strong');
    title.textContent = active.task.title;
    const due = document.createElement('p');
    due.textContent = `${active.missed ? 'Missed' : 'Due now'} · ${new Date(active.scheduledAt).toLocaleString()}`;
    reminderCard.append(title, due);
    for (const [action, label] of [['snooze', 'Snooze 10 min'], ['done', 'Done'], ['skip', 'Skip']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => resolveReminderWithPushback(active, action));
      reminderCard.append(button);
    }
    const key = `${active.task.id}-${active.task.reminder?.firedAt || active.scheduledAt}`;
    if (!shownReminderKeys.has(key)) { shownReminderKeys.add(key); visibleIds.push(key); }
  }
  if (visibleIds.length) window.curie.reportRemindersShown(visibleIds);
}

primaryButton.addEventListener('click', async () => {
  const status = await window.curie.getTimerStatus();
  await window.curie.timerAction(
    status.status === 'paused' ? 'resume' : 'start',
  );
});
pauseButton.addEventListener('click', () => window.curie.timerAction('pause'));
resetButton.addEventListener('click', () => window.curie.timerAction('reset'));
skipButton.addEventListener('click', () => window.curie.timerAction('skip'));

document
  .querySelector('#task-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#task-error');
    error.textContent = '';
    try {
      const dueValue = document.querySelector('#task-due').value;
      const reminderValue = document.querySelector('#task-reminder').value;
      const estimateValue = document.querySelector('#task-estimate').value;
      const reminderAtValue = document.querySelector('#task-reminder-at').value;
      if (reminderValue && reminderAtValue)
        throw new Error('Choose a reminder time or minutes before due.');
      const reminder = reminderAtValue
        ? { at: new Date(reminderAtValue).toISOString() }
        : reminderValue
          ? { minutesBefore: Number(reminderValue) }
          : null;
      await window.curie.addTask({
        title: document.querySelector('#task-title').value,
        subject: document.querySelector('#task-subject').value,
        due: dueValue ? new Date(dueValue).toISOString() : null,
        estimateMinutes: estimateValue ? Number(estimateValue) : null,
        reminder,
      });
      event.currentTarget.reset();
    } catch (cause) {
      error.textContent = cause.message || 'Could not save task.';
    }
  });

window.curie.onTimerUpdate(renderTimer);
window.curie.onTasksUpdate(renderSnapshot);
window.curie.onNoticesUpdate(renderNotices);
window.curie.onReminderActionError(({ message }) => {
  document.querySelector('#reminder-action-error').textContent = message;
});
window.curie.getSettings().then((settings) => {
  for (const [key, value] of Object.entries(settings)) {
    const input = settingsForm.elements.namedItem(key);
    if (!input || key.startsWith('has')) continue;
    if (input.type === 'checkbox') input.checked = value;
    else input.value = String(value);
  }
  document.querySelector('#settings-status').textContent =
    'API keys: Gemini ' + (settings.hasGeminiKey ? 'saved' : 'not set') +
    ', Groq ' + (settings.hasGroqKey ? 'saved' : 'not set');
});
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('#settings-status');
  const form = new FormData(settingsForm);
  const input = Object.fromEntries(form.entries());
  input.editedSettings = [...explicitlyEditedSettings];
  for (const field of ['workMinutes', 'breakMinutes', 'nudgeFrequency', 'maxNudgesPerDay', 'maxLlmCallsPerDay', 'geminiMaxOutputTokens', 'groqMaxOutputTokens']) input[field] = Number(input[field]);
  input.petScale = Number(input.petScale);
  for (const field of ['shortcutEnabled', 'launchAtLogin', 'reminderSound', 'clearGeminiKey', 'clearGroqKey', 'verboseAgentLog']) {
    input[field] = form.has(field);
  }
  try {
    const saved = await window.curie.saveSettings(input);
    explicitlyEditedSettings.clear();
    settingsForm.elements.geminiApiKey.value = '';
    settingsForm.elements.groqApiKey.value = '';
    status.textContent = 'Settings saved. API keys: Gemini ' +
      (saved.hasGeminiKey ? 'saved' : 'not set') + ', Groq ' +
      (saved.hasGroqKey ? 'saved' : 'not set');
  } catch (cause) {
    status.textContent = cause.message || 'Could not save settings.';
  }
});
Promise.all([
  window.curie.getTimerStatus(),
  window.curie.listTasks(),
  window.curie.listReminders(),
  window.curie.listNotices(),
]).then(([status, tasks, reminders, notices]) => {
  renderTimer(status);
  renderSnapshot({ tasks, reminders });
  renderNotices(notices);
});

function appendChatMessage(role, text, toolCalls = []) {
  const item = document.createElement('li');
  item.className = 'chat-message ' + role;
  const body = document.createElement('p');
  body.textContent = text;
  item.append(body);
  if (role === 'assistant' && toolCalls.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'What I did';
    const list = document.createElement('span');
    list.textContent = toolCalls.join(', ');
    details.append(summary, list);
    item.append(details);
  }
  document.querySelector('#chat-messages').append(item);
  item.scrollIntoView({ block: 'nearest' });
  return item;
}

const chatConfirmation = document.querySelector('#chat-confirmation');
const pendingChatNodes = new Map();
const confirmationCards = new Map();
const conversation = createConversationClient({
  windowName: 'panel',
  bridge: {
    send: (payload) => window.curie.sendConversation(payload),
    confirm: (payload) => window.curie.confirmConversation(payload),
    clear: (name) => window.curie.clearConversation(name),
    stage: (...args) => window.curie.conversationStage(...args),
    forwardError: (kind, message) => window.curie.rendererError(kind, message),
  },
  onPending: ({ requestId, text }) => pendingChatNodes.set(requestId, appendChatMessage('assistant', text)),
  onConfirmation: (value) => {
    const pending = pendingChatNodes.get(value.requestId);
    if (pending) { pending.querySelector('p').textContent = 'Proposed changes:'; pendingChatNodes.delete(value.requestId); }
    const card = document.createElement('li');
    card.className = 'chat-message assistant chat-confirmation confirmation-card';
    const proposalList = document.createElement('ul');
    const status = document.createElement('p'); status.dataset.confirmationStatus = ''; status.setAttribute('aria-live', 'polite');
    const confirmButton = document.createElement('button'); confirmButton.type = 'button'; confirmButton.dataset.confirm = ''; confirmButton.textContent = 'Confirm all';
    const cancelButton = document.createElement('button'); cancelButton.type = 'button'; cancelButton.dataset.cancel = ''; cancelButton.textContent = 'Cancel all';
    card.append(proposalList, status, confirmButton, cancelButton);
    document.querySelector('#chat-messages').append(card);
    confirmationCards.set(value.requestId, card);
    renderConfirmationCard({ container: card, list: proposalList, proposals: value.proposals,
      requestId: value.requestId, confirmationToken: value.confirmationToken,
      onConfirm: (requestId, confirmationToken) => conversation.confirm(requestId, true, confirmationToken),
      onCancel: (requestId, confirmationToken) => conversation.confirm(requestId, false, confirmationToken) });
  },
  onProposalResults: (result) => {
    const card = confirmationCards.get(result.requestId);
    if (!card) return;
    resolveConfirmationCard(card, (result.items || []).map((item) => item.statusText).join(' · ') || 'Saved');
  },
  onOutcome: ({ requestId, text, toolCalls }) => {
    const pending = pendingChatNodes.get(requestId);
    if (pending) { pending.querySelector('p').textContent = text; pendingChatNodes.delete(requestId); }
    else appendChatMessage('assistant', text, toolCalls || []);
    if (toolCalls?.length && pending) {
      const replacement = appendChatMessage('assistant', '', toolCalls);
      pending.replaceWith(replacement);
    }
  },
  onClear: () => { document.querySelector('#chat-messages').replaceChildren(); pendingChatNodes.clear(); chatConfirmation.hidden = true; document.querySelector('#chat-input').value = ''; },
});
document.querySelector('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const message = input.value.trim();
  if (!message) return;
  appendChatMessage('user', message);
  input.value = '';
  conversation.request(message);
});
document.querySelector('#new-chat').addEventListener('click', () => conversation.newChat());
window.curie.onConversationUpdate((result) => conversation.resolve(result));
window.curie.onConversationConfirmation((result) => conversation.confirmation(result));
window.curie.onConversationProposalResults((result) => conversation.proposalResults(result));
window.addEventListener('beforeunload', () => window.curie.closeConversation());
