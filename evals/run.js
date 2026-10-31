import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockProviderServer, mockToolCall, mockText } from '../tests/mock-provider.js';
import { createProviderClient, providersFromEnv } from '../src/agent/providers.js';
import { createAgentController } from '../src/agent/controller.js';
import { createAgentTools } from '../src/agent/tools.js';
import { createTaskService } from '../src/main/task-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_PATH = path.join(__dirname, 'scenarios.json');
const RESULTS_PATH = path.join(__dirname, 'results.json');

const MAX_LIVE_CALLS = 30;
const LIVE_DELAY_MS = 15_000;

function getMockToolArgs(toolName, scenario) {
  const { taskContext, now, expected } = scenario;
  const nowMs = Date.parse(now);
  const firstOpenTask = taskContext.find((t) => t.status === 'todo');

  // Extract expected values from checks
  const expectedArgs = {};
  if (expected?.checks) {
    for (const check of expected.checks) {
      if (check.type === 'hasArgument') {
        if (check.valueEquals !== undefined) {
          expectedArgs[check.name] = check.valueEquals;
        } else if (check.valueContains !== undefined) {
          // For contains, we'll use the contained string as the value
          expectedArgs[check.name] = check.valueContains;
        }
      } else if (check.type === 'timeWithin') {
        expectedArgs[check.name] = check.expectedIso;
      }
    }
  }

  switch (toolName) {
    case 'add_task':
      return {
        title: expectedArgs.title || 'Mock task',
        remind_at_iso: expectedArgs.remind_at_iso || new Date(nowMs + 10 * 60 * 1000).toISOString(),
      };
    case 'complete_task':
    case 'delete_task':
      return { id: expectedArgs.id || firstOpenTask?.id || 'task-1' };
    case 'set_reminder':
      return {
        task_id: expectedArgs.task_id || firstOpenTask?.id || 'task-1',
        remind_at_iso: expectedArgs.remind_at_iso || new Date(nowMs + 60 * 60 * 1000).toISOString(),
      };
    case 'list_tasks':
      return { filter: 'open' };
    case 'start_focus':
      return {};
    default:
      return {};
  }
}

function loadScenarios() {
  const raw = fs.readFileSync(SCENARIOS_PATH, 'utf8');
  return JSON.parse(raw);
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    live: args.includes('--live'),
    help: args.includes('--help') || args.includes('-h'),
    scenarioId: args.find((a) => a.startsWith('--scenario='))?.split('=')[1],
  };
}

function printHelp() {
  console.log(`
Eval runner for Curie agent.

Usage:
  node evals/run.js                Run all scenarios against mock provider
  node evals/run.js --live         Run against real providers (requires API keys)
  node evals/run.js --scenario=<id> Run a single scenario by ID

Live mode:
  - Hard cap of ${MAX_LIVE_CALLS} provider calls per run
  - ${LIVE_DELAY_MS / 1000}s delay between calls
  - Reads keys from GEMINI_API_KEY / GROQ_API_KEY env vars
  - Uses the same provider config as the app (providersFromEnv)
`);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTable(results) {
  const header = '| Scenario | Status | Tool | Checks Passed | Checks Total | Details |';
  const sep = '|---|---|---|---|---|---|';
  const rows = results.map((r) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    const tool = r.actualTool || '—';
    const checks = `${r.checksPassed}/${r.checksTotal}`;
    const detail = r.passed ? '' : r.failures.join('; ');
    return `| ${r.scenarioId} | ${status} | ${tool} | ${checks} | ${detail} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function runCheckers(toolCall, expected, _now) {
  const results = [];
  const failures = [];

  for (const check of expected.checks) {
    let passed = false;
    let message = '';

    switch (check.type) {
      case 'hasArgument': {
        const value = toolCall.args?.[check.name];
        if (check.valueEquals !== undefined) {
          passed = value === check.valueEquals;
          message = passed ? '' : `expected ${check.name}=${check.valueEquals}, got ${value}`;
        } else if (check.valueContains !== undefined) {
          passed = typeof value === 'string' && value.includes(check.valueContains);
          message = passed ? '' : `expected ${check.name} to contain "${check.valueContains}", got ${value}`;
        } else {
          passed = value !== undefined && value !== null;
          message = passed ? '' : `missing argument ${check.name}`;
        }
        break;
      }
      case 'timeWithin': {
        const value = toolCall.args?.[check.name];
        if (typeof value === 'string' && check.expectedIso) {
          const actualMs = Date.parse(value);
          const expectedMs = Date.parse(check.expectedIso);
          if (Number.isFinite(actualMs) && Number.isFinite(expectedMs)) {
            const diff = Math.abs(actualMs - expectedMs);
            passed = diff <= (check.toleranceSeconds || 30) * 1000;
            message = passed ? '' : `time diff ${diff}ms exceeds tolerance ${(check.toleranceSeconds || 30) * 1000}ms`;
          } else {
            passed = false;
            message = 'invalid ISO time';
          }
        } else {
          passed = false;
          message = `missing or invalid ${check.name}`;
        }
        break;
      }
      case 'mustNotContain': {
        const text = JSON.stringify(toolCall);
        const found = check.phrases.find((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
        passed = !found;
        message = passed ? '' : `contains forbidden phrase: ${found}`;
        break;
      }
      case 'textOnly': {
        const text = typeof toolCall.text === 'string' ? toolCall.text : '';
        passed = text.length <= (check.maxLength || 500);
        message = passed ? '' : `text length ${text.length} exceeds max ${check.maxLength}`;
        break;
      }
      default:
        passed = false;
        message = `unknown check type: ${check.type}`;
    }

    results.push({ type: check.type, name: check.name, passed, message });
    if (!passed) failures.push(`${check.type}(${check.name}): ${message}`);
  }

  return { results, failures };
}

async function runScenario(scenario, mockProvider, providers, live = false) {
  const { id, userMessage, taskContext, now, expected } = scenario;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error(`Invalid now timestamp: ${now}`);

  const tempDir = fs.mkdtempSync(path.join(path.dirname(SCENARIOS_PATH), 'eval-'));
  const taskFile = path.join(tempDir, 'tasks.json');

  const taskService = createTaskService({
    filePath: taskFile,
    onReminder: () => {},
  });

  // Seed tasks from context
  for (const task of taskContext) {
    if (task.status === 'todo') {
      taskService.add({
        id: task.id,
        title: task.title,
        due: task.due,
        reminder: null,
        status: 'todo',
        created: nowMs,
      });
    }
  }

  const tools = createAgentTools({ taskService, timerService: { dispatch: () => ({ phase: 'FOCUS' }) }, clock: () => nowMs });
  const providerClient = createProviderClient({
    providers,
    timeoutMs: live ? 30_000 : 150,
    geminiTimeoutMs: live ? 30_000 : 150,
    cooldownMs: live ? 0 : 0,
    onAttempt: (event) => console.log(`    Provider attempt: ${event.provider} ${event.errorType || 'ok'} ${event.latencyMs}ms`),
    onStage: (event) => console.log(`    Provider stage: ${event.stage} ${event.provider || ''} ${event.status || ''}`),
  });

  let confirm = async () => false;
  let lastProposal = null;

  const controller = createAgentController({
    providerClient,
    taskService,
    executeTool: tools.executeTool,
    executeApprovedTool: tools.executeApprovedTool,
    confirmProposals: (proposals) => {
      lastProposal = proposals[0];
      return confirm(proposals);
    },
    clock: () => nowMs,
  });

  // If using mock provider, enqueue expected response
  if (!live && mockProvider) {
    // We'll let the mock provider handle the first request based on what the model calls
    // The mock provider returns whatever we enqueue
  }

  let result;
  let error = null;
  const abortController = new AbortController();

  try {
    result = await controller.send(userMessage, { signal: abortController.signal });
  } catch (e) {
    error = e;
  }

  taskService.stop();
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (error) {
    return {
      scenarioId: id,
      passed: false,
      actualTool: null,
      checksPassed: 0,
      checksTotal: expected.checks.length,
      failures: [`Controller error: ${error.message}`],
    };
  }

  // Extract the tool call from result
  const toolCalls = result.toolCalls || [];
  const actualTool = toolCalls[0] || null;

  if (!actualTool || actualTool !== expected.toolName) {
    return {
      scenarioId: id,
      passed: false,
      actualTool: actualTool || 'none',
      checksPassed: 0,
      checksTotal: expected.checks.length,
      failures: [`Expected tool ${expected.toolName}, got ${actualTool || 'none'}`],
    };
  }

  // Get the tool call details from the last proposal
  const toolCall = lastProposal ? { args: lastProposal.args, text: result.text } : { args: {}, text: result.text };

  const { results: checkResults, failures } = runCheckers(toolCall, expected, nowMs);
  const passed = failures.length === 0;
  const checksPassed = checkResults.filter((c) => c.passed).length;

  return {
    scenarioId: id,
    passed,
    actualTool,
    checksPassed,
    checksTotal: expected.checks.length,
    failures,
    checkDetails: checkResults,
  };
}

async function runEvals() {
  const { live, help, scenarioId } = parseArgs();

  if (help) {
    printHelp();
    return;
  }

  const scenarios = loadScenarios();
  const filtered = scenarioId ? scenarios.filter((s) => s.id === scenarioId) : scenarios;

  if (filtered.length === 0) {
    console.error(`No scenarios found${scenarioId ? ` for ID: ${scenarioId}` : ''}`);
    process.exit(1);
  }

  console.log(`Running ${filtered.length} scenario(s) in ${live ? 'LIVE' : 'MOCK'} mode...\n`);

  // Start mock provider server if not live
  let mockProvider = null;
  if (!live) {
    mockProvider = createMockProviderServer();
    await mockProvider.start();
  }

  // Get providers (mock URLs or real from env)
  let providers;
  if (!live && mockProvider) {
    const endpoints = mockProvider.addresses();
    providers = providersFromEnv({
      GEMINI_API_KEY: 'mock-gemini-key',
      GROQ_API_KEY: 'mock-groq-key',
      GEMINI_BASE_URL: endpoints.gemini,
      GROQ_BASE_URL: endpoints.groq,
    });
  } else {
    providers = providersFromEnv(process.env);
    // Validate at least one key exists
    const hasKey = providers.some((p) => p.apiKey);
    if (!hasKey) {
      console.error('No API keys found. Set GEMINI_API_KEY or GROQ_API_KEY for live mode.');
      process.exit(1);
    }
  }

  // Pre-enqueue mock responses for all scenarios (if not live)
  if (!live && mockProvider) {
    for (const scenario of filtered) {
      const mockArgs = getMockToolArgs(scenario.expected.toolName, scenario);
      // Each scenario needs exactly 2 responses per provider: tool call + final text
      mockProvider.enqueue('gemini', mockToolCall(scenario.expected.toolName, mockArgs), mockText('Done.'));
      mockProvider.enqueue('groq', mockToolCall(scenario.expected.toolName, mockArgs), mockText('Done.'));
    }
  }

  const results = [];
  let liveCallCount = 0;

  for (let i = 0; i < filtered.length; i++) {
    const scenario = filtered[i];

    // Live mode rate limiting
    if (live) {
      if (liveCallCount >= MAX_LIVE_CALLS) {
        console.error(`\n⚠️  Live call cap (${MAX_LIVE_CALLS}) reached. Stopping.`);
        break;
      }
      if (i > 0) {
        console.log(`  Waiting ${LIVE_DELAY_MS / 1000}s before next scenario...`);
        await delay(LIVE_DELAY_MS);
      }
      liveCallCount++;
    }

    console.log(`  Running: ${scenario.id}...`);
    const result = await runScenario(scenario, mockProvider, providers, live);
    // Debug: print mock requests
    if (!live && mockProvider) {
      console.log(`    Mock requests: ${mockProvider.requests.length}`);
      for (const req of mockProvider.requests.slice(-4)) {
        console.log(`      ${req.provider}: ${req.path} -> ${JSON.stringify(req.body).slice(0, 100)}`);
      }
    }
    results.push(result);

    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`    ${status} (${result.checksPassed}/${result.checksTotal} checks)`);
    if (!result.passed) {
      for (const f of result.failures) console.log(`      - ${f}`);
    }
  }

  if (!live && mockProvider) {
    await mockProvider.close();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed}/${total} passed`);
  console.log(`\n${formatTable(results)}`);

  // Write JSON results
  const jsonOutput = {
    timestamp: new Date().toISOString(),
    mode: live ? 'live' : 'mock',
    summary: { passed, total },
    scenarios: results,
  };
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(jsonOutput, null, 2));
  console.log(`\nJSON results written to: ${RESULTS_PATH}`);

  if (passed < total) process.exit(1);
}

// Pure checker tests (run with --test-checkers)
async function runCheckerTests() {
  const _now = Date.parse('2026-10-27T18:00:00+05:30');

  const testCases = [
    {
      name: 'hasArgument - equals match',
      toolCall: { args: { id: 'task-1' }, text: 'Done' },
      check: { type: 'hasArgument', name: 'id', valueEquals: 'task-1' },
      expectPass: true,
    },
    {
      name: 'hasArgument - equals mismatch',
      toolCall: { args: { id: 'task-2' }, text: 'Done' },
      check: { type: 'hasArgument', name: 'id', valueEquals: 'task-1' },
      expectPass: false,
    },
    {
      name: 'hasArgument - contains match',
      toolCall: { args: { title: 'stretch now' }, text: 'Done' },
      check: { type: 'hasArgument', name: 'title', valueContains: 'stretch' },
      expectPass: true,
    },
    {
      name: 'timeWithin - within tolerance',
      toolCall: { args: { remind_at_iso: '2026-10-27T18:10:05+05:30' }, text: 'Done' },
      check: { type: 'timeWithin', name: 'remind_at_iso', expectedIso: '2026-10-27T18:10:00+05:30', toleranceSeconds: 30 },
      expectPass: true,
    },
    {
      name: 'timeWithin - exceeds tolerance',
      toolCall: { args: { remind_at_iso: '2026-10-27T18:11:00+05:30' }, text: 'Done' },
      check: { type: 'timeWithin', name: 'remind_at_iso', expectedIso: '2026-10-27T18:10:00+05:30', toleranceSeconds: 30 },
      expectPass: false,
    },
    {
      name: 'mustNotContain - clean',
      toolCall: { args: { title: 'stretch' }, text: 'Reminder saved.' },
      check: { type: 'mustNotContain', phrases: ['cancelled', 'error', 'failed'] },
      expectPass: true,
    },
    {
      name: 'mustNotContain - forbidden phrase in text',
      toolCall: { args: { title: 'stretch' }, text: 'Reminder cancelled.' },
      check: { type: 'mustNotContain', phrases: ['cancelled', 'error', 'failed'] },
      expectPass: false,
    },
    {
      name: 'textOnly - within limit',
      toolCall: { args: {}, text: 'Short.' },
      check: { type: 'textOnly', maxLength: 100 },
      expectPass: true,
    },
    {
      name: 'textOnly - exceeds limit',
      toolCall: { args: {}, text: 'x'.repeat(150) },
      check: { type: 'textOnly', maxLength: 100 },
      expectPass: false,
    },
  ];

  let pass = 0;
  let fail = 0;

  for (const tc of testCases) {
    const { failures } = runCheckers(tc.toolCall, { checks: [tc.check] }, _now);
    const passed = failures.length === 0;
    if (passed === tc.expectPass) {
      console.log(`✅ ${tc.name}`);
      pass++;
    } else {
      console.log(`❌ ${tc.name} (expected ${tc.expectPass ? 'pass' : 'fail'}, got ${passed ? 'pass' : 'fail'})`);
      console.log(`   failures: ${failures.join(', ')}`);
      fail++;
    }
  }

  console.log(`\nChecker tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

// Entry point
const isTestCheckers = process.argv.includes('--test-checkers');

if (isTestCheckers) {
  runCheckerTests().catch((e) => { console.error(e); process.exit(1); });
} else {
  runEvals().catch((e) => { console.error(e); process.exit(1); });
}