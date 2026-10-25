const status = document.querySelector('#status');
const gemini = document.querySelector('#gemini');
const groq = document.querySelector('#groq');
const modelSelect = (provider) => document.querySelector(`#${provider}-model`);

function setModelOptions(provider, models, preferred) {
  const select = modelSelect(provider);
  const unique = [...new Set([preferred, ...models].filter((model) => typeof model === 'string' && model))];
  select.replaceChildren(...unique.map((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    return option;
  }));
}

window.curieKeys.status().then((value) => {
  status.textContent = `Gemini key present: ${value.gemini ? 'yes' : 'no'}; Groq key present: ${value.groq ? 'yes' : 'no'}${value.encryptionAvailable ? '' : ' · Secure key storage unavailable'}`;
  for (const provider of ['gemini', 'groq']) setModelOptions(provider, [], value.models?.[provider]);
});

document.querySelector('#save').addEventListener('click', async () => {
  try {
    const result = await window.curieKeys.save({ geminiApiKey: gemini.value, groqApiKey: groq.value });
    gemini.value = '';
    groq.value = '';
    status.textContent = `Saved securely. Gemini key present: ${result.gemini ? 'yes' : 'no'}; Groq key present: ${result.groq ? 'yes' : 'no'}`;
  } catch (error) {
    status.textContent = error.message || 'Secure key storage is unavailable. Keys were not saved.';
  }
});

document.querySelectorAll('[data-test]').forEach((button) => button.addEventListener('click', async () => {
  const provider = button.dataset.test;
  const key = provider === 'gemini' ? gemini.value : groq.value;
  status.textContent = 'Testing provider from the main process...';
  try {
    const result = await window.curieKeys.test(provider, key, modelSelect(provider).value);
    status.textContent = result.message;
    if (result.availableModels?.length) {
      setModelOptions(provider, result.availableModels, result.availableModels[0]);
      status.textContent += ` Available models loaded from the provider (${result.availableModels.length}); choose one above and test again.`;
    }
  } catch {
    status.textContent = 'Test could not be completed (unknown error).';
  }
}));
