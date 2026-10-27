export function createConversationClient({ windowName, bridge, onPending = () => {}, onConfirmation = () => {}, onProposalResults = () => {}, onOutcome = () => {}, onClear = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let sequence = 0;
  const completed = new Set();
  const confirmations = new Set();
  const timers = new Map();

  function request(message) {
    const requestId = `${windowName}-${Date.now().toString(36)}-${++sequence}`;
    onPending({ requestId, text: 'thinking...' });
    timers.set(requestId, setTimer(() => resolve({ requestId, outcome: 'error', text: 'Request timed out. Please try again.' }), 60_000));
    bridge.send({ requestId, windowName, message });
    return requestId;
  }

  function resolve(result) {
    if (!result || typeof result.requestId !== 'string') return false;
    bridge.stage(result.requestId, windowName, 'renderer-received');
    if (completed.has(result.requestId)) return false;
    const text = String(result.text || '').trim() || 'No answer produced: result was empty.';
    const outcome = ['reply', 'error'].includes(result.outcome) ? result.outcome : 'error';
    completed.add(result.requestId);
    const timer = timers.get(result.requestId);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(result.requestId);
    try {
      onOutcome({ ...result, outcome, text });
      bridge.stage(result.requestId, windowName, 'renderer-rendered', outcome);
    } catch (error) {
      bridge.stage(result.requestId, windowName, 'renderer-rendered', 'render-error');
      bridge.forwardError('render-error', error?.message || 'render failure');
    }
    return true;
  }

  function confirmation(result) {
    bridge.stage(result.requestId, windowName, 'renderer-received', 'confirmation');
    if (completed.has(result.requestId) || confirmations.has(result.requestId)) return false;
    confirmations.add(result.requestId);
    const timer = timers.get(result.requestId);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(result.requestId);
    try {
      onConfirmation(result);
      bridge.stage(result.requestId, windowName, 'renderer-rendered', 'confirmation');
    } catch (error) {
      bridge.stage(result.requestId, windowName, 'renderer-rendered', 'render-error');
      bridge.forwardError('render-error', error?.message || 'confirmation render failure');
    }
    return true;
  }

  function proposalResults(result) {
    if (!result || typeof result.requestId !== 'string') return false;
    try { onProposalResults(result); return true; }
    catch (error) { bridge.forwardError('confirmation-result-render-error', error?.message || 'confirmation result render failure'); return false; }
  }

  return {
    request,
    resolve,
    confirmation,
    proposalResults,
    confirm(requestId, approved, confirmationToken) { bridge.confirm({ requestId, windowName, approved, confirmationToken, buttonOrigin: true }); },
    newChat() { bridge.clear(windowName); onClear(); },
    dispose() { for (const timer of timers.values()) clearTimer(timer); timers.clear(); },
    snapshot: () => ({ completed: [...completed], confirmations: [...confirmations], pendingTimers: [...timers.keys()] }),
  };
}

export function renderConfirmationCard({ container, list, proposals, requestId, confirmationToken, onConfirm, onCancel }) {
  list.replaceChildren(...proposals.map((proposal) => {
    const item = document.createElement('li');
    item.textContent = proposal.label;
    return item;
  }));
  container.hidden = false;
  const confirmButton = container.querySelector('[data-confirm]');
  const cancelButton = container.querySelector('[data-cancel]');
  const status = container.querySelector('[data-confirmation-status]');
  const lifecycle = createConfirmationLifecycle({
    onStatus: (state, text) => {
      container.dataset.state = state;
      status.textContent = text;
      if (state !== 'pending') { confirmButton.disabled = true; cancelButton.disabled = true; }
      if (state === 'done') { confirmButton.hidden = true; cancelButton.hidden = true; }
    },
    onConfirm: () => onConfirm(requestId, confirmationToken),
    onCancel: () => onCancel(requestId, confirmationToken),
  });
  confirmButton.onclick = () => lifecycle.activate(true);
  cancelButton.onclick = () => lifecycle.activate(false);
  container.__curieConfirmationLifecycle = lifecycle;
}

export function resolveConfirmationCard(container, statusText) {
  if (!container) return;
  if (container.__curieConfirmationLifecycle) container.__curieConfirmationLifecycle.resolve(statusText);
  else {
    container.dataset.state = 'done';
    const status = container.querySelector('[data-confirmation-status]');
    if (status) status.textContent = statusText;
  }
  for (const button of container.querySelectorAll('[data-confirm], [data-cancel]')) {
    button.disabled = true;
    button.hidden = true;
  }
}

export function createConfirmationLifecycle({ onConfirm = () => {}, onCancel = () => {}, onStatus = () => {} } = {}) {
  let state = 'pending';
  return {
    activate(approved) {
      if (state !== 'pending') return false;
      state = approved ? 'saving' : 'cancelling';
      onStatus(state, approved ? 'Saving...' : 'Cancelling...');
      if (approved) onConfirm(); else onCancel();
      return true;
    },
    resolve(text) {
      if (state === 'done') return false;
      state = 'done';
      onStatus('done', String(text || 'Failed: no result returned.'));
      return true;
    },
    state: () => state,
  };
}
