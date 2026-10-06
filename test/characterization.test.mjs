// Frozen characterization: these fixtures never change with production behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { harness, OWNER, entry } from './helpers/extension-vm.mjs';

const base = new URL('./fixtures/released-0.1.0.source.txt', import.meta.url);
const manual = new URL('./fixtures/manual-unversioned.source.txt', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');

test('pin exact published and local pre-migration source bytes', async () => {
  assert.equal(sha(await readFile(base)), 'd77aa85e0e2bc6612534e23356ad6fddc289e05146154c05a3119cefa187efb4');
  assert.equal(sha(await readFile(manual)), '273272e30e1e82ee95bcb9e3f23b61d10a3274386db4c1462e2922bebfde23e0');
});

test('published baseline registers settled and immediately emits three effects', async () => {
  const h = await harness(base);
  assert.deepEqual([...h.handlers.keys()], ['agent_settled']);
  await h.emit('agent_settled');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].command, 'osascript');
  assert.deepEqual(h.outputs, ['\x1b]0;✓ demo\x07', '\x07']);
  assert.equal(h.clock.pending, 0);
});

test('published baseline is not mode-gated; preserve as historical behavior', async () => {
  const h = await harness(base); h.state.mode = 'rpc';
  await h.emit('agent_settled'); assert.equal(h.calls.length, 1);
  assert.equal(h.outputs.length, 2); // This is the intentionally replaced RPC behavior.
});

test('manual baseline registration is effect-free and adds lifecycle cleanup', async () => {
  const h = await harness(manual);
  assert.deepEqual([...h.handlers.keys()], ['session_start', 'agent_start', 'session_shutdown', 'agent_settled']);
  assert.equal(h.clock.pending, 0); assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0);
});

test('manual baseline has a 6000ms unreferenced grace', async () => {
  const h = await harness(manual); await h.emit('session_start'); await h.emit('agent_settled');
  assert.deepEqual(h.delays, [6000]); assert.equal(h.clock.unrefs, 1);
  h.clock.advance(5999); assert.equal(h.calls.length, 0);
  h.clock.advance(1); assert.equal(h.calls.length, 1); assert.equal(h.outputs.length, 2);
});

test('manual baseline suppresses RPC and pending messages', async () => {
  for (const mode of ['rpc', 'json', 'print']) {
    const h = await harness(manual); h.state.mode = mode;
    await h.emit('agent_settled'); assert.equal(h.clock.pending, 0); assert.equal(h.calls.length, 0);
  }
  const h = await harness(manual); h.state.pending = true;
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 0);
});

test('manual baseline observes same-session top-level and nested runs', async () => {
  const h = await harness(manual); await h.emit('session_start');
  h.run('root-a', { state: 'complete', sessionId: OWNER });
  h.child('root-a', 'leaf-a', { state: 'running', sessionId: '/fixtures/child.jsonl' });
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 0);
});

test('manual baseline cancels on new agent and shutdown', async () => {
  for (const event of ['agent_start', 'session_shutdown', 'session_start']) {
    const h = await harness(manual); await h.emit('session_start'); await h.emit('agent_settled');
    await h.emit(event); h.clock.advance(6000); assert.equal(h.calls.length, 0);
  }
});

test('manual baseline preserves conservative IO and unfamiliar-directory suppression', async () => {
  const h = await harness(manual); h.dirs.set(h.top, [entry('not-a-directory', false)]);
  await h.emit('agent_settled'); assert.equal(h.clock.pending, 0); assert.equal(h.calls.length, 0);
  const io = await harness(manual); io.ioError('dir', io.top);
  await io.emit('agent_settled'); assert.equal(io.clock.pending, 0);
});
