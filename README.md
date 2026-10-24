# Curie

Curie is a free, local desktop study companion built with Electron and plain JavaScript. Project progress and hand-test notes are in STATUS.md.

## Development

Requires Node.js and npm. Install dependencies with npm install, then launch with npm start. Run npm test, npm run lint, and npm run build to check the project.

## Privacy and cost

Task and timer data stay in the app's local user data folder. When chat is used, Curie sends the current message and a small set of active task fields to the selected provider. It does not send task notes, open apps, files, or screenshots.

The agent currently reads GEMINI_API_KEY and GROQ_API_KEY from the launch environment. A settings screen with encrypted key storage is planned for Phase 7. Use the providers' free tiers only; Curie will not upgrade an account or call a paid API automatically. Never commit API keys or user data.
