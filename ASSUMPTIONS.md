# Assumptions

- Curie is the working product name from the supplied objective.
- The workspace was empty and had no Git repository, so Phase 0 initialized one here.
- The attached image-1.png is the requested 12-frame, 16×16-per-frame pink slime sheet; it is copied unchanged to assets/pink_slime_sheet_16px.png.
- The attached image-2.gif is a visual reference, not the production sprite sheet.
- The alert, sleep, and done states reuse indices from the supplied sheet until the owner draws replacement frames; state timing and indices live in JSON.
- Open Duet's README informed the local-first data and provider-choice direction; Curie remains a single-purpose study companion rather than a general agent workspace.
- The app uses Electron with plain JavaScript modules, Node's built-in test runner, ESLint, and Prettier as requested.
- No paid service, API, signing, or notarization dependency will be introduced. Chat uses free-tier provider endpoints with configurable rolling call caps; Curie never upgrades a provider account.
- Task deadlines and reminders are stored as ISO timestamps with offsets and scheduled by absolute time; the configurable timezone controls agent language and nudge quiet hours.
- The configured Gemini default is `gemini-3.5-flash-lite`; Groq's default is `openai/gpt-oss-120b`. Provider defaults remain configurable.
- electron-builder is used for unsigned macOS DMG/ZIP and Windows NSIS builds. No paid signing or notarization account is assumed.
- API keys are stored with Electron's asynchronous safeStorage APIs; settings do not expose keys to the renderer after saving. If OS-backed encryption is unavailable, saving a key is rejected.
- The conversation's last ten messages are retained in memory and included with later provider requests; they are not persisted to disk.
- Reminder delivery uses the in-app reminder bubble instead of macOS notification banners.
- This agent phase treats the six tools and the `Asia/Kolkata` locale as fixed scope; the app's existing timezone preference remains available to timer/nudge features but does not change how the agent resolves phrases like “tomorrow 5pm.”
- Agent fixtures model the documented OpenAI-compatible tool-call response shapes for Gemini/Groq; they are synthetic tests, not copied live provider responses.
- Provider request usage is a per-install local counter in settings: 400 provider HTTP attempts per Asia/Kolkata date by default (50–1500 configurable) and 20 attempts per rolling minute. Key-test requests count as provider calls too.
- Verbose agent logging is opt-in, but even when enabled, user messages, model replies, API keys, provider error bodies, and request URL query strings remain excluded from disk logs.
- Ask Curie proposal confirmation uses the same main-process calm lease semantics as timer focus, so it restores prior calm only if no manual calm change occurred while the window was open.
# Timer phase assumptions

- A completed break returns to IDLE and requires an explicit user action to start the next focus.
- The long-break cadence counts completed focus phases; the fourth focus selects the long break.
- If sleep/restart crosses multiple boundaries, state advances through them but only the latest elapsed boundary produces one catch-up notification.
- The alert and done cues use short, one-shot sequences from the existing placeholder sprite frames. No new art is introduced.

# Reminder bubble assumptions

- The due reminder UI is an in-app frosted bubble that follows the pet; reminder delivery does not depend on macOS Notification banners.
- If several reminders are due together, the bubble groups them and the local Done, Snooze, or Dismiss action applies to the full visible group.
- Reminder replies other than simple acknowledgment/action phrases use the existing agent loop. Pushback rules live in `src/core/pushback.js`: snoozes and skips both count as deferrals, the third deferral always pushes back, the first pushes back when overdue or due within two hours, and the second when overdue or due within 24 hours. Tasks without a due date push back only from the third deferral.
- A local action reply remains visible briefly after it resolves the last reminder so the user can read the result.
- The test-bubble menu entry creates a due task reminder marked `is_test`; any Done, Snooze, or Skip resolution uses the normal reminder lifecycle, then deletes that temporary task.
- Closing the reminder bubble with its close button or Escape hides the currently due reminders until their reminder state changes; it does not resolve or dismiss them.
