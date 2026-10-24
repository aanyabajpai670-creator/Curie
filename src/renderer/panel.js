const timerDisplay = document.querySelector('#timer');
const phaseLabel = document.querySelector('#phase');
const primaryButton = document.querySelector('#primary');
const pauseButton = document.querySelector('#pause');
const resetButton = document.querySelector('#reset');
const skipButton = document.querySelector('#skip');
const taskList = document.querySelector('#task-list');
const reminderCard = document.querySelector('#reminder');
const settingsForm = document.querySelector('#settings-form');

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
  phaseLabel.textContent = status.phase === 'break' ? 'BREAK' : 'FOCUS SESSION';
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

function renderTasks(tasks = []) {
  taskList.replaceChildren();
  document.querySelector('#task-count').textContent = String(
    tasks.filter((task) => task.status !== 'done').length,
  );
  for (const task of tasks) {
    const item = document.createElement('li');
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
    title.textContent = task.title;
    label.append(checkbox, title);

    const meta = document.createElement('span');
    meta.className = 'task-meta';
    meta.textContent = [
      task.subject,
      task.due ? new Date(task.due).toLocaleString() : '',
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
}

function renderReminders(reminders = []) {
  const active = reminders[0];
  reminderCard.replaceChildren();
  reminderCard.hidden = !active;
  if (!active) return;
  const title = document.createElement('strong');
  title.textContent = active.task.title;
  const note = document.createElement('p');
  note.textContent = active.missed ? 'Missed reminder' : 'Reminder';
  reminderCard.append(title, note);
  for (const [action, label] of [
    ['snooze', 'Snooze 10 min'],
    ['done', 'Done'],
    ['dismiss', 'Dismiss'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () =>
      window.curie.resolveReminder(active.task.id, action),
    );
    reminderCard.append(button);
  }
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
  for (const field of ['workMinutes', 'breakMinutes', 'nudgeFrequency', 'maxNudgesPerDay']) input[field] = Number(input[field]);
  input.petScale = Number(input.petScale);
  for (const field of ['shortcutEnabled', 'launchAtLogin', 'clearGeminiKey', 'clearGroqKey']) {
    input[field] = form.has(field);
  }
  try {
    const saved = await window.curie.saveSettings(input);
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
]).then(([status, tasks, reminders]) => {
  renderTimer(status);
  renderSnapshot({ tasks, reminders });
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
}

document
  .querySelector('#chat-form')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#chat-input');
    const sendButton = document.querySelector('#chat-send');
    const message = input.value.trim();
    if (!message) return;
    appendChatMessage('user', message);
    input.value = '';
    sendButton.disabled = true;
    try {
      const reply = await window.curie.sendChat(message);
      appendChatMessage('assistant', reply.text, reply.toolCalls);
    } catch (cause) {
      appendChatMessage(
        'assistant',
        cause.message || 'Curie could not send that message.',
      );
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  });
