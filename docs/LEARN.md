# Learn Curie

## Suggested reading order

1. `src/renderer/pet.js` and `src/renderer/panel.js` — what the user sees and how events reach the bridge.
2. `src/main/preload.js` — the small, explicit renderer API.
3. `src/main/main.js` — how Electron wires windows and services together.
4. `src/core/timer.js` and `tests/timer.test.js` — a pure state machine with an injectable clock.
5. `src/core/tasks.js`, `src/core/scheduler.js`, and `src/core/reminder-plan.js` — task validation, persistence, reminder transitions, and effort-based planning.
6. `src/agent/controller.js` — message checks and minimal task context.
7. `src/agent/loop.js` — the tool-call conversation loop.
8. `src/agent/prompts.js` and `src/agent/tools.js` — model instructions and the actions Curie permits.
9. `src/agent/providers.js` — provider order, timeouts, fallback, cooldown, and call caps.
10. `src/main/settings-store.js` and `src/main/nudge-service.js` — encrypted secrets, validated settings, and local proactive rules.
11. `src/main/shortcut-runner.js` — optional local macOS automation with safe process arguments.
12. `tests/` — executable examples of expected behavior and failure cases.

## Self-test questions

Try to answer these without looking at the answer key.

1. Why does the timer core accept a clock function?
2. What changes in the timer when a work phase ends?
3. Which renderer API is used to start a timer, and where is it handled?
4. What fields of an active task can the agent see?
5. What does the agent do after a model returns a tool call?
6. What stops the agent loop from continuing forever?
7. Which provider errors can trigger fallback?
8. Why are tool descriptions and the system prompt separate from tool implementations?
9. What happens before Curie deletes a task at the agent's request?
10. Where are API keys kept, and what happens if secure storage is unavailable?
11. Do deadline nudges make a provider request?
12. How does Curie avoid shell interpretation when it runs a macOS Shortcut?

## Short answer key

1. Tests can move time forward deterministically without sleeping.
2. The timer records a completed session and starts the break deadline.
3. `window.curie.timerAction`, exposed in `src/main/preload.js`, invokes the main `timer:action` handler.
4. Id, title, subject, due, estimate, and status for at most 20 active tasks.
5. It validates and executes the named local tool, adds the result to the conversation, and requests the next model response.
6. It stops on a plain-text answer or after six model steps.
7. HTTP 429, HTTP 5xx, timeouts, aborts, and network `TypeError`s.
8. This keeps model-facing wording/schema distinct from the code that changes local data.
9. The tool requests a confirmation dialog; cancellation is returned to the model and deletion does not occur.
10. Encrypted in the local settings JSON using Electron `safeStorage`; saving is refused if OS-backed encryption is unavailable.
11. No. They use local deadline rules and a plain template.
12. It calls `execFile` with an argument array and no shell.
