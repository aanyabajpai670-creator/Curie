import { reminderReplyFailure } from '../core/reminder-reply.js';

export function createConversationService({ agent, deliver, getWindow, openPanel, log = () => {}, clock = Date.now, randomToken = () => `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`, timeoutMs = 5 * 60_000 }) {
  const histories = new Map();
  const active = new Map();
  const pendingByWindow = new Map();
  function stage(id, windowName, name, detail = '') { log(`conversation.${name}.${safe(id)}.${safe(windowName)}${detail ? `.${safe(detail)}` : ''}`); }

  async function request({ id, windowName, message, context }) {
    const targetName = windowName === 'ask' ? 'ask' : windowName === 'reminder' ? 'reminder' : 'panel';
    stage(id, targetName, 'ipc-received');
    const pending = pendingByWindow.get(targetName) || [...pendingByWindow.values()][0];
    if (pending) {
      const text = /^(yes|no|confirm|cancel)[.! ]*$/i.test(String(message).trim())
        ? 'Use the Confirm button below.'
        : 'A confirmation is waiting. Use its Confirm or Cancel button first.';
      await sendOutcome({ id, targetName, outcome: 'reply', text, toolCalls: [] });
      return;
    }
    if (active.size > 0) {
      await sendOutcome({ id, targetName, outcome: 'error', text: 'A request is already in progress.', toolCalls: [] });
      return;
    }
    const aborter = new AbortController();
    const activeRequest = { id, aborter, cardShown: false };
    active.set(targetName, activeRequest);
    stage(id, targetName, 'loop-start');
    const historyLimit = targetName === 'reminder' ? 6 : 10;
    const history = [...(histories.get(targetName) || [])].slice(-historyLimit);
    try {
      const result = await agent.send(message, {
        signal: aborter.signal,
        history,
        context: targetName === 'reminder' ? context : undefined,
        requestId: id,
        windowName: targetName,
        confirmProposals: (proposals) => { activeRequest.cardShown = true; return requestConfirmation({ id, windowName: targetName, proposals }); },
        onProposalResults: (items) => {
          for (const item of items) {
            const tool = /^[a-z0-9_]+$/i.test(item.name || '') ? item.name : 'unknown';
            const resolution = ['confirmed', 'cancelled', 'error'].includes(item.resolution) ? item.resolution : 'error';
            log(`proposal.resolved.${tool}.${resolution}.${safe(id)}`);
          }
          const confirmationWindow = activeRequest.confirmationWindowName || targetName;
          const payload = { requestId: id, items: items.map(({ label, statusText, ok }) => ({ label, statusText, ok })) };
          const receipt = deliver(confirmationWindow, 'conversation:proposal-results', payload);
          stage(id, confirmationWindow, 'result-sent', `conversation_proposal_results-${receipt?.targetId ?? 'none'}-${receipt?.delivered ? 'sent' : 'failed'}`);
        },
      });
      const text = String(result?.text || '').trim();
      const outcome = result?.errorType ? 'error' : (result?.outcome || (text ? 'reply' : 'error'));
      const safeText = text || `No answer produced: ${result?.errorType || 'the model returned no reply or proposal.'}`;
      if (!result?.errorType && Array.isArray(result?.messages)) histories.set(targetName, result.messages.filter((item) => ['user', 'assistant', 'tool'].includes(item.role)).slice(-historyLimit));
      stage(id, targetName, 'loop-end', outcome);
      await sendOutcome({ id, targetName, outcome, text: safeText, toolCalls: result?.toolCalls || [] });
    } catch (error) {
      const providerFailed = targetName === 'reminder' && reminderReplyFailure(error) === "Can't think right now, use the buttons.";
      if (targetName === 'reminder' && providerFailed) log(`reminder.reply.error.provider_failure.${safe(id)}`);
      const text = targetName === 'reminder' ? reminderReplyFailure(error) : friendlyError(error);
      stage(id, targetName, 'loop-end', 'error');
      await sendOutcome({ id, targetName, outcome: 'error', text, toolCalls: [] });
    } finally {
      if (active.get(targetName)?.id === id) active.delete(targetName);
      const pendingForRequest = pendingByWindow.get(targetName);
      if (pendingForRequest?.id === id) pendingByWindow.delete(targetName);
    }
  }

  function requestConfirmation({ id, windowName, proposals }) {
    return new Promise((resolve) => {
      const pending = { id, windowName, resolve, proposals, createdAt: clock(), token: randomToken(), timer: null };
      pending.timer = setTimeout(() => resolvePending(pending, false), timeoutMs);
      pendingByWindow.set(windowName, pending);
      let target = getWindow(windowName);
      let targetName = windowName;
      if (!target || target.isDestroyed?.()) { target = ensureFallbackPanel(); targetName = 'panel'; }
      log(`proposal.confirm-card.${safe(id)}.${safe(targetName)}.${proposals.length}`);
      let receipt = target && !target.isDestroyed?.()
        ? deliver(targetName, 'conversation:confirmation', { requestId: id, confirmationToken: pending.token, proposals: proposals.map(({ label }) => ({ label })) })
        : null;
      if (!receipt?.delivered && targetName !== 'panel') {
        target = ensureFallbackPanel(); targetName = 'panel';
        receipt = target && !target.isDestroyed?.()
          ? deliver(targetName, 'conversation:confirmation', { requestId: id, confirmationToken: pending.token, proposals: proposals.map(({ label }) => ({ label })) })
          : null;
      }
      if (pending.windowName !== targetName) { pendingByWindow.delete(pending.windowName); pending.windowName = targetName; pendingByWindow.set(targetName, pending); }
      const activeRequest = active.get(windowName);
      if (activeRequest?.id === id) activeRequest.confirmationWindowName = targetName;
      stage(id, targetName, 'result-sent', `conversation_confirmation-${receipt?.targetId ?? 'none'}-${receipt?.exists ? 'exists' : 'missing'}-${receipt?.delivered ? 'sent' : 'failed'}-${receipt?.queued ? 'queued' : 'direct'}`);
      if (!receipt?.delivered) resolvePending(pending, false);
    });
  }

  function confirm({ id, windowName, approved, confirmationToken, buttonOrigin }) {
    const pending = pendingByWindow.get(windowName);
    if (!buttonOrigin || !pending || pending.id !== id || pending.token !== confirmationToken) return false;
    resolvePending(pending, Boolean(approved));
    return true;
  }

  function resolvePending(pending, approved) {
    if (pendingByWindow.get(pending.windowName) === pending) pendingByWindow.delete(pending.windowName);
    clearTimeout(pending.timer);
    pending.resolve(Boolean(approved));
  }

  function clearSession(windowName) {
    histories.delete(windowName);
    const entry = active.get(windowName);
    if (entry) { entry.cardShown = false; entry.aborter.abort(); }
    const pending = pendingByWindow.get(windowName) || (entry ? [...pendingByWindow.values()].find((item) => item.id === entry.id) : null);
    if (pending) {
      const request = [...active.values()].find((item) => item.id === pending.id);
      if (request) { request.cardShown = false; request.aborter.abort(); }
      resolvePending(pending, false);
    }
  }

  function recordLocalReply({ windowName, message, text }) {
    const historyLimit = windowName === 'reminder' ? 6 : 10;
    const history = histories.get(windowName) || [];
    history.push({ role: 'user', content: String(message ?? '') }, { role: 'assistant', content: String(text ?? '') });
    histories.set(windowName, history.slice(-historyLimit));
  }

  async function sendOutcome({ id, targetName, outcome, text, toolCalls }) {
    const originName = targetName;
    let target = getWindow(targetName);
    if (!target || target.isDestroyed?.()) {
      log(`conversation.result-target-missing.${safe(id)}.${safe(targetName)}`);
      target = ensureFallbackPanel();
      targetName = 'panel';
    }
    if (!target || target.isDestroyed?.()) {
      log(`conversation.result-undelivered.${safe(id)}.${safe(targetName)}`);
      stage(id, targetName, 'result-sent', 'conversation_update-none-missing-failed');
      return false;
    }
    let receipt = deliver(targetName, 'conversation:update', { requestId: id, outcome, text, toolCalls, fallback: targetName !== originName });
    if (!receipt?.delivered) {
      target = ensureFallbackPanel();
      targetName = 'panel';
      if (target && !target.isDestroyed?.()) receipt = deliver(targetName, 'conversation:update', { requestId: id, outcome, text, toolCalls, fallback: true });
    }
    stage(id, targetName, 'result-sent', `conversation_update-${receipt?.targetId ?? 'none'}-${receipt?.exists ? 'exists' : 'missing'}-${receipt?.delivered ? 'sent' : 'failed'}-${receipt?.queued ? 'queued' : 'direct'}`);
    return Boolean(receipt?.delivered);
  }

  function ensureFallbackPanel() {
    openPanel();
    return getWindow('panel');
  }

  function snapshot() {
    return { histories: Object.fromEntries([...histories].map(([key, value]) => [key, value.map((item) => ({ ...item }))])), active: [...active.keys()], pending: [...pendingByWindow.entries()].map(([windowName, item]) => ({ windowName, id: item.id })) };
  }
  return { request, confirm, clearSession, recordLocalReply, snapshot };
}

function friendlyError(error) {
  const message = String(error?.message || 'Unknown error.');
  if (/daily.*limit|minute.*limit|provider|authentication|network|API key|timed out|HTTP \d{3}|rejected the request|Unknown provider error/i.test(message)) return message;
  if (error?.code) return `Unknown error (${String(error.code).slice(0, 40)}).`;
  return message || 'Unknown error.';
}
function safe(value) { return String(value || 'none').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80); }
