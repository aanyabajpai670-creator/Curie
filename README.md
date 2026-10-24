# Curie

Curie is a free, local desktop study companion built with Electron and plain JavaScript. Project progress and hand-test notes are in STATUS.md.

## Development

Requires Node.js and npm. Install dependencies with npm install, then launch with npm start. Run npm test, npm run lint, and npm run build to check the project.

## Privacy and cost

Task and timer data stay in the app's local user data folder. When chat is used, Curie sends the current message and a small set of active task fields to the selected provider. It does not send task notes, open apps, files, or screenshots.

Gemini and Groq keys can be stored with Electron's OS-backed `safeStorage` encryption. Chat sends the current message and a small set of active task fields to the configured provider; chat is optional. Provider model names and the app's timer, quiet hours, timezone, nudge limit, pet size, login behavior, and optional macOS Shortcuts are configurable in Settings. Shortcuts are off by default and run only when the study timer is in its focus phase. Use provider free tiers only; Curie will not upgrade an account or call a paid API automatically. Never commit API keys or user data.

If secure key storage is unavailable on the computer, Curie refuses to save API keys. They can instead be supplied through `GEMINI_API_KEY` or `GROQ_API_KEY` in the launch environment. Existing task and timer data are stored locally in Electron's user data folder.
