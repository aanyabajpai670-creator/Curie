# Curie architecture

Curie keeps the desktop pet and control panel small. The main process owns operating-system features and local data; renderer pages only get the narrow methods listed in the preload bridge.

```mermaid
flowchart LR
  Pet[Pet window] --> Preload[Isolated preload API]
  Panel[Control panel and chat] --> Preload
  Preload --> IPC[Validated IPC handlers in main]
  IPC --> Timer[Timer service]
  IPC --> Tasks[Task and reminder service]
  IPC --> Agent[Agent controller]
  IPC --> Settings[Settings store]
  Timer --> Core[Pure timer logic]
  Tasks --> CoreTasks[Pure task and reminder logic]
  Nudges[Local nudge service] --> CoreNudges[Pure nudge rules]
  Agent --> Tools[Allowlisted local tools]
  Tools --> Timer
  Tools --> Tasks
  Agent --> Providers[Gemini then Groq]
  Settings --> SafeStorage[Electron safeStorage for keys]
  Timer --> Files[JSON files in Electron userData]
  Tasks --> Files
  Nudges --> Files
  Settings --> Files
```

## Data flow

- The pet and panel are separate BrowserWindows. Both run with context isolation and without Node integration.
- `preload.js` exposes only specific timer, task, reminder, settings, and chat functions. It does not expose `ipcRenderer` itself.
- Main-process handlers call services. Timer, tasks, reminder scheduling, and nudge rules live in pure modules so Node's test runner can exercise them without Electron.
- The task, timer, nudge-suppression, pet-position, and non-secret settings records are local JSON under Electron's `userData` path. Provider keys are encrypted with the OS-backed Electron `safeStorage` API before they are written.
- A chat request sends the user's current message and at most 20 active tasks with only id, title, subject, due time, estimate, and status. Chat is the only path that contacts an external model provider. The model can call only Curie's declared local tools; deleting a task requires a confirmation dialog.
- Local deadline nudges do not contact a model. Optional macOS Shortcuts run locally through `execFile` and are disabled until the user enables them.

## Important boundaries

The agent has no file, shell, browser, screenshot, or other-app access. Timer, reminders, and nudges continue to work without network access or API keys. Chat call limits apply to requests from this running app instance; they are not provider billing controls, so use a free-tier key and do not enable paid billing.
