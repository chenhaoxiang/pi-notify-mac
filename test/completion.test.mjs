import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { harness, OWNER, OTHER, entry } from './helpers/extension-vm.mjs';

const production = new URL('../src/pi-notify-mac.ts', import.meta.url);
const manual = new URL('./fixtures/manual-unversioned.source.txt', import.meta.url);
const ready = async options => { const h = await harness(production, options); await h.emit('session_start'); return h; };
const quiet = h => { assert.equal(h.calls.length, 0); assert.equal(h.outputs.length, 0); };

test('retain all four baseline delivery helper bodies verbatim', async () => {
  const a = await readFile(production, 'utf8'), b = await readFile(manual, 'utf8');
  for (const name of ['appleScriptString', 'sendMacNotification', 'setTerminalTitle', 'getProjectName']) {
    const p = new RegExp('^function ' + name + '\\b.*?^\\}', 'ms');
    assert.equal(p.exec(a)?.[0], p.exec(b)?.[0]);
  }
});

test('registration has no side effects; default grace emits exactly one notification/title/bell', async () => {
  const h = await ready(); assert.equal(h.reads.length, 0); assert.equal(h.clock.pending, 0);
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 1); assert.equal(h.clock.unrefs, 1);
  assert.deepEqual(h.delays, [6000]); quiet(h);
  h.clock.advance(5999); quiet(h); h.clock.advance(1);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].command, 'osascript');
  assert.deepEqual(h.outputs, ['\x1b]0;✓ demo\x07', '\x07']);
});

for (const mode of ['rpc', 'json', 'print', undefined]) test(`mode ${mode} is silent without status IO`, async () => {
  const h = await ready(); h.state.mode = mode; await h.emit('agent_settled');
  assert.equal(h.reads.length, 0); assert.equal(h.clock.pending, 0); quiet(h);
});

test('pending messages at scheduling and at dispatch both suppress', async () => {
  const first = await ready(); first.state.pending = true;
  await first.emit('agent_settled'); assert.equal(first.clock.pending, 0); quiet(first);
  const late = await ready(); await late.emit('agent_settled'); late.state.pending = true;
  late.clock.advance(6000); quiet(late);
});

for (const state of ['queued', 'running']) test(`same-session ${state} run prevents false completion`, async () => {
  const h = await ready(); h.run('own', { state, sessionId: OWNER });
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 0); quiet(h);
});

for (const state of ['complete', 'failed', 'partial', 'paused', 'stopped', 'rejected']) test(`known inactive ${state} follows parent settle, not child success`, async () => {
  const h = await ready(); h.run('own', { state, sessionId: OWNER });
  await h.emit('agent_settled'); h.clock.advance(6000); assert.equal(h.calls.length, 1);
});

for (const state of ['completed', 'future-state', 0, null, undefined]) test(`unrecognized status ${state} is uncertainty`, async () => {
  const h = await ready(); h.run('own', { state, sessionId: OWNER });
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 0); quiet(h);
});

test('other sessions do not block; missing ownership remains conservative', async () => {
  const h = await ready(); h.run('foreign', { state: 'running', sessionId: OTHER });
  h.child('foreign', 'child', { state: 'running', sessionId: '/fixtures/child.jsonl' });
  await h.emit('agent_settled'); h.clock.advance(6000); assert.equal(h.calls.length, 1);
  for (const sessionId of [undefined, 42]) {
    const unknown = await ready(); unknown.run('unknown', { state: 'running', sessionId });
    await unknown.emit('agent_settled'); assert.equal(unknown.clock.pending, 0);
  }
});

test('session-file identity wins over UUID; missing session file falls back to ID', async () => {
  const h = await ready(); h.run('uuid-only', { state: 'running', sessionId: h.state.sessionId });
  await h.emit('agent_settled'); h.clock.advance(6000); assert.equal(h.calls.length, 1);
  const fallback = await harness(production); fallback.state.sessionFile = undefined;
  await fallback.emit('session_start'); fallback.run('own', { state: 'running', sessionId: fallback.state.sessionId });
  await fallback.emit('agent_settled'); assert.equal(fallback.clock.pending, 0);
});

test('disk restoration finds a run without any started/completion event pairing', async () => {
  const h = await harness(production); h.run('restored', { state: 'running', sessionId: OWNER });
  await h.emit('session_start'); await h.emit('agent_settled'); assert.equal(h.clock.pending, 0);
});

test('nested child identity differs; ownership is the terminal parent root', async () => {
  const h = await ready(); h.run('root', { state: 'complete', sessionId: OWNER });
  h.child('root', 'leaf', { state: 'running', sessionId: '/fixtures/runner-child.jsonl' });
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 0);
});

test('nested future status and unreadable nested trees suppress', async () => {
  const unknown = await ready(); unknown.run('root', { state: 'complete', sessionId: OWNER });
  unknown.child('root', 'leaf', { state: 'future-state' });
  await unknown.emit('agent_settled'); assert.equal(unknown.clock.pending, 0);
  const io = await ready(); io.run('root', { state: 'complete', sessionId: OWNER });
  io.ioError('dir', io.nested); await io.emit('agent_settled'); assert.equal(io.clock.pending, 0);
});

test('run appearing during grace is checked again', async () => {
  const h = await ready(); await h.emit('agent_settled');
  h.run('new', { state: 'running', sessionId: OWNER }); h.clock.advance(6000); quiet(h);
});

test('authoritative directory indexes are skipped, unknown layouts suppress', async () => {
  const h = await ready(); h.dirs.set(h.top, [entry('.active-runs', false), entry('.terminal-runs')]);
  await h.emit('agent_settled'); h.clock.advance(6000); assert.equal(h.calls.length, 1);
  const bad = await ready(); bad.dirs.set(bad.top, [entry('stray-file', false)]);
  await bad.emit('agent_settled'); assert.equal(bad.clock.pending, 0);
});

for (const data of ['{synthetic-sentinel-not-credentials', 'null', '[]', '42']) test(`invalid status JSON/object ${data} suppresses without raw payload logging`, async () => {
  const h = await ready(); h.run('broken', data); await h.emit('agent_settled');
  assert.equal(h.clock.pending, 0); quiet(h);
  assert.ok(!h.errors.join('\n').includes('synthetic-sentinel-not-credentials'));
});

test('IO errors suppress and do not expose arbitrary error text', async () => {
  for (const kind of ['dir', 'file']) {
    const h = await ready(); h.run('own', { state: 'running', sessionId: OWNER });
    h.ioError(kind, kind === 'dir' ? h.top : path.join(h.top, 'own/status.json'));
    await h.emit('agent_settled'); assert.equal(h.clock.pending, 0); quiet(h);
    assert.ok(!h.errors.join('\n').includes('synthetic private sentinel'));
  }
});

test('genuinely missing paths and mid-scan cleanup are not errors', async () => {
  const h = await ready(); h.dirs.delete(h.top);
  await h.emit('agent_settled'); h.clock.advance(6000); assert.equal(h.calls.length, 1);
  const removed = await ready(); removed.dirs.set(removed.top, [entry('cleaned')]);
  await removed.emit('agent_settled'); removed.clock.advance(6000); assert.equal(removed.calls.length, 1);
});

for (const event of ['agent_start', 'session_shutdown', 'session_start']) test(`${event} cancels grace`, async () => {
  const h = await ready(); await h.emit('agent_settled'); await h.emit(event);
  assert.equal(h.clock.pending, 0); h.clock.advance(6000); quiet(h);
});

test('repeat settle replaces timer instead of emitting twice', async () => {
  const h = await ready(); await h.emit('agent_settled'); h.clock.advance(2000);
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 1);
  h.clock.advance(4000); quiet(h); h.clock.advance(2000); assert.equal(h.calls.length, 1);
});

for (const late of [false, true]) test(`stale context ${late ? 'at dispatch' : 'at scheduling'} suppresses safely`, async () => {
  const h = await ready(); if (late) await h.emit('agent_settled'); h.state.stale = true;
  if (late) h.clock.advance(6000); else await h.emit('agent_settled'); quiet(h);
});

for (const value of ['', '-1', 'nope', '1junk', '1.5', 'Infinity', '2147483648']) test(`invalid/overflow grace ${value} uses default`, async () => {
  const h = await ready({ env: { PI_NOTIFY_MAC_GRACE_MS: value } });
  await h.emit('agent_settled'); assert.deepEqual(h.delays, [6000]);
  h.clock.advance(1); quiet(h); h.clock.advance(5999); assert.equal(h.calls.length, 1);
});

for (const [value, delay] of [['0', 0], ['15', 15], [' 15 ', 15]]) test(`valid grace ${value} keeps guards`, async () => {
  const h = await ready({ env: { PI_NOTIFY_MAC_GRACE_MS: value } }); await h.emit('agent_settled');
  assert.deepEqual(h.delays, [delay]); h.clock.advance(Math.max(1, delay)); assert.equal(h.calls.length, 1);
});

test('silent sound leaves terminal title/bell; transport failure does not throw', async () => {
  const h = await ready({ env: { PI_NOTIFY_MAC_SOUND: '' }, deliveryError: new Error('synthetic delivery failure') });
  await h.emit('agent_settled'); assert.doesNotThrow(() => h.clock.advance(6000));
  assert.ok(!h.calls[0].args[1].includes('sound name')); assert.equal(h.outputs.length, 2);
  assert.equal(h.errors.length, 1);
});

test('configured root override and macOS UID-scoped default match 0.76.1 layout', async () => {
  for (const value of [' /fixtures/custom ', 'relative-fixture', '']) {
    const h = await ready({ env: { PI_SUBAGENTS_TEMP_ROOT: value } });
    h.run('own', { state: 'running', sessionId: OWNER }); await h.emit('agent_settled');
    assert.equal(h.clock.pending, 0); assert.ok(h.reads.includes(h.top));
    assert.ok(h.reads.every(file => file.startsWith('/fixtures/')));
  }
});
