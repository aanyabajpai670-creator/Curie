# Curie

Curie is a free, local desktop study companion built with Electron and plain JavaScript. Project setup and the current implementation status are in [STATUS.md](STATUS.md).

## Development

Requires Node.js and npm.

```sh
npm install
npm start
```

```sh
npm test
npm run lint
npm run build
```

## Privacy and cost

Study data is intended to stay in the app's local user data folder. Optional language model features use free provider tiers configured by the owner; no paid API is required. Never commit `.env` or user data.
