// Common waiting scenarios, virtual transport only: never a macOS delivery receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/extension-vm.mjs';
const source = new URL('../src/pi-notify-mac.ts', import.meta.url);
const ready = async label => {
  const h = await harness(source, { env: { TERM_PROGRAM: 'Apple_Terminal' } });
  h.state.sessionFile = `/fixtures/${label}.jsonl`;
  await h.emit('session_start');
  return h;
};
const alerts = h => h.calls.filter(c => c.command === 'osascript' && c.args.at(-1).startsWith('display alert'));
const sounds = h => h.calls.filter(c => c.command === 'afplay');
const completions = h => h.calls.filter(c => c.command === 'osascript' && c.args.at(-1).startsWith('display notification'));
const question = (h, phase) => h.emitBus('pi:input-required', { version: 1, source: 'ask_user_question', id: 'same-opaque-id', phase });
const start = async h => {
  question(h, 'start');
  await h.emit('ui_prompt_start', { kind: 'custom' });
  h.clock.advance(250);
};

test('two waiting sessions isolate prompt cancellation even with the same question id', async () => {
  const [a, b] = await Promise.all([ready('session-a'), ready('session-b')]);
  await start(a); await start(b);
  assert.equal(alerts(a).length, 1); assert.equal(alerts(b).length, 1);
  // Resolve A without first dismissing its OS alert. This is a synthetic lifecycle
  // event, not an automated answer to any real question or a claim of native close.
  question(a, 'end'); await a.emit('ui_prompt_end');
  assert.ok(alerts(a)[0].aborted); assert.ok(sounds(a)[0].aborted);
  assert.equal(alerts(b)[0].aborted, false);
  a.clock.advance(60000); b.clock.advance(29999);
  assert.equal(sounds(a).length, 1); assert.equal(sounds(b).length, 1);
  b.clock.advance(1); assert.equal(sounds(b).length, 2);
  assert.equal(alerts(b).length, 1, 'sound repetition must not spawn a second alert');
  alerts(a)[0].finish(null, 'button returned:去终端处理');
  assert.equal(a.calls.filter(c => c.command === 'osascript' && !/display (alert|notification)/.test(c.args.at(-1))).length, 0);
  assert.equal(completions(a).length + completions(b).length, 0, 'input resolution is not task completion');
  question(b, 'end'); await b.emit('ui_prompt_end');
  assert.ok(alerts(b)[0].aborted); assert.equal(a.clock.pending + b.clock.pending, 0);
});

test('full default thirty-second boundaries repeat only while that session remains waiting', async () => {
  const h = await ready('repeat-window'); await start(h);
  assert.equal(sounds(h).length, 1);
  h.clock.advance(29999); assert.equal(sounds(h).length, 1);
  h.clock.advance(1); assert.equal(sounds(h).length, 2);
  h.clock.advance(29999); assert.equal(sounds(h).length, 2);
  h.clock.advance(1); assert.equal(sounds(h).length, 3);
  assert.equal(alerts(h).length, 1);
  question(h, 'end'); await h.emit('ui_prompt_end'); h.clock.advance(90000);
  assert.equal(sounds(h).length, 3); assert.equal(h.clock.pending, 0);
  assert.equal(completions(h).length, 0);
});

for (const invalidate of ['session_start', 'session_shutdown', 'agent_start']) test(`${invalidate} in A does not cancel B or borrow its completion`, async () => {
  const a = await ready('invalidate-a'), b = await ready('invalidate-b');
  await start(a); await start(b);
  await a.emit(invalidate);
  assert.ok(alerts(a)[0].aborted); assert.equal(alerts(b)[0].aborted, false);
  a.clock.advance(30000); b.clock.advance(30000);
  assert.equal(sounds(a).length, 1); assert.equal(sounds(b).length, 2);
  assert.equal(completions(a).length + completions(b).length, 0);
  question(b, 'end'); await b.emit('ui_prompt_end');
  assert.equal(a.clock.pending + b.clock.pending, 0);
});

test('acknowledging A silences only A and does not resolve either question', async () => {
  const a = await ready('dismiss-a'), b = await ready('dismiss-b');
  await start(a); await start(b);
  alerts(a)[0].finish(null, 'button returned:知道了');
  a.clock.advance(30000); b.clock.advance(30000);
  assert.equal(sounds(a).length, 1); assert.equal(sounds(b).length, 2);
  for (const h of [a, b]) {
    await h.commands.get('notify-status').handler('', h.ctx);
    assert.match(h.notifications.at(-1).message, /waiting-for-input/);
    assert.equal(completions(h).length, 0);
    question(h, 'end'); await h.emit('ui_prompt_end');
  }
  assert.equal(a.clock.pending + b.clock.pending, 0);
});
