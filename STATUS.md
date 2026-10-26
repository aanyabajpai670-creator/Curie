# Curie status

## Current phase: study timer desktop integration (implementation complete; GUI check pending)

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

- Gemini and Groq key-test HTTP calls run through `keys:test` IPC in Electron main. Gemini sends its key in `x-goog-api-key`; Groq uses `Authorization: Bearer`. The test request asks for one output token and does not read or expose provider error bodies.
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

## Maintenance cleanup (2026-10-26)

### Verified by tests and checks

- `@eslint/js` and `globals` are direct development dependencies used by the ESLint flat config.
- Settings key encryption/decryption uses Electron's asynchronous safeStorage methods. The startup store waits for async key initialization before providers are constructed; saved ciphertext that needs key rotation is re-encrypted.
- Renderer console diagnostics consume Electron's current `console-message` details object. The smoke-only console capture uses the same event argument shape.
- The configured Gemini default is `gemini-3.5-flash-lite`. Unedited prior defaults migrate to it; explicitly edited values stay unchanged.
- README, ASSUMPTIONS.md, and this status record that chat history is sent from memory, the app has an API keys window, and reminders use the in-app bubble rather than macOS notification banners.
- Full checks: `npm run lint`, `npm run doctor`, `npm run build`, `npm test`, and `node tests/electron-smoke.js`.
- The smoke process exited with code 0, reported `passed: true`, and recorded no `curie.log` errors. Its test data directory was temporary and removed by the script.

### NOT VERIFIED

- Async safeStorage operations were tested with a fake adapter; this task did not access any existing app data or saved API keys.
- No live Gemini/Groq requests were made. No manual desktop session was used; the automated smoke run used an isolated temporary data directory.
- The existing debug-overlay CSP still allows inline styles; changing that was left out because it could affect the current overlay styling.
