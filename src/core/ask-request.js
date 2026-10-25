export const ASK_REQUEST_STATES = Object.freeze(['idle', 'pending', 'confirm', 'reply', 'error']);

export function createAskRequestState() {
  let state = { status: 'idle', text: '', requestId: 0 };
  return {
    current: () => ({ ...state }),
    begin: (requestId = state.requestId + 1) => set('pending', '', requestId),
    confirmation: (text = 'Confirm these changes?') => set('confirm', text),
    resolve: ({ outcome, text, requestId = state.requestId } = {}) => {
      if (requestId !== state.requestId) return { ...state };
      if (outcome === 'pending') return set('pending', String(text || 'thinking...'), requestId);
      if (!['confirm', 'reply', 'error'].includes(outcome) || !String(text || '').trim()) {
        return set('error', `No answer produced: ${String(text || 'the request returned no reply or proposal.')}`, requestId);
      }
      return set(outcome, String(text).trim(), requestId);
    },
    timeout: (text = 'Request timed out. Please try again.') => state.status === 'pending' ? set('error', text) : { ...state },
    reset: () => set('idle', '', state.requestId),
  };
  function set(status, text, requestId = state.requestId) {
    state = { status, text, requestId };
    return { ...state };
  }
}
