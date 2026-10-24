# How the agent works

This walkthrough uses the request: “Add physics chapter 5 revision, 2 hours, due Nov 10.” It illustrates the data path; the model's exact wording can vary.

1. The panel trims the message and sends it through `window.curie.sendChat`. The preload bridge invokes the `agent:send` IPC handler; page JavaScript cannot call Node or make provider requests directly.
2. The main process passes the message to the agent controller. The controller rejects blank messages and anything longer than 2,000 characters.
3. The controller builds a system message for this request. It includes the current local date and time, the configured timezone, and a small list of active tasks. Each task contains only its id, title, subject, due time, estimate, and status.
4. The provider client tries the configured Gemini model first and Groq second. Only providers with keys are eligible. A 429, server error, timeout, or network failure can trigger fallback; a failed provider enters a short cooldown.
5. The model can answer normally or return a function call. For this example it may call `add_task` with a title, `estimateMinutes: 120`, and a due timestamp. The prompt says to resolve a month/day without a year to its next occurrence and to use 23:59 local time when only a date is given.
6. The agent loop in `src/agent/loop.js` parses that function call and passes it to the allowlisted tool executor. The executor validates task fields and writes the task through the task service to the local JSON store.
7. The loop adds the tool result to the conversation and asks the model for a short user-facing confirmation. It stops when the model returns plain text or reaches its six-step limit.
8. The panel displays the answer and, when a tool ran, a collapsed “What I did” line. The task list updates independently from the service event.

If the message does not supply enough information to create a useful deadline, the system prompt tells the model to ask one concise question. A provider failure shows an error; it does not fabricate a successful task. The app logs neither the message nor the API key.

## Code to follow

Read `src/agent/controller.js` first, then `src/agent/loop.js`, `src/agent/providers.js`, `src/agent/prompts.js`, and `src/agent/tools.js`. Tests for each boundary live in `tests/agent-controller.test.js`, `tests/agent-loop.test.js`, `tests/providers.test.js`, and `tests/agent-tools.test.js`.
