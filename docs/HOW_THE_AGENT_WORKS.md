# How the agent works

This example uses: “Remind me tomorrow at 5pm to send the draft.” The provider resolves the relative time using the current local date/time and `Asia/Kolkata` supplied on every request.

1. The user opens Ask Curie from the right-click menu or `Ctrl+Option+A`. Both call the same `openAskWindow` function. The window uses the existing calm owner and restores the previous calm mode when it closes unless the user changed calm manually.
2. Enter sends the message through `ask-window-preload.js`. The main process rejects empty or oversized messages and rejects another request while one is running.
3. The controller supplies current date, time, timezone, and at most 50 open tasks with only id, title, due time, and status. Gemini runs first and Groq is the fallback. Each provider HTTP request has a 20-second timeout, 512-token cap, and counts against the stored 400/day and 20/rolling-minute limits.
4. The model proposes `add_task` with a reminder ISO value such as `2026-10-29T17:00:00+05:30`. The tool validates title length and ISO timestamps, but the task is not written yet.
5. The window shows the proposed action in human language and offers Confirm all / Cancel all. Several writes from one response are grouped. Waiting for the user is asynchronous and excluded from provider timeout and the five-iteration loop cap. Closing the window, Escape, or five minutes without an answer cancels.
6. Confirm executes each validated write through the existing task service. A task and its optional reminder are written together. Cancel sends `user cancelled` to the model, which can respond without claiming success.
7. The existing reminder scheduler handles that reminder. Explicit reminders fire at their chosen time even in quiet hours and catch up after sleep. Automatic nudges remain local and continue to obey quiet hours and their three-per-day default cap.
8. Only six tools are available: `add_task`, `list_tasks`, `complete_task`, `delete_task`, `set_reminder`, and `start_focus`. List and focus start are immediate; the four task writes require confirmation. Invalid or unknown calls get one retryable error; a repeated identical invalid call stops the loop. The loop caps at five provider responses.

The provider fixtures in tests follow provider documentation schemas, not live captured responses. Tests cover JSON-string and object arguments, omitted IDs, multiple calls, empty tool-call content, invalid/truncated JSON, finish reasons, safe errors, fallback, caps, confirmation, and reminder catch-up. The app does not log API keys, user messages, or model replies.

## Code to follow

Read `src/agent/controller.js`, then `src/agent/loop.js`, `src/agent/providers.js`, `src/agent/prompts.js`, and `src/agent/tools.js`. Main-process windows and IPC are in `src/main/main.js`, `src/main/ask-window.js`, and `src/main/key-window.js`. Tests are in `tests/agent-loop.test.js`, `tests/agent-tools.test.js`, `tests/providers.test.js`, and `tests/agent-reminders.test.js`.
