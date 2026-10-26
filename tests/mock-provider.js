import http from 'node:http';

const PROVIDERS = Object.freeze({
  gemini: { prefix: '/gemini/v1beta/openai/', key: 'mock-gemini-key' },
  groq: { prefix: '/groq/openai/v1/', key: 'mock-groq-key' },
});

export function createMockProviderServer() {
  const scripts = new Map(Object.keys(PROVIDERS).map((id) => [id, []]));
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const found = Object.entries(PROVIDERS).find(([, config]) => request.url?.startsWith(config.prefix));
    if (!found) return send(response, 404, { error: { message: 'Unknown mock provider route.' } });
    const [provider, config] = found;
    if (request.method !== 'POST' || request.url.slice(config.prefix.length) !== 'chat/completions') return send(response, 404, { error: { message: 'Unknown mock endpoint.' } });
    if (request.headers.authorization !== `Bearer ${config.key}`) return send(response, 400, { error: { message: 'Authorization: Bearer is required.' } });
    const body = await readJson(request);
    requests.push({ provider, path: request.url, body });
    const instruction = scripts.get(provider).shift() || { type: '500' };
    if (instruction.type === 'timeout') return;
    if (instruction.type === '429') return send(response, 429, { error: { message: 'Mock rate limit.' } });
    if (instruction.type === '500') return send(response, 500, { error: { message: 'Mock server error.' } });
    if (instruction.type === '400') return send(response, 400, { error: { message: 'Mock bad request.' } });
    if (instruction.type !== 'completion') return send(response, 500, { error: { message: 'Unknown mock response script.' } });
    return send(response, 200, completionFor(provider, instruction));
  });

  function enqueue(provider, ...instructions) {
    const queue = scripts.get(provider);
    if (!queue) throw new TypeError(`Unknown mock provider: ${provider}`);
    queue.push(...instructions);
  }

  async function start() {
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
      });
    }
    return addresses();
  }

  async function close() {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  function addresses() {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Mock provider server has no TCP address.');
    const root = `http://127.0.0.1:${address.port}`;
    return { gemini: `${root}${PROVIDERS.gemini.prefix}`, groq: `${root}${PROVIDERS.groq.prefix.slice(0, -1)}` };
  }

  return { requests, enqueue, start, close, addresses };
}

export function mockToolCall(name, args, { id = 'mock-tool-call', signature = true, text = '' } = {}) {
  const call = { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
  if (signature) call.extra_content = { google: { thought_signature: 'mock-thought-signature' } };
  return { type: 'completion', message: { role: 'assistant', content: text, tool_calls: [call] }, finishReason: 'tool_calls' };
}

export function mockText(text) {
  return { type: 'completion', message: { role: 'assistant', content: text, tool_calls: [] }, finishReason: 'stop' };
}

function completionFor(provider, instruction) {
  return {
    id: 'mock-completion', object: 'chat.completion',
    model: provider === 'gemini' ? 'gemini-3.5-flash-lite' : 'openai/gpt-oss-120b',
    choices: [{ index: 0, message: instruction.message, finish_reason: instruction.finishReason || 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 7, completion_tokens_details: { reasoning_tokens: 1 } },
  };
}

function send(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
