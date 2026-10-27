import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = listJavaScript(path.join(root, 'src'));
for (const file of sourceFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const main = read('src/main/main.js');
const preload = read('src/main/preload.js');
const renderer = read('src/renderer/pet.js');
const appMenu = read('src/main/app-menu.js');
const petTimerWindow = read('src/main/pet-timer-window.js');
const petTimerPreload = read('src/main/pet-timer-preload.js');
const debugPreload = read('src/main/debug-overlay-preload.js');
const debugWindow = read('src/main/debug-overlay-window.js');
const askPreload = read('src/main/ask-window-preload.js');
const keyPreload = read('src/main/key-window-preload.js');
const keyRenderer = read('src/renderer/api-keys.js');
const askRenderer = read('src/renderer/ask.js');
const panelRenderer = read('src/renderer/panel.js');
const conversationClient = read('src/renderer/conversation-client.js');
const reminderPreload = read('src/main/reminder-bubble-preload.js');
const reminderRenderer = read('src/renderer/reminder-bubble.js');
const reminderWindow = read('src/main/reminder-bubble-window.js');
const conversationService = read('src/main/conversation-service.js');
const windowDiagnostics = read('src/main/window-diagnostics.js');
const providers = read('src/agent/providers.js');
const scheduler = read('src/core/scheduler.js');
const taskCore = read('src/core/tasks.js');
const routes = [
  ['pet:drag-start', preload, /ipcRenderer\.send\('pet:drag-start'/, main, /ipcMain\.on\('pet:drag-start'/],
  ['pet:drag-move', preload, /ipcRenderer\.send\('pet:drag-move'/, main, /ipcMain\.on\('pet:drag-move'/],
  ['pet:drag-end', preload, /ipcRenderer\.send\('pet:drag-end'/, main, /ipcMain\.on\('pet:drag-end'/],
  ['pet:drag-cancel', preload, /ipcRenderer\.send\('pet:drag-cancel'/, main, /ipcMain\.on\('pet:drag-cancel'/],
  ['pet:gaze-received', preload, /ipcRenderer\.send\('pet:gaze-received'/, main, /ipcMain\.on\('pet:gaze-received'/],
  ['pet:gaze-watchdog', preload, /ipcRenderer\.send\('pet:gaze-watchdog'/, main, /ipcMain\.on\('pet:gaze-watchdog'/],
  ['pet:behavior', preload, /ipcRenderer\.send\('pet:behavior'/, main, /ipcMain\.on\('pet:behavior'[^]*?setCalm\(state\.mode === 'CALM'/],
  ['pet:calm-toggle', preload, /ipcRenderer\.send\('pet:calm-toggle'/, main, /ipcMain\.on\('pet:calm-toggle'[^]*?setCalm\(!petCalm\.snapshot\(\)\.calm, 'click'\)/],
  ['pet:calm-toggle renderer click', renderer, /window\.curie\.togglePetCalm\(\)/, preload, /togglePetCalm: \(\) => ipcRenderer\.send\('pet:calm-toggle'/],
  ['pet:frame', preload, /ipcRenderer\.send\('pet:frame'/, main, /ipcMain\.on\('pet:frame'/],
  ['pet:calm-state', main, /webContents\.send\('pet:calm-state'/, preload, /subscribe\('pet:calm-state'/],
  ['pet:gaze', main, /webContents\.send\('pet:gaze'/, preload, /subscribe\('pet:gaze'/],
  ['pet:set-scale', main, /webContents\.send\('pet:set-scale'/, preload, /subscribe\('pet:set-scale'/],
  ['timer:action', preload, /ipcRenderer\.invoke\('timer:action'/, main, /ipcMain\.handle\('timer:action'[^]*?timerService\.dispatch\(action\)/],
  ['timer:status', preload, /ipcRenderer\.invoke\('timer:status'/, main, /ipcMain\.handle\('timer:status'/],
  ['timer:update', main, /webContents\.send\('timer:update'/, preload, /subscribe\('timer:update'/],
  ['timer-readout:update', petTimerWindow, /webContents\.send\('timer-readout:update'/, petTimerPreload, /ipcRenderer\.on\('timer-readout:update'/],
  ['pet:timer-visual', main, /webContents\.send\('pet:timer-visual'/, preload, /subscribe\('pet:timer-visual'/],
  ['debug:refresh', debugWindow, /webContents\.send\('debug:refresh'/, debugPreload, /ipcRenderer\.on\('debug:refresh'/],
  ['conversation:send from panel', preload, /ipcRenderer\.send\('conversation:send'/, main, /ipcMain\.on\('conversation:send'/],
  ['conversation:send from Ask', askPreload, /ipcRenderer\.send\('conversation:send'/, main, /ipcMain\.on\('conversation:send'/],
  ['conversation:send from reminder bubble', reminderPreload, /ipcRenderer\.send\('conversation:send'/, main, /ipcMain\.on\('conversation:send'[^]*?\['panel', 'ask', 'reminder'\]/],
  ['conversation:confirm from panel', preload, /ipcRenderer\.send\('conversation:confirm'/, main, /ipcMain\.on\('conversation:confirm'/],
  ['conversation:confirm from Ask', askPreload, /ipcRenderer\.send\('conversation:confirm'/, main, /ipcMain\.on\('conversation:confirm'/],
  ['conversation:clear', preload, /ipcRenderer\.send\('conversation:clear'/, main, /ipcMain\.on\('conversation:clear'/],
  ['conversation:close', preload, /ipcRenderer\.send\('conversation:close'/, main, /ipcMain\.on\('conversation:close'/],
  ['conversation:update', main, /deliverConversation\(name, channel, payload\)/, preload, /subscribe\('conversation:update'/],
  ['conversation:update Ask', main, /deliverConversation\(name, channel, payload\)/, askPreload, /subscribe\('conversation:update'/],
  ['conversation:confirmation', conversationService, /conversation:confirmation/, preload, /subscribe\('conversation:confirmation'/],
  ['conversation:confirmation Ask', conversationService, /conversation:confirmation/, askPreload, /subscribe\('conversation:confirmation'/],
  ['conversation:confirmation reminder', conversationService, /conversation:confirmation/, reminderPreload, /subscribe\('conversation:confirmation'/],
  ['reminder-bubble:update', main, /reminder-bubble:update/, reminderPreload, /subscribe\('reminder-bubble:update'/],
  ['reminder-bubble:action', reminderPreload, /ipcRenderer\.send\('reminder-bubble:action'/, main, /ipcMain\.on\('reminder-bubble:action'/],
  ['reminder-bubble:shown', reminderPreload, /ipcRenderer\.send\('reminder-bubble:shown'/, main, /ipcMain\.on\('reminder-bubble:shown'/],
  ['reminder-bubble:open-panel', reminderPreload, /ipcRenderer\.send\('reminder-bubble:open-panel'/, main, /ipcMain\.on\('reminder-bubble:open-panel'/],
  ['ui:renderer-error panel', preload, /ipcRenderer\.send\('ui:renderer-error'/, main, /ipcMain\.on\('ui:renderer-error'/],
  ['ui:renderer-error Ask', askPreload, /ipcRenderer\.send\('ui:renderer-error'/, main, /ipcMain\.on\('ui:renderer-error'/],
  ['ui:renderer-error keys', keyPreload, /ipcRenderer\.send\('ui:renderer-error'/, main, /ipcMain\.on\('ui:renderer-error'/],
  ['conversation:stage', preload, /ipcRenderer\.send\('conversation:stage'/, main, /ipcMain\.on\('conversation:stage'/],
  ['keys:status', keyPreload, /ipcRenderer\.invoke\('keys:status'/, main, /ipcMain\.handle\('keys:status'/],
  ['keys:save', keyPreload, /ipcRenderer\.invoke\('keys:save'/, main, /ipcMain\.handle\('keys:save'/],
  ['keys:test', keyPreload, /ipcRenderer\.invoke\('keys:test'/, main, /ipcMain\.handle\('keys:test'/],
];

for (const [channel, sender, sendPattern, receiver, receivePattern] of routes) {
  if (!sendPattern.test(sender) || !receivePattern.test(receiver)) {
    throw new Error('IPC route is incomplete: ' + channel);
  }
}
for (const [name, preloadSource] of [['panel/pet', preload], ['Ask', askPreload], ['keys', keyPreload]]) {
  if (/require\(['"]\.\//.test(preloadSource)) throw new Error(`${name} preload must not load a local module in Electron's sandbox`);
}

if (!/setCalm\(value, 'menu'\)/.test(main) || !/setCalm\?\.\(item\.checked\)/.test(appMenu)) {
  throw new Error('The right-click/tray Calm menu is not connected to the main state owner');
}
if (!/globalShortcut\.register\('Control\+Alt\+C', \(\) => setCalm\([^]*?'shortcut'\)\)/.test(main)) {
  throw new Error('The Ctrl+Option+C calm shortcut is not connected to the main state owner');
}
if (!/timerCalmLease\.sync\(shouldFocus, calmForFocus, Date\.now\(\)\)/.test(main)) {
  throw new Error('Timer focus entry and exit are not connected to the main calm state owner');
}
if (!/source: 'timer'/.test(main) || !/setCalm\(value, source\)/.test(main)) {
  throw new Error('Timer focus calm does not use the main setCalm owner with source timer');
}
if (!/globalShortcut\.register\('Control\+Alt\+T'[^]*?timerService\.dispatch/.test(main)
    || !/timerService\.dispatch\('startFocus', 'menu'\)/.test(appMenu)) {
  throw new Error('Timer shortcut and menu do not dispatch through the shared timer service');
}
if (!/label: 'Calm during focus'/.test(appMenu) || !/label: 'Show time on pet'/.test(appMenu)) {
  throw new Error('Timer pet display preferences are missing from the native menus');
}
if (!/label: 'Ask Curie\.\.\.'[^]*?preferences\.openAsk/.test(appMenu) || !/globalShortcut\.register\('Control\+Alt\+A', openAskWindow\)/.test(main)) {
  throw new Error('Ask menu and shortcut do not use the same openAskWindow function');
}
if (!/label: 'API keys\.\.\.'[^]*?preferences\.openKeys/.test(appMenu) || !/safeStorage\.isAsyncEncryptionAvailable\(\)/.test(main) || /safeStorage\.isEncryptionAvailable\(\)/.test(main) || /safeStorage\.decryptString\(/.test(read('src/main/settings-store.js'))) {
  throw new Error('API key settings menu or safeStorage check is missing');
}
if (!/safeStorage\.encryptStringAsync\(/.test(read('src/main/settings-store.js')) || !/safeStorage\.decryptStringAsync\(/.test(read('src/main/settings-store.js'))) throw new Error('Settings must use asynchronous safeStorage encryption');
if (!/askCalmLease\.begin\(Date\.now\(\)\)/.test(main) || !/askCalmLease\.end\(Date\.now\(\)\)/.test(main)) {
  throw new Error('Ask window does not acquire and restore the existing calm lease');
}
if (!/onConfirmation/.test(askPreload) || !/curieConversation\.onConfirmation/.test(askRenderer) || !/testProvider\(provider/.test(main)) {
  throw new Error('Ask confirmation or key-test route is incomplete');
}
if (!/curieKeys\.status\(\)/.test(keyRenderer) || !/curieKeys\.save\(/.test(keyRenderer) || !/curieKeys\.test\(/.test(keyRenderer)) {
  throw new Error('API key status, save, and test UI calls are incomplete');
}
if (!/test: \(provider, key, model\) => ipcRenderer\.invoke\('keys:test', provider, key, model\)/.test(keyPreload)
    || !/ipcMain\.handle\('keys:test',[^]*?testProvider\([^]*?typedKey[^]*?model/.test(main)) {
  throw new Error('Provider tests must pass through main-process IPC with the selected model');
}
if (/fetch\s*\(/.test(keyRenderer)) throw new Error('Provider test requests must not run in the API key renderer');
if (!/export function buildProviderHeaders\(apiKey/.test(providers)
    || !/headers: buildProviderHeaders\(provider\.apiKey/.test(providers)
    || !/const headers = buildProviderHeaders\(apiKey, \{ json: true \}\)/.test(providers)
    || !/const headers = buildProviderHeaders\(apiKey\)/.test(providers)
    || /x-goog-api-key/.test(providers)) throw new Error('All Gemini/Groq chat, key-test, and model-list requests must use shared Bearer headers');
const loopCallSites = sourceFiles.filter((file) => path.relative(root, file) !== 'src/agent/loop.js' && /runAgentLoop\s*\(/.test(fs.readFileSync(file, 'utf8')));
if (loopCallSites.length !== 1 || path.relative(root, loopCallSites[0]) !== 'src/agent/controller.js') throw new Error('Exactly one agent-loop caller must remain in the shared agent controller');
if (!/createConversationClient/.test(askRenderer) || !/createConversationClient/.test(panelRenderer)
    || !/onOutcome/.test(conversationClient)
    || !/conversationService\??\.request/.test(main) || /agentController\.send\(/.test(main)) throw new Error('Ask and panel must share one conversation request and result-delivery path');
if (!/renderConfirmationCard/.test(askRenderer) || !/renderConfirmationCard/.test(panelRenderer) || !/confirmationToken/.test(conversationService)) throw new Error('Ask and panel must use the shared button-confirmation card gate');
if (!/attachWindowDiagnostics/.test(main) || !/watchWindow\(petWindow, 'pet'\)/.test(main) || !/render-process-gone/.test(windowDiagnostics) || !/did-fail-load/.test(windowDiagnostics)) throw new Error('Renderer diagnostics must be attached to app windows including the pet');
if (!/details\.level/.test(windowDiagnostics) || /onConsole = \(_event, level, message\)/.test(windowDiagnostics)) throw new Error('console-message diagnostics must use Electron details arguments');
if (!/label: 'Test reminder bubble'/.test(appMenu) || !/preferences\.testReminderBubble/.test(appMenu)) throw new Error('Test reminder bubble menu item is missing');
if (!/showInactive\(\)/.test(reminderWindow) || !/visibleOnFullScreen: true/.test(reminderWindow) || !/backdrop-filter/.test(read('src/renderer/reminder-bubble.css')) || !/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(read('src/renderer/reminder-bubble.css'))) throw new Error('Reminder bubble must be non-activating, visible on fullscreen workspaces, frosted-glass styled, and honor hidden controls');
if (!/taskService\.resolveMany\(\[id\], action, 10\)/.test(main) || !/markShown\(ids/.test(main) || !/is_test: true/.test(main)) throw new Error('Reminder bubble actions and test reminder must use the task lifecycle');
if (!/data-action="skip">Skip/.test(read('src/renderer/reminder-bubble.html')) || !/\['skip', 'Skip'\]/.test(panelRenderer) || !/\['done', 'snooze', 'skip', 'dismiss'\]/.test(main)) throw new Error('Reminder Skip controls must use the skip lifecycle action');
if (!/reminder-bubble:close/.test(main) || !/id="close-bubble"/.test(read('src/renderer/reminder-bubble.html')) || !/event\.key === 'Escape'/.test(reminderRenderer)) throw new Error('Reminder bubble close button and Escape key must hide the bubble');
if (!/reminderBubbleHiddenIds\.add\(task\.id\)/.test(main) || !/reminderBubbleHiddenIds\.add\(id\)/.test(main)) throw new Error('Closing or failing a bubble action must hide it without changing the reminder');
if (!/reminder\.action\.\$\{action\}\.ok\.\$\{safeId\}/.test(main) || !/reminder\.action\.\$\{action\}\.error\.\$\{safeId\}/.test(main) || !/reminder:action-error/.test(main) || !/onReminderActionError/.test(read('src/main/preload.js'))) throw new Error('Reminder action failures must be logged and shown in the panel');
if (!/reminder\.bubble\.button\.\$\{action\}\.local/.test(main) || !/reminder\.reply\.submit\.\$\{match\.route\}/.test(main)) throw new Error('Reminder bubble actions and submits must log their route without message text');
if (!/export function isReminderMissed/.test(scheduler) || !/REMINDER_MISSED_THRESHOLD_MS = 5 \* 60_000/.test(scheduler)
    || !/taskService\.check\('resume'\)/.test(main) || !/check\('startup'\)/.test(read('src/main/task-service.js'))) throw new Error('Reminder missed labeling must cover the late-display threshold, startup, and resume');
if (!/snooze_count/.test(taskCore) || !/skip_count/.test(taskCore) || !/snooze-count-/.test(read('src/main/task-service.js')) || !/skip-count-/.test(read('src/main/task-service.js'))) throw new Error('Persisted reminder snooze and skip counters are missing');
if (!/proposal\.confirm-card/.test(conversationService) || !/proposal\.resolved\./.test(conversationService) || !/model-\$\{model\}/.test(main)) throw new Error('Confirmation and agent model diagnostics are missing');
if (!/curieReminder\.sendReply/.test(reminderRenderer) || !/onConfirmation/.test(reminderRenderer) || !/Can't think right now, use the buttons/.test(read('src/core/reminder-reply.js'))) throw new Error('Reminder bubble replies must use the shared agent and confirmation path with offline fallback');
if (!/if \(app\.isPackaged\) app\.setLoginItemSettings/.test(main) || !/reminderSound: false/.test(read('src/main/settings-store.js'))) throw new Error('Reminder sound and packaged login settings are missing or not gated');
if (/notificationAdapter/.test(main) || /notification\.result/.test(read('src/main/preload.js'))) throw new Error('Reminder native notification adapter should be removed');
if (!/label: 'Open log folder'/.test(appMenu) || !/preferences\.openLogFolder/.test(appMenu)) throw new Error('Open log folder menu item is missing');
if (!/Open DevTools for the Ask window/.test(appMenu) || !/CURIE_DEBUG/.test(main)) throw new Error('Ask DevTools menu item must be available only in debug mode');
const modelDefinitionFiles = sourceFiles.filter((file) => fs.readFileSync(file, 'utf8').includes('gemini-3.5-flash'));
if (modelDefinitionFiles.length !== 1 || path.relative(root, modelDefinitionFiles[0]) !== 'src/main/settings-store.js'
    || !/model: provider\.id === 'gemini' \? settings\.geminiModel/.test(main)
    || !/model: DEFAULT_SETTINGS\.geminiModel/.test(read('src/agent/providers.js'))) {
  throw new Error('Gemini default model must be defined once in settings and shared by tests and agent requests');
}

process.stdout.write(`Doctor passed: syntax checked ${sourceFiles.length} source files and verified ${routes.length} IPC routes.\n`);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listJavaScript(target) : entry.isFile() && target.endsWith('.js') ? [target] : [];
  });
}
