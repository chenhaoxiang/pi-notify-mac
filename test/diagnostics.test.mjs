import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, OWNER } from './helpers/extension-vm.mjs';
const source = new URL('../src/pi-notify-mac.ts', import.meta.url);
const status = async h => {
  await h.commands.get('notify-status').handler('', h.ctx);
  return h.notifications.at(-1)?.message;
};
for (const [name, prepare, reason] of [
  ['ready', () => {}, 'eligible'],
  ['pending', h => { h.state.pending = true; }, 'pending-messages'],
  ['active', h => { h.run('own', { state: 'running', sessionId: OWNER }); }, 'active-subagent'],
  ['unknown', h => { h.run('own', { state: 'future', sessionId: OWNER }); }, 'unverified-subagents'],
  ['corrupt', h => { h.run('own', 'private-sentinel'); }, 'unverified-subagents'],
  ['stale', h => { h.state.stale = true; }, 'stale-context'],
]) test(`readiness explains ${name} without delivering`, async () => {
  const h = await harness(source); await h.emit('session_start'); prepare(h);
  const text = await status(h); assert.match(text, new RegExp(`readiness: ${reason}`));
  assert.ok(!text.includes('private-sentinel')); assert.equal(h.calls.length, 0);
  assert.equal(h.outputs.length, 0); assert.equal(h.clock.pending, 0);
});
test('lifecycle diagnosis separates grace from OS request and never proves success', async () => {
  const h = await harness(source); await h.emit('session_start'); await h.emit('agent_settled');
  assert.match(await status(h), /decision: grace/); h.clock.advance(6000);
  assert.match(await status(h), /decision: notification-requested/);
  assert.match(await status(h), /not task success/); assert.equal(h.calls.length, 1);
  await h.emit('agent_start'); assert.match(await status(h), /decision: running/);
});
test('late child still suppresses with a diagnostic reason', async () => {
  const h = await harness(source); await h.emit('session_start'); await h.emit('agent_settled');
  h.run('late', { state: 'running', sessionId: OWNER }); h.clock.advance(6000);
  assert.match(await status(h), /decision: active-subagent/); assert.equal(h.calls.length, 0);
});
test('status is silent outside TUI', async () => {
  const h = await harness(source); h.state.mode = 'rpc'; await status(h);
  assert.equal(h.reads.length, 0); assert.equal(h.notifications.length, 0);
});
