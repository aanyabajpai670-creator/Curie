export function createConfirmationGate({ timeoutMs = 5 * 60_000, setTimer = setTimeout, clearTimer = clearTimeout, onResolve = () => {} } = {}) {
  let settlePending;
  let timer;
  function request(showPrompt) {
    if (settlePending) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      settlePending = (value) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        timer = undefined;
        settlePending = undefined;
        resolve(Boolean(value));
        onResolve(Boolean(value));
      };
      timer = setTimer(() => settlePending?.(false), timeoutMs);
      showPrompt();
    });
  }
  return { request, resolve: (value) => settlePending?.(value), cancel: () => settlePending?.(false), isPending: () => Boolean(settlePending) };
}
