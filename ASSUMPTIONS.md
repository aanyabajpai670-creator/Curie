# Assumptions

- Curie is the working product name from the supplied objective.
- The workspace was empty and had no Git repository, so Phase 0 initialized one here.
- The attached image-1.png is the requested 12-frame, 16×16-per-frame pink slime sheet; it is copied unchanged to assets/pink_slime_sheet_16px.png.
- The attached image-2.gif is a visual reference, not the production sprite sheet.
- The alert, sleep, and done states reuse indices from the supplied sheet until the owner draws replacement frames; state timing and indices live in JSON.
- Open Duet's README informed the local-first data and provider-choice direction; Curie remains a single-purpose study companion rather than a general agent workspace.
- The app uses Electron with plain JavaScript modules, Node's built-in test runner, ESLint, and Prettier as requested.
- No paid service, API, signing, or notarization dependency will be introduced.
- Task deadlines and reminders are stored as ISO timestamps with offsets and scheduled by absolute time; the configured timezone will control agent language and display in later settings work.\n
- Provider defaults checked against official docs on 2026-10-24: Gemini OpenAI-compatible chat completions support tools at the documented v1beta endpoint; gemini-3.8-flash is listed with free-tier pricing. Groq lists openai/gpt-oss-120b with local tool use; the app will use its free tier only and will not enable paid upgrades. References: https://ai.google.dev/gemini-api/docs/openai/ and https://ai.google.dev/gemini-api/docs/pricing and https://console.groq.com/docs/models and https://console.groq.com/docs/openai.\n