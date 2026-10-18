import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { harness } from './helpers/extension-vm.mjs';

const source = process.env.PI_NOTIFY_TEST_SOURCE ? pathToFileURL(process.env.PI_NOTIFY_TEST_SOURCE) : new URL('../src/pi-notify-mac.ts', import.meta.url);
const ready = async options => {
  const h = await harness(source, { ...options, env: { TERM_PROGRAM: 'Apple_Terminal', ...options?.env } });
  await h.emit('session_start'); return h;
};
const alerts = h => h.calls.filter(c => c.command === 'osascript' && c.args.at(-1).startsWith('display alert'));
const sounds = h => h.calls.filter(c => c.command === 'afplay');
const focuses = h => h.calls.filter(c => c.command === 'osascript' && !/display (alert|notification)/.test(c.args.at(-1)));
const prompt = (h, kind = 'confirm') => h.emit('ui_prompt_start', { kind, title: 'private-title-sentinel' });
const question = (h, phase = 'start', id = 'question') => {
  if (phase === 'tool_call') return h.emit('tool_call', { toolName: 'ask_user_question', toolCallId: id, input: { question: 'private-question-sentinel' } });
  return h.emitBus('pi:input-required', { version: 1, source: 'ask_user_question', id, phase: phase === 'tool_execution_end' ? 'end' : 'start' });
};

for (const kind of ['confirm', 'select', 'input', 'editor']) test(`${kind} uses one cancellable delayed reminder without prompt payload`, async () => {
  const h = await ready(); await prompt(h, kind);
  assert.equal(h.calls.length, 0); assert.equal(h.clock.pending, 1);
  h.clock.advance(249); assert.equal(h.calls.length, 0); h.clock.advance(1);
  assert.equal(alerts(h).length, 1); assert.equal(sounds(h).length, 1);
  assert.equal(sounds(h)[0].args[0], '/System/Library/Sounds/Hero.aiff');
  assert.deepEqual(h.outputs, ['\x07']); assert.ok(h.clock.unrefs >= 2);
  assert.ok(!JSON.stringify(h.calls.map(c => c.args)).includes('private-title-sentinel'));
  await h.emit('ui_prompt_end'); assert.equal(h.clock.pending, 0);
  assert.ok(alerts(h)[0].aborted); assert.ok(sounds(h)[0].aborted);
});

test('quickly resolved prompts never start a subprocess', async () => {
  const h = await ready(); await prompt(h); await h.emit('ui_prompt_end'); h.clock.advance(100000);
  assert.equal(h.calls.length, 0); assert.equal(h.clock.pending, 0);
});

test('duplicate start and acknowledgement cannot duplicate or answer a prompt', async () => {
  const h = await ready(); await prompt(h); await prompt(h); h.clock.advance(250);
  assert.equal(alerts(h).length, 1);
  alerts(h)[0].finish(new Error('User cancelled: private-error-sentinel'));
  await prompt(h); h.clock.advance(100000);
  assert.equal(alerts(h).length, 1); assert.equal(sounds(h).length, 1); assert.equal(focuses(h).length, 0);
  await h.commands.get('notify-status').handler('', h.ctx);
  assert.match(h.notifications.at(-1).message, /waiting-for-input/);
  assert.ok(!h.errors.join('').includes('private-error-sentinel'));
  await h.emit('ui_prompt_end');
  await prompt(h); h.clock.advance(250); assert.equal(alerts(h).length, 2);
  await h.emit('session_shutdown');
});

test('repeat sounds stop on UI resolution while an already-open alert is aborted', async () => {
  const h = await ready(); await prompt(h); h.clock.advance(250);
  h.clock.advance(29999); assert.equal(sounds(h).length, 1); h.clock.advance(1); assert.equal(sounds(h).length, 2);
  await h.emit('ui_prompt_end'); h.clock.advance(100000);
  assert.equal(sounds(h).length, 2); assert.equal(h.clock.pending, 0); assert.ok(alerts(h)[0].aborted);
});

for (const event of ['session_start', 'session_shutdown', 'agent_start']) for (const dispatched of [false, true]) test(`${event} cancels ${dispatched ? 'active' : 'pending'} prompt work`, async () => {
  const h = await ready(); await prompt(h); if (dispatched) h.clock.advance(250);
  const old = alerts(h)[0]; await h.emit(event); h.clock.advance(100000);
  if (old) { assert.ok(old.aborted); old.finish(null, 'button returned:去终端处理'); }
  assert.equal(focuses(h).length, 0); assert.equal(h.clock.pending, 0);
  if (!dispatched) assert.equal(h.calls.length, 0);
});

test('custom UI reminds only during actual question execution, once per outer interval', async () => {
  const h = await ready(); await question(h); await prompt(h, 'custom'); await prompt(h, 'custom'); h.clock.advance(250);
  assert.equal(alerts(h).length, 1);
  assert.ok(!JSON.stringify(h.calls.map(c => c.args)).includes('private-question-sentinel'));
  await h.emit('ui_prompt_end'); await question(h, 'tool_execution_end');
  await prompt(h, 'custom'); h.clock.advance(100000); assert.equal(alerts(h).length, 1);
});

test('unrelated custom UI stays silent without the question producer event', async () => {
  const h = await ready();
  await prompt(h, 'custom'); h.clock.advance(100000);
  assert.equal(h.calls.length, 0); assert.equal(h.clock.pending, 0);
});

test('malformed or unbound events cannot start or cancel another question reminder', async () => {
  const h = await ready();
  for (const data of [null, {}, { version: 2, source: 'ask_user_question', id: 'a', phase: 'start' }, { version: 1, source: 'another-tool', id: 'a', phase: 'start' }]) h.emitBus('pi:input-required', data);
  assert.equal(h.clock.pending, 0);
  await question(h); h.clock.advance(250); await question(h, 'tool_execution_end', 'different-question');
  assert.equal(alerts(h)[0].aborted, false);
  await question(h, 'tool_execution_end'); assert.equal(alerts(h)[0].aborted, true);
});

test('bare tool_call, invalid question without UI and display custom UI stay silent', async () => {
  const h = await ready(); await question(h, 'tool_call'); h.clock.advance(100000); assert.equal(h.calls.length, 0);
  await question(h); await question(h, 'tool_execution_end'); await prompt(h, 'custom');
  h.clock.advance(100000); assert.equal(h.calls.length, 0);
  const display = await ready(); await prompt(display, 'custom'); display.clock.advance(100000); assert.equal(display.calls.length, 0); assert.equal(display.clock.pending, 0);
});

test('tool end and error cleanup cancel question custom UI but not unrelated standard prompts', async () => {
  const h = await ready(); await question(h); await prompt(h, 'custom'); h.clock.advance(250);
  await question(h, 'tool_execution_end'); assert.ok(alerts(h)[0].aborted); assert.equal(h.clock.pending, 0);
  await h.emit('ui_prompt_end'); await prompt(h, 'input');
  await question(h, 'tool_execution_end'); h.clock.advance(250); assert.equal(alerts(h).length, 2);
  await h.emit('ui_prompt_end');
});

for (const mode of ['rpc', 'json', 'print', undefined]) test(`${mode} prompt events never invoke effects or timers`, async () => {
  const h = await ready(); h.state.mode = mode; await question(h); await prompt(h); await prompt(h, 'custom');
  h.clock.advance(100000); assert.equal(h.calls.length, 0); assert.equal(h.outputs.length, 0); assert.equal(h.clock.pending, 0);
});

for (const condition of ['no-ui', 'stale', 'linux', 'win32']) test(`${condition} is silent`, async () => {
  const h = await ready({ platform: ['linux', 'win32'].includes(condition) ? condition : 'darwin' });
  if (condition === 'no-ui') h.state.hasUI = false;
  if (condition === 'stale') h.state.stale = true;
  await prompt(h); h.clock.advance(100000); assert.equal(h.calls.length, 0); assert.equal(h.clock.pending, 0);
});

test('mode changes during delay, tty lookup or sound repetition cancel safely', async () => {
  const early = await ready(); await prompt(early); early.state.mode = 'rpc'; early.clock.advance(250); assert.equal(early.calls.length, 0);
  const lookup = await ready({ deferPs: true }); await prompt(lookup); lookup.clock.advance(250); lookup.state.mode = 'rpc';
  lookup.calls[0].finish(null, 'ttys008'); assert.equal(alerts(lookup).length, 0);
  const late = await ready(); await prompt(late); late.clock.advance(250); late.state.mode = 'rpc'; late.clock.advance(30000);
  assert.ok(alerts(late)[0].aborted); assert.equal(sounds(late).length, 1); assert.equal(late.clock.pending, 0);
});

test('the two enable switches are independent', async () => {
  const input = await ready({ env: { PI_NOTIFY_MAC_COMPLETION: '0' } });
  await prompt(input); input.clock.advance(250); assert.equal(alerts(input).length, 1);
  await input.emit('ui_prompt_end'); await input.emit('agent_settled'); input.clock.advance(6000);
  assert.equal(input.calls.filter(c => c.args.at(-1).startsWith('display notification')).length, 0);
  const completion = await ready({ env: { PI_NOTIFY_MAC_INPUT: '0' } });
  await prompt(completion); completion.clock.advance(10000); assert.equal(completion.calls.length, 0);
  await completion.emit('ui_prompt_end'); await completion.emit('agent_settled'); completion.clock.advance(6000);
  assert.equal(completion.calls.length, 1); assert.match(completion.calls[0].args.at(-1), /^display notification/);
});

for (const off of ['0', 'false', 'off', ' FALSE ']) test(`input switch ${off} disables all input effects`, async () => {
  const h = await ready({ env: { PI_NOTIFY_MAC_INPUT: off } }); await prompt(h); h.clock.advance(100000);
  assert.equal(h.calls.length, 0); assert.equal(h.clock.pending, 0);
});

test('sound and repeat switches preserve the alert; TTY bell never pollutes redirected stdout', async () => {
  const h = await ready({ isTTY: false, env: { PI_NOTIFY_MAC_INPUT_SOUND: '' } }); await prompt(h); h.clock.advance(100000);
  assert.equal(alerts(h).length, 1); assert.equal(sounds(h).length, 0); assert.equal(h.outputs.length, 0); assert.equal(h.clock.pending, 0);
  await h.emit('ui_prompt_end');
  const single = await ready({ env: { PI_NOTIFY_MAC_INPUT_REPEAT_MS: '0', PI_NOTIFY_MAC_INPUT_SOUND: 'Ping' } }); await prompt(single); single.clock.advance(100000);
  assert.equal(sounds(single).length, 1); assert.equal(sounds(single)[0].args[0], '/System/Library/Sounds/Ping.aiff'); await single.emit('ui_prompt_end');
});

for (const value of ['-1', 'NaN', '1.5', '2147483648', '1']) test(`unsafe repeat ${value} falls back to thirty seconds`, async () => {
  const h = await ready({ env: { PI_NOTIFY_MAC_INPUT_REPEAT_MS: value } }); await prompt(h); h.clock.advance(250);
  h.clock.advance(1000); assert.equal(sounds(h).length, 1); h.clock.advance(29000); assert.equal(sounds(h).length, 2); await h.emit('ui_prompt_end');
});

test('custom delay supports zero and rejects overflowing values', async () => {
  const zero = await ready({ env: { PI_NOTIFY_MAC_INPUT_DELAY_MS: '0' } }); await prompt(zero); zero.clock.advance(1); assert.equal(alerts(zero).length, 1); await zero.emit('ui_prompt_end');
  const bad = await ready({ env: { PI_NOTIFY_MAC_INPUT_DELAY_MS: '2147483648' } }); await prompt(bad); bad.clock.advance(249); assert.equal(alerts(bad).length, 0); bad.clock.advance(1); assert.equal(alerts(bad).length, 1); await bad.emit('ui_prompt_end');
});

test('jump uses PID-addressed Terminal selection, time bounds and the originating tty', async () => {
  const h = await ready(); await prompt(h); h.clock.advance(250); alerts(h)[0].finish(null, 'button returned:去终端处理');
  assert.equal(focuses(h).length, 1); const call = focuses(h)[0];
  assert.equal(call.config.timeout, 2000); assert.match(call.args.at(-1), /code\("kpid"\)/); assert.match(call.args.at(-1), /\/dev\/ttys008/);
  assert.doesNotMatch(call.args.at(-1), /tell application "Terminal" to activate/);
  assert.equal(h.calls.find(c => c.command === 'ps').config.timeout, 1000); assert.equal(h.clock.pending, 0);
});

test('parent tty fallback is labeled truthfully; no tty or unknown terminal has no dead button', async () => {
  const parent = await ready({ ttys: ['??', 'ttys009'] }); await prompt(parent); parent.clock.advance(250);
  assert.match(alerts(parent)[0].args.at(-1), /返回父会话/); assert.equal(parent.calls.filter(c => c.command === 'ps').length, 2); await parent.emit('ui_prompt_end');
  for (const options of [{ ttys: ['??', '??'] }, { env: { TERM_PROGRAM: 'unknown' } }]) {
    const h = await ready(options); await prompt(h); h.clock.advance(250); assert.doesNotMatch(alerts(h)[0].args.at(-1), /去终端处理|返回父会话|打开终端应用/); await h.emit('ui_prompt_end');
  }
});

test('iTerm is precise; other known terminals advertise app-only fallback', async () => {
  const iterm = await ready({ env: { TERM_PROGRAM: 'iTerm.app' } }); await prompt(iterm); iterm.clock.advance(250); alerts(iterm)[0].finish(null, 'button returned:去终端处理');
  assert.match(focuses(iterm)[0].args.at(-1), /tty of s is "\/dev\/ttys008"/); await iterm.emit('ui_prompt_end');
  const app = await ready({ env: { TERM_PROGRAM: 'ghostty' } }); await prompt(app); app.clock.advance(250);
  assert.match(alerts(app)[0].args.at(-1), /打开终端应用/); alerts(app)[0].finish(null, 'button returned:打开终端应用');
  assert.match(app.errors.join(''), /app only/); await app.emit('ui_prompt_end');
});

test('focus failure is visible, sanitized, and never activates another Terminal instance', async () => {
  const h = await ready({ focusError: new Error('private-focus-sentinel') }); await prompt(h); h.clock.advance(250); alerts(h)[0].finish(null, 'button returned:去终端处理');
  assert.match(h.errors.join(''), /jump failed/); assert.ok(!h.errors.join('').includes('private-focus-sentinel')); assert.equal(focuses(h).length, 1); await h.emit('ui_prompt_end');
});

test('resolution aborts pending tty/focus processes, with no late focus or stale sound', async () => {
  const tty = await ready({ deferPs: true }); await prompt(tty); tty.clock.advance(250); await tty.emit('ui_prompt_end');
  assert.ok(tty.calls[0].aborted); tty.calls[0].finish(null, 'ttys008'); assert.equal(alerts(tty).length, 0);
  const focus = await ready({ deferFocus: true }); await prompt(focus); focus.clock.advance(250); alerts(focus)[0].finish(null, 'button returned:去终端处理');
  await focus.emit('ui_prompt_end'); assert.ok(focuses(focus)[0].aborted); assert.equal(focus.clock.pending, 0);
});

test('transport failures and invalid sound names do not throw or expose data', async () => {
  const h = await ready({ spawnThrows: true }); await prompt(h); assert.doesNotThrow(() => h.clock.advance(250)); assert.equal(h.clock.pending, 0);
  const sound = await ready({ env: { PI_NOTIFY_MAC_INPUT_SOUND: '../../private-path' } }); await prompt(sound); sound.clock.advance(250);
  assert.equal(sounds(sound)[0].args[0], '/System/Library/Sounds/Hero.aiff'); sounds(sound)[0].finish(new Error('private-sound-sentinel'));
  assert.ok(!sound.errors.join('').includes('private-sound-sentinel')); await sound.emit('ui_prompt_end');
});

test('input and completion reminders cooperate without a stale or double notification', async () => {
  const h = await ready(); await h.emit('agent_settled'); h.clock.advance(1000); await prompt(h); h.clock.advance(250);
  assert.equal(alerts(h).length, 1); assert.equal(h.calls.filter(c => c.args.at(-1).startsWith('display notification')).length, 0);
  await h.emit('ui_prompt_end'); assert.ok(alerts(h)[0].aborted); h.clock.advance(6000);
  assert.equal(h.calls.filter(c => c.args.at(-1).startsWith('display notification')).length, 1);
  assert.equal(h.clock.pending, 0);
});
