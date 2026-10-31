# Curie status

## Current phase: reminder pushback and repository cleanup (implementation complete; owner commits)

### Phase 0 — scaffold (committed as b8f1846)

- Works: project folders, Electron entry point, isolated preload bridge, renderer placeholder, npm package and lockfile, lint/test/build scripts, MIT license, environment example, and sprite credit placeholder.
- Test, lint, and syntax build passed.
- Launch note: npm start reaches the installed Electron binary, but this machine's binary aborts with SIGABRT before reporting an app error. Even electron --version aborts, so GUI launch could not be verified here.

### Phase 1 — pet window (committed as ec89566)

- Works in code: frameless transparent always-on-top pet window, drag position saved under Electron userData, all-workspace visibility on macOS, JSON-configured sprite animation, left-click ACTIVE/CALM toggle, right-click menu, and tray menu with **Open panel**.
- The supplied 12-frame sprite is installed at assets/pink_slime_sheet_16px.png.
- Placeholder: alert, sleep, and done effects reuse existing frames until the owner draws custom frames.

### Phase 2 — study timer (committed as f8669a9)

- Works in code: configurable 25/5 minute work and break lengths; start, pause, resume, reset, skip, and status; persisted active deadlines and paused time; restart and sleep catch-up; native end notifications; tray and panel controls; and pet state updates.
- The pure timer uses an injectable clock. Timer tests cover transitions, pause/resume, reset, skip, restart, and catch-up after drift.

### Phase 3 — tasks and reminders (committed as 564b2f7)

- Works in code: validated JSON task CRUD under Electron userData; exact-time and minutes-before-due reminders; 30-second checks plus launch/resume catch-up; missed labels; 10-minute snooze, done, and skip actions; grouped in-app reminder bubble; alert pet state; and task list controls with delete confirmation.
- Due/reminder timestamps require ISO forms with a timezone and normalize to UTC for scheduling.

### Phase 4 — agent (committed as 8a9e630)

- Works in code: a commented tool loop under 150 lines, local task/timer tools, UI confirmation before agent deletions, minimal task context, dynamic date/time/timezone prompt, panel chat, and collapsed tool activity.
- Provider defaults: Gemini `gemini-3.5-flash-lite` (configured in one settings value shared by the agent and key test) and Groq `openai/gpt-oss-120b`. Free-tier API keys only; no automatic paid upgrade.
- Providers can read keys from the launch environment or from encrypted Settings storage.
- Mocked tests cover single and multiple calls, tool error retry, max steps, 429/5xx/timeout fallback and cooldown, task minimization, and delete confirmation. A live provider call still needs an owner-supplied key.
- Test: npm test (33 passing); lint: npm run lint; format: Prettier; syntax build check: npm run build.
- GUI launch still needs verification on a machine where Electron starts; this host aborts even the Electron version command.

## Phase commits

- Phase 0: b8f1846 — scaffold Curie desktop app.
- Phase 1: ec89566 — add animated desktop pet window.
- Phase 2: f8669a9 — add persistent study timer.
- Phase 3: 564b2f7 — add task store and reminders.
- Phase 4: 8a9e630 — add provider-backed study agent.
- Phase 5: 93dda0a — add local deadline nudges.
- Phase 6: 685555c — add optional focus shortcut automation.
- Phase 7: 0ecf23f — add encrypted app settings.
- Phase 7 follow-up: 9e91dac — add configurable chat request limits.
- Phase 8: c7db7f5 — package unsigned macOS and Windows builds.
- Phase 9: owner documentation and manual checklist (current HEAD).

### Phase 8 — packaging (committed as c7db7f5)

- electron-builder 26 targets unsigned macOS DMG/ZIP and Windows NSIS installers. No signing or notarization account is used.
- Electron was updated to 45.0.0 after the prior runtime's high-severity audit findings; current dependency audit reports zero vulnerabilities.
- README includes unsigned installation and Google AI Studio key setup instructions.
- Built `Curie-0.1.0-universal.dmg` and `Curie-0.1.0-universal-mac.zip` for Intel and Apple Silicon, plus `Curie Setup 0.1.0.exe` for Windows x64. Builder logs confirm signing was skipped.
- Electron's packaged binary still exits with SIGABRT when invoked on this host; package generation succeeds but GUI launch remains unverified.

### Phase 5 — proactive nudges (committed as 93dda0a)

- Local 30-minute checks compare remaining estimated work with task deadlines. Quiet hours default to 23:00–07:00 Asia/Kolkata, nudges cap at 3 per local day, and each task is nudged at most once per day. State is saved locally; nudges use a plain template and make no LLM calls.
- Tests cover deadline pressure, quiet hours, timezone, daily cap, duplicate suppression, and restart persistence (40 passing overall).

### Phase 6 — focus mode (committed as 685555c)

- Optional macOS Shortcuts integration can run user-configured start/end shortcuts with work timer transitions. It is disabled by default and uses `execFile` with argument arrays, so shortcut names are not interpreted by a shell.
- Missing shortcuts or failed commands produce one setup notification per shortcut name. Other platforms and blank names are no-ops.
- Tests cover disabled and non-macOS behavior, safe argument passing, and one-time setup hints.
- Shortcut names and enablement are configurable in Settings.

### Phase 7 — settings (complete; commits 0ecf23f and 9e91dac)

- Settings UI covers work and break lengths, timezone, quiet hours, local nudge frequency and daily cap, rolling chat limits per hour and 24 hours, provider model names, encrypted Gemini/Groq keys, macOS shortcut names, pet size, and launch at login.
- Electron `safeStorage` protects stored provider keys; Curie refuses key storage when OS-backed encryption is unavailable. Keys are never returned to the renderer.
- Timer changes affect future sessions and preserve a paused countdown. Provider and nudge configuration updates while the app is running.
- Electron 45 exits with SIGABRT even for `--version`; GUI launch and visual settings review remain unverified on this host.

### Phase 9 — owner documentation (complete)

- Added `docs/ARCHITECTURE.md`, `docs/HOW_THE_AGENT_WORKS.md`, `docs/LEARN.md`, and `docs/MANUAL_TEST_CHECKLIST.md`.
- Owner TODO markers remain for rewriting the prompt/tool descriptions, replacing placeholder animation frames, tuning the nudge rule, and filling in sprite credit details.
- Test: `npm test` (48 passing); lint: `npm run lint`; syntax build: `npm run build`; formatting: Prettier; dependency audit: zero vulnerabilities.
- `npm start` and visual/manual feature checks remain unverified because Electron 45 exits with SIGABRT on this host. Installer generation succeeded for universal macOS and Windows x64 targets.

## Pet behavior follow-up (commits a5de374, 8bcab82, 5c360c0)

- Works in code: left click toggles ACTIVE and CALM, with `CALM pending` shown through the blink and settle to neutral frame 0 or 6. The canvas no longer opens the panel; the right-click menu and tray menu do.
- The pet has five sprite pixels of hop headroom by default. `assets/behaviour.json` sets the eased lift profile and 600–1600 ms active rests. The renderer interpolates lift at up to 60 fps while sprite frames still advance every 80 ms. A grounded shadow shrinks and fades during flight.
- ACTIVE rests and breathes between hops. WANDER moves horizontally only while airborne and hops continuously during travel. CALM holds a neutral frame, breathes, and suppresses hopping.
- Updated automated suite: 64 passing; `npm run lint`, `npm run build`, and `git diff --check` pass. The preview server was checked in a browser: real canvas clicks changed the readout through CALM pending to CALM and back to ACTIVE.
- Electron desktop interaction remains unverified on this host because its installed binary exits with SIGABRT. Hand checks are listed in `docs/BEHAVIOUR_HAND_TESTS.md`.

## Desktop reliability follow-up (commits efe28ba, 4a575a2, eb1f0ed, 65dc593; final docs/doctor/smoke changes pending commit)

### Verified by tests

- `PetPositionController` owns native pet position writes; unit tests cover pointer-relative drag, work-area union clamping, integer coordinates, stale restore rejection, drag suspension, and persistence on drag end.
- Main-process gaze logic is pure and tested for heartbeat resend, NaN/out-of-display cursor handling, far-left to right recovery, tick exception containment, hysteresis, and renderer watchdog centering.
- Downward gaze draws only the lower two eye cells and is gated by the vertical dead zone/hysteresis.
- `npm test` passes (79 tests); `npm run doctor` passes, syntax-checking 32 source files and verifying 11 IPC routes. Lint and syntax build pass.
- The requested Electron smoke test launched the real app and exercised drag through the renderer preload IPC. Exact result: `before={"x":40,"y":80,"width":160,"height":210}`, `after={"x":100,"y":130,"width":160,"height":210}`, `passed=true`, Electron exit `code=0 signal=null`, and `curie.log errors: none`. It printed Electron's existing insecure Content-Security-Policy warning.

### NOT verified in a running GUI

- The smoke verified Electron launch, native window bounds, and drag IPC only. Visual hop timing, wandering, debug overlay placement/refresh, multi-display behavior, and live gaze recovery remain unverified in a running GUI.
- The latest `npm run preview` attempt also could not bind `127.0.0.1:4173` in the sandbox (`EPERM`), so no new visual preview check was made for these changes.

### How to read the debug overlay

- `pet window` gives the native window rectangle; `display` and `workArea` show the display currently matched to it.
- `cursor` is the raw screen point, and `vector from centre` is cursor minus pet-window centre. `gaze` is the main-process quantized direction (`dx`, `dy`), where each axis is -1, 0, or +1.
- `last gaze received` is the renderer acknowledgment age. It should remain below 250 ms while heartbeats are flowing; near 1000 ms, the renderer watchdog eases the eyes to centre.
- The final five `position writes` list newest last with their source: `drag`, `wander`, `clamp`, or `restore`.

## Calm ownership repair (implementation complete; commit pending)

### Verified by tests

- Main-process `PetCalmController` is the sole desktop calm owner. Click IPC, menu checkbox, `Ctrl+Option+C`, timer focus, and the legacy behavior API route through the same `setCalm(value, source)` adapter; source-tagged events are allowlisted in `curie.log`.
- Fake-clock tests cover 60 seconds without wander writes after a click, no hop starts while calm, neutral-frame blink settling, delayed first wander after reactivation, all trigger sources, timer-focus restoration with manual override, and heartbeat repair after a dropped state message.
- `npm test` passes (87 tests); `npm run doctor` checks 33 source files and verifies 14 IPC routes; lint, syntax build, and `git diff --check` pass.

### NOT verified in a running GUI

- The reported desktop bug was observed by the owner before this repair. The repaired click-to-calm flow, menu/shortcut/timer triggers, immediate native movement stop, and renderer settling have not been visually rechecked in Electron. The post-repair confidence comes from pure fake-clock tests and static IPC checks.
- Debug overlay text and `curie.log` source-tag output have not been inspected in a post-repair GUI run.

## Timer visibility and phase behavior (implementation complete; commit intentionally left to owner)

### Verified by tests

- Pure timer uses `FOCUS`, `SHORT_BREAK`, `LONG_BREAK`, and `IDLE`, with absolute `endAt` deadlines, computed remaining time, pause/resume preservation, explicit user-started focus after breaks, and a long break every fourth completed focus.
- Fake-clock tests cover a four-focus cycle, pause/resume, missed phase catch-up, exact one-notification catch-up at the service boundary, restart/corrupt-state recovery, and no timer-state write over 60 ordinary ticks.
- Timer calm uses the existing main calm lease with the `timer` source. Tests cover restoring the previous mode and preserving a manual calm change during focus.
- `npm test` passes (91 tests). `npm run doctor` passes, syntax-checking 36 source files and verifying 19 IPC routes; `npm run lint` and `npm run build` pass.
- Menu actions and `Ctrl+Option+T` dispatch through the same timer service. The renderer receives countdown and one-shot phase cue messages through the preload bridge. State files are atomically replaced only when timer state changes.
- Documentation includes the timer state diagram and trigger table, a three-minute 1-minute/1-minute manual test, and the configuration defaults in `assets/timer.json`.

### NOT verified in a running GUI

- The timer menu enablement, tray title/tooltip, countdown placement, calm transition, alert/done placeholder sequences, native notifications, keyboard shortcut, sleep/restart appearance, and debug overlay have not been visually checked in a running desktop app during this phase.
- No Electron process or browser-based GUI check was run for this work. The confidence is from fake-clock tests, syntax/IPC checks, and source review; the owner should run the manual timer test on the desktop.

## Plain-language agent phase (implementation complete; owner commits manually)

### verified by tests

- The tool list is exactly `add_task`, `list_tasks`, `complete_task`, `delete_task`, `set_reminder`, and `start_focus`. Task writes are proposals; multiple writes share one confirmation, and no write occurs before confirmation. Add-task can save a task and reminder together. Existing-task reminders require an ID. Titles cap at 200 characters; lists are capped at 50 and sorted by due time.
- Fake provider sequences cover “remind me tomorrow 5pm” with an Asia/Kolkata timestamp, confirm/cancel behavior, retryable past-date errors, JSON-string/object arguments, missing tool-call IDs, multiple calls, empty content with tool calls, invalid/truncated JSON, finish reasons, repeated invalid calls, and the five-iteration limit.
- Fake-clock tests cover the persisted 400/day provider HTTP-call limit (settings range 50–1500), the 20-call rolling-minute burst limit, Asia/Kolkata midnight reset, counter persistence, confirmation timeout/cancellation, and the one-request-in-flight rule. Key-test calls count toward the same provider-call budget.
- Provider tests cover Gemini-to-Groq fallback on 429/network/timeout/server failures, safe handling of fake 401/403 bodies that echo the key, Authorization-header-only key transmission, output token cap, and generic all-provider failure text. Provider response fixtures follow provider documentation schemas; they are not live responses.
- Agent-created explicit reminders use the existing reminder service and fire during quiet hours, including catch-up after a simulated sleep. Automatic nudges remain quiet-hours limited and capped at three per day. Ask Curie uses the existing calm lease and preserves manual calm changes.
- Logs and debug data expose provider, iteration count, tool names, latency/error category, daily and rolling-minute usage/limits, and key-present booleans. Tests verify that echoed API keys and message text do not appear in captured errors/logs. User messages and model replies are never written to disk, including with verbose logging enabled.
- `npm test` passes (109 tests); `npm run lint`, `npm run doctor` (43 source files and 27 IPC routes), and `npm run build` pass.

### NOT verified against a real LLM or a running GUI

- No real Gemini/Groq request was sent. API-key save/test windows, prompt quality for relative dates, provider-specific tool-call quirks, fallback behavior on live responses, and native-window confirmation presentation have not been observed live.
- No Electron GUI was launched for this phase. Menu/shortcut routing, Ask Curie placement, Enter/Escape behavior, safeStorage-unavailable messaging, key-test feedback, debug-overlay layout, pet calm lease appearance, and on-screen reminder confirmation remain unverified visually. Use the five-minute agent checklist in `docs/MANUAL_TEST_CHECKLIST.md` on the owner's desktop.
- Synthetic provider fixtures are based on provider documentation and test contracts, not recorded live responses.

## Provider key-test request and error reporting (implementation complete; desktop check pending)

### verified by tests

- Gemini and Groq key-test HTTP calls run through `keys:test` IPC in Electron main. Both use `Authorization: Bearer` through the shared provider-header builder. The test request asks for one output token and does not expose API keys.
- Results distinguish success, authentication, bad request, model not found, rate limiting, server errors, timeout, DNS, TLS, aborted/blocked, connection refused, and unknown errors with their code. HTTP results include the status; 404 results name the selected model and trigger a runtime model-list request so an available model can be selected in the key window.
- Per-test event logs include provider, endpoint host, model, class, status/error code, and latency. Keys, query strings, and response bodies are excluded. Gemini and Groq endpoints and auth schemes were checked against their official API docs; test response fixtures are synthetic.
- `npm test` passes (130 tests); `npm run lint`, `npm run doctor` (43 source files, 27 IPC routes), and `npm run build` pass after this repair.

### NOT verified against a real provider

- No Gemini or Groq request was sent during this repair. The owner's report that curl succeeds is not independently reproduced here.
- The key window's result display, runtime model selection, and provider-specific HTTP/network classifications still need a desktop check with real keys. Fake transport tests cover each class, including the echoed-key 401 case.

## Gemini provider configuration and diagnostics (implementation complete; real-response check pending)

### verified by tests

- `gemini-3.5-flash-lite` is the single configured default in settings. The agent and key-test window use that setting; unedited saved defaults migrate to the current default. Gemini does not auto-switch to another Gemini model.
- Gemini agent requests use the documented OpenAI-compatible `thinking_level: low` setting, a 30-second timeout, and the configured 512-token agent cap. Gemini key tests use the configured model with a 1024-token cap. The key-test window can still use a model explicitly selected from live model discovery after a 404.
- Sanitized provider 400 messages are surfaced in key-test results and logged with a 200-character limit and key redaction. A Gemini 400 falls back once to Groq, with a `bad-request-fell-back` log event; two 400s return one plain message. Request bodies are not logged.
- Per-call logs contain prompt, output, and thinking token counts only. Gemini assistant tool-call messages retain their original `extra_content.google.thought_signature`; missing required signatures stop before tool execution with a clear message.
- Fake transport fixtures cover configured model and output caps, redacted/truncated 400 errors, fallback, token-only logs, and signature preservation/absence.
- `npm test` passes (139 tests); `npm run lint`, `npm run doctor` (43 source files, 27 IPC routes, including one Gemini model definition), and `npm run build` pass.

### NOT verified against a real provider

- The owner's report says Gemini 3.5 Flash succeeds on the native endpoint and Gemini 3.8 hangs, while Groq works. This agent did not repeat those live calls.
- Thought-signature handling is **NOT verified against a real Gemini response**. The fixtures are based on current Google API documentation, not captured responses.
- Thinking-level compatibility, usage metadata field names, real 400 text, and key-window result display still need a real Gemini test. No real provider request or running GUI was used for this change.

## Ask request visibility and Gemini 400 diagnostics (implementation complete; desktop check pending)

### verified by tests

- Ask requests now resolve to an explicit reply or error outcome; empty replies, `finish_reason: length`, repeated validation rejection, iteration limit, provider HTTP errors, cap/key errors, and coded transport exceptions have visible plain-text messages. The main-process safety net supplies “No answer produced” if a result is blank, and the Ask renderer keeps the user's input after errors.
- The Ask window shows a 60-second timeout message, rejects late responses from timed-out requests, and aborts its active provider request when the window closes. A pure request-state test covers idle, pending, confirmation, reply, error, timeout, and blank-result safety.
- Reminder phrases “at 3:20 pm” and “in 2 minutes” resolve against a fake 15:15 Asia/Kolkata clock on 25 October. A time that has already passed today returns a visible validator error.
- Gemini Test 400 results include the sanitized provider message (capped at 200 characters with key redaction). The failing Gemini test log includes only request field names, nested config field names, inclusion booleans, status, model, and token counts; it excludes values and bodies. No request format was changed.
- Agent diagnostics now show provider, finish reason, prompt/output/thinking token counts, iteration count, error class, and last validator message. Request logs contain counts and classifications, not user or model text.
- `npm test` passes (149 tests); `npm run lint`, `npm run doctor` (45 source files, 27 IPC routes), `npm run build`, and `node --check src/renderer/ask.js` pass.

### NOT verified against a real provider

- No live Gemini/Groq request or Electron GUI run was performed. The reported Gemini 400 and the new field-name log output have not been reproduced on the owner's machine.
- Ask window rendering, 60-second timeout appearance, closing during a live request, confirmation interactions, and the Gemini 400 result display still need a desktop check. Synthetic provider tests do not prove real-provider behavior.

## Conversation delivery, diagnostics, and settings migration (implementation complete; desktop check pending)

### verified by tests

- Ask and panel use one conversation client and one main-process delivery service. Requests carry IDs through IPC receipt, loop/provider stages, result send, and renderer receipt/render logs; logs include no message or reply text.
- Results route to the panel when the sender window has closed. Delivery is queued until a loading renderer is ready. The service rejects a second in-flight request across either shell; late and duplicate renderer results are ignored. Confirm cards share one renderer and require the request token plus a button-origin event. Typed “yes” cannot execute a write.
- Conversation history is held in memory per shell, capped at ten messages, sent on the next request, and cleared by New chat or window close. The system prompt and oldest-first token-budget truncation remain active.
- Panel, Ask, and key windows report console warnings/errors, uncaught exceptions, unhandled rejections, failed loads, and renderer termination with a window tag. Renderer error messages redact configured keys.
- The native menu includes Open log folder; the Ask DevTools item appears only when `CURIE_DEBUG=1`. Startup migration updates unedited legacy defaults for the 400-call daily cap and Gemini model while preserving values marked as user-edited.
- Gemini Test 400 output includes the sanitized provider message, or status text/content type/body length when no parseable message exists. Its diagnostic log contains the endpoint path, model, and request field names only; request format was not changed.
- `npm test` passes (173 tests); `npm run lint`, `npm run doctor` (49 source files and 36 IPC routes), and `npm run build` pass.

### NOT verified in a running GUI or against a real provider

- Ask and panel reply rendering, fallback delivery after an actual window close, confirmation-card interaction, renderer error forwarding, and the debug-only menu item have not been observed in Electron during this phase.
- No live Gemini request was made. Provider 400 text and the new request-field diagnostics have not been checked against the owner's reported failure.

## Startup regression repair (Electron check pending)

### verified by tests

- Removed local-module `require()` calls from the sandboxed panel/pet, Ask, and key preloads. Renderer error forwarding is installed inline, and `npm run doctor` now rejects local module requires in these preloads.
- Added pet-window console/load/crash diagnostics. The pet is identified from its actual `webContents` sender so renderer errors are logged as `ui.pet.*`.
- Removed a call to a nonexistent calm-state acknowledgment API from the pet renderer.
- `npm test` passes (173 tests); lint, doctor (49 source files and 36 IPC routes), and build pass.

### NOT verified in a running GUI

- The owner log showed the app process running with repeated `anomaly.gaze_not_delivered` entries after startup. This is consistent with the pet preload failing before it exposes `window.curie`; the sandbox-incompatible local require is removed, but the repair has not yet been relaunched and confirmed in Electron.

## In-app reminder bubble and reply box

### Verified by tests

- Reminders stay in the task store with explicit pending, due, shown, snoozed, done, or dismissed lifecycle states. Startup migration normalizes old records; wall-clock checks catch due reminders after sleep/restart and preserve the original due time for missed labels.
- Due reminders are grouped into one bubble payload. The bubble uses Done, Snooze, and Skip actions; snooze accepts a duration. Panel snapshots list pending reminders with their due times. The reminder route logs saved, scheduled, due, shown, and resolved IDs without task text.
- The bubble reply matcher handles acknowledgments, done, dismiss, and snooze phrases locally. Other messages go through the existing agent loop with reminder title, due time, deferral count, task facts, and a locally computed pushback decision. The in-memory bubble history is limited to three exchanges and includes locally handled replies.
- A reminder is shown in the panel/bubble state even when a model provider fails. The pet receives its existing alert cue when a reminder becomes due. Reminder delivery no longer relies on macOS Notification banners; the menu entry previews the in-app bubble.
- Shared Confirm all / Cancel all cards keep their Saving, Saved, Failed, and Cancelled states in panel, Ask, and bubble shells. Only button-originated events can approve task writes; their execution result returns to the model before its reply.
- Gemini and Groq agent output caps are editable in Settings (defaults 2048 and 1024; range 256–8192); provider key tests remain at 1024. A length finish returns one settings instruction without retrying. Gemini 400 bodies are sanitized and capped at 300 characters across object, array, and raw text shapes.
- Timer state changes are logged without per-second tick lines. A 60-second fake-clock test confirms no timer tick log flood.
- `npm test`: 194 tests pass. `npm run lint`, `npm run doctor`, and `npm run build` pass.

### NOT verified in a running GUI or against a real provider

- Bubble placement relative to the pet, frosted appearance on light/dark wallpapers, interaction focus, full-screen-space behavior, following during drag, and accessibility of the action controls have not been checked in a running Electron GUI.
- Sleep/wake and restart catch-up are covered by fake-clock tests, but have not been observed on the owner's Mac. Login-at-startup behavior is not part of this reminder check.
- The reminder bubble's real model fallback, actual Gemini/Groq responses, and pushback wording have not been verified. `src/core/pushback.js` now computes the pushback decision locally from the persisted deferral counts and the task due date.
- Codex did not run the Electron GUI smoke test for this change. No native notification was sent; reminder delivery is designed to remain visible in the in-app bubble regardless of macOS notification permissions.

## Gemini authentication, proposal logging, and reminder counters/labels

### Verified by tests

- Gemini chat, key-test, and model-list HTTP calls share one Bearer-header builder. It trims the key, and a fake transport test confirms all three requests carry the identical `Authorization` value. No Gemini code uses `x-goog-api-key`.
- Each confirmation card emits one `proposal.confirm-card` line. Each proposed write logs `proposal.resolved.<tool>.<confirmed|cancelled|error>`; agent request logs include the selected model name.
- Reminders found overdue on startup or power resume are labeled Missed. Reminders detected during normal awake scheduling say Due now unless the bubble shows them more than five minutes after their due time. The rule is covered by pure fake-clock tests.
- The user-facing reminder action is Skip. It dismisses only the reminder and leaves its task open. `snooze_count` and `skip_count` persist in task data, migrate from legacy reminder fields, appear in lifecycle logs, and are tested for increment and migration.
- `npm test` passes (198 tests); `npm run lint`, `npm run doctor` (53 source files, 42 IPC routes), and `npm run build` pass.

### NOT verified

- No live Gemini chat, key test, or model-list request was made. Bearer authentication is verified with fake transports only.
- Only the preview's Due now label and hidden preview controls were checked in Electron. Real reminders' Due now/Missed labels and Skip behavior remain unchecked. Startup/resume/late-show classification is covered by fake-clock tests, not a live sleep/wake run.

## Limited desktop check (2026-10-26)

- `npm start` launched the pet and reminder windows. The right-click **Test reminder bubble** item opened the preview. After correcting the CSS `hidden` override, the preview visibly showed the Due now label, reply field, Open panel link, and no reminder action buttons. The reply field was not focused on open.
- The preview confirms basic rendering only. No real task reminder was scheduled, and the typed-reply path, live Skip/Snooze/Done behavior, bubble position relative to the pet, and light-wallpaper appearance remain unverified. The live Gemini/Groq paths and sleep/resume behavior remain unverified.

## Reminder bubble lifecycle fixes (2026-10-26)

### Verified by tests

- The test menu path creates a due reminder with `is_test: true`. Done, Snooze, and Skip use the reminder service's regular resolution path; the temporary task is then removed.
- Bubble actions log action and outcome with the reminder ID. Missing reminders and thrown action errors are caught, the bubble hides, and a one-line status is sent to the panel. Close and Escape hide without resolving anything.
- Button clicks and reply submissions log only their route, with no message text. The local matcher accepts exact short commands and sends questions and longer phrases to the model.
- `npm test` passes (199 tests); `npm run lint`, `npm run doctor` (53 source files, 42 IPC routes), and `npm run build` pass.

### NOT verified in a running GUI

- The real menu-created test reminder, Done/Snooze/Skip buttons, missing-reminder error panel message, close button, Escape behavior, and route logs have not been exercised in the running Electron app.
- Real reminder notification delivery, macOS banner behavior, and the model route for reminder replies were not checked in this change.

## Maintenance cleanup (2026-10-26)

### Verified by tests and checks

- `@eslint/js` and `globals` are direct development dependencies used by the ESLint flat config.
- Settings key encryption/decryption uses Electron's asynchronous safeStorage methods. The startup store waits for async key initialization before providers are constructed; saved ciphertext that needs key rotation is re-encrypted.
- The smoke-only Electron `console-message` capture uses Electron's current details-object argument shape.
- The configured Gemini default is `gemini-3.5-flash-lite`. Unedited prior defaults migrate to it; explicitly edited values stay unchanged.
- README, ASSUMPTIONS.md, and this status record that chat history is sent from memory, the app has an API keys window, and reminders use the in-app bubble rather than macOS notification banners.
- Full checks: `npm run lint`, `npm run doctor`, `npm run build`, `npm test`, and `node tests/electron-smoke.js`.
- The smoke process exited with code 0, reported `passed: true`, and recorded no `curie.log` errors. Its test data directory was temporary and removed by the script.

### NOT VERIFIED

- Async safeStorage operations were tested with a fake adapter; this task did not access any existing app data or saved API keys.
- No live Gemini/Groq requests were made. No manual desktop session was used; the automated smoke run used an isolated temporary data directory.
- The existing debug-overlay CSP still allows inline styles; changing that was left out because it could affect the current overlay styling.

## Reminder pushback, packaging, and repository cleanup (implementation complete; owner commits)

### Verified by tests and checks

- `evaluatePushback` moved from `lib/pushback.js` to `src/core/pushback.js`, inside the `src/**/*` glob that electron-builder packages. The packaged app can now resolve the import at startup; no top-level `lib` entry is needed in `build.files`.
- `reminder-reply.js` imports the rule module directly and exports the pure `deferralCountOf(reminder)` and `buildPushback(task, now)`. `main.js` calls `buildPushback(first.task, Date.now())`; the async dynamic-import probe and its silent `{ pushBack: false }` fallback are gone.
- A deferral is a snooze plus a skip, and each only counts when it is a non-negative integer. The third deferral always pushes back; the first pushes back when the task is overdue or due within 2 hours; the second when it is overdue or due within 24 hours; a task without a due date pushes back only from the third. The 2-hour and 24-hour boundaries are inclusive.
- The reminder context still sends `deferral_count`, `pushback`, and minimal task facts, and no user or model text is logged.
- `test/` was merged into `tests/`, so there is one test directory. `docs/LEARN.md` and the electron-builder file list were updated to match.
- `evals/` is part of the project: `npm run eval` runs the mock provider scenarios, `npm run eval:live` runs real providers, and the generated `evals/results.json` plus temporary `evals/eval-*/` folders are ignored.
- Repository cleanup: removed editor path comments and restored trailing newlines in `src/main/main.js` and `src/core/reminder-reply.js`. `.aider*` logs are ignored, and an API key that Aider had written into its local chat history was redacted from disk.
- `npm test` passes (219 tests); `npm run lint`, `npm run doctor`, `npm run build`, and `git diff --check` pass.

### NOT verified

- Pushback wording from a real Gemini or Groq reply has not been observed; the decision rule is covered by pure tests only.
- The installers were not rebuilt. A macOS arm64 `electron-builder --dir` build succeeded after the move, and its `app.asar` listing contains `src/core/pushback.js` and no top-level `lib/` folder, which confirms the packaged import resolves.
