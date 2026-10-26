# Curie

Curie is a free, local desktop study companion built with Electron and plain JavaScript. Project progress and hand-test notes are in STATUS.md.

## Development

Requires Node.js and npm. Install dependencies with `npm install`, then launch with `npm start`. Run `npm test`, `npm run lint`, and `npm run build` to check the project.

## Build installers

The `package:mac` script builds unsigned macOS DMG and ZIP artifacts. The `package:win` script builds an unsigned Windows NSIS installer. Both use electron-builder without a paid signing or notarization account. Build on the target operating system when possible; macOS distribution is unsigned and Gatekeeper will show a warning.

Owner documentation: [architecture](docs/ARCHITECTURE.md), [agent walkthrough](docs/HOW_THE_AGENT_WORKS.md), [learning guide](docs/LEARN.md), and [30-minute manual checklist](docs/MANUAL_TEST_CHECKLIST.md).

### Install on macOS

1. Open the DMG and drag Curie to Applications.
2. In Applications, Control-click Curie and choose **Open**. Review the macOS warning, then choose **Open** again. Future launches use the normal app icon.

### Install on Windows

Run the Curie Setup installer and choose an installation folder. Because the installer is unsigned, Windows may show a SmartScreen warning; only continue if you trust the person who provided the build.

### Add a free Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey), sign in, and create or copy an API key. Google AI Studio may create a default project for new users.
2. Check the current [Gemini API pricing and free tier](https://ai.google.dev/gemini-api/docs/pricing) for the selected model and your region. Do not enable billing if you want to keep the account free; free availability and rate limits vary by model and account.
3. Open Curie's right-click menu, choose **API keys...**, paste the key, and save. Curie stores it using the operating system's secure storage and does not show it again. The default Gemini model is `gemini-3.5-flash-lite`; the model can be changed in Settings.

The Gemini API free tier can have lower limits and different data handling than paid usage. See Google's [API key instructions](https://ai.google.dev/gemini-api/docs/api-key) and review its current terms before entering a key. Groq is an optional fallback and can be configured the same way.

## Privacy and cost

Task and timer data stay in the app's local user data folder. When chat is used, Curie sends the current message, the last ten in-memory conversation messages, and a small set of active task fields to the selected provider. Conversation history is not written to disk. It does not send task notes, open apps, files, or screenshots.

Gemini and Groq keys can be stored with Electron's asynchronous OS-backed `safeStorage` encryption. The **API keys...** window lets you save and test configured keys. Provider model names and the app's timer, quiet hours, timezone, nudge limit, pet size, login behavior, and optional macOS Shortcuts are configurable in Settings. Shortcuts are off by default and run only when the study timer is in its focus phase. Use provider free tiers only; Curie will not upgrade an account or call a paid API automatically. Never commit API keys or user data.

Reminders are presented in Curie's in-app reminder bubble with Done, Snooze, and Skip actions. Reminder delivery uses the app bubble rather than macOS notification banners.

If secure key storage is unavailable on the computer, Curie refuses to save API keys. They can instead be supplied through `GEMINI_API_KEY` or `GROQ_API_KEY` in the launch environment. Existing task and timer data are stored locally in Electron's user data folder.
