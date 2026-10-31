import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLocalIntent } from '../src/core/local-intent.js';

const NOW = Date.parse('2026-10-28T04:30:00Z'); // 10:00 IST
const TIME_ZONE = 'Asia/Kolkata';
const tasks = [
  { id: 't1', title: 'Physics: MEC', status: 'todo', due: '2026-10-28T12:30:00Z' }, // 18:00 IST
  { id: 't2', title: 'Submit article', status: 'todo', due: '2026-10-28T16:30:00Z' }, // 22:00 IST
  { id: 't3', title: 'Old draft', status: 'todo', due: '2026-10-27T12:30:00Z' },
  { id: 't4', title: 'Finished', status: 'done', due: '2026-10-28T09:30:00Z' },
];

function route(text, extra = {}) {
  return routeLocalIntent(text, { tasks, now: NOW, timeZone: TIME_ZONE, ...extra });
}

test('a plain greeting is answered locally with the day summary', () => {
  const result = route('hi');
  assert.equal(result.kind, 'greeting');
  assert.match(result.text, /^Good morning\./);
  assert.match(result.text, /1 overdue/);
  assert.match(result.text, /2 today: Physics: MEC at 6:00 pm, Submit article at 10:00 pm/);
});

test('"hi how are you" is local and does not call the model', () => {
  const result = route('hi how are you');
  assert.equal(result.kind, 'status');
  assert.match(result.text, /^Doing fine\./);
});

test('thanks, capability, and day-status questions are local', () => {
  assert.deepEqual(route('thanks'), { kind: 'thanks', text: 'Anytime.' });
  assert.match(route('what can you do').text, /tasks and reminders/);
  assert.match(route('what is on my plate').text, /2 today/);
  assert.match(route('what should I do next').text, /2 today/);
});

test('a greeting with real work attached goes to the model', () => {
  assert.equal(route('hi good morning, heres my work for today 5 physics chapters from MEC to EMwaves, schedule my day'), null);
  assert.equal(route('hey can you add a task for tomorrow'), null);
});

test('new tasks and ambiguous requests are never intercepted', () => {
  assert.equal(route('remind me to send the draft at 6'), null);
  assert.equal(route('plan my day from 5 to 10'), null);
  assert.equal(route('i finished the physics chapter'), null);
  assert.equal(route('why did you snooze it'), null);
});

test('no tasks gives an honest empty answer', () => {
  assert.equal(routeLocalIntent('hi', { tasks: [], now: NOW, timeZone: TIME_ZONE }).text, 'Good morning. Nothing on the list right now.');
  assert.equal(routeLocalIntent('how are you', { tasks: [], now: NOW, timeZone: TIME_ZONE }).text, 'Doing fine. Nothing on the list right now.');
});

test('very long messages are left to the model', () => {
  assert.equal(route(`hi ${'x'.repeat(200)}`), null);
});
