import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/extension-vm.mjs';
test('blocking UI cancels grace, explains waiting, and never adds an approval alarm', async () => {
  const h=await harness(new URL('../src/pi-notify-mac.ts',import.meta.url)); await h.emit('session_start');await h.emit('agent_settled');
  await h.emit('ui_prompt_start');assert.equal(h.clock.pending,0);await h.emit('agent_settled');assert.equal(h.clock.pending,0);
  await h.commands.get('notify-status').handler('',h.ctx);assert.match(h.notifications.at(-1).message,/waiting-for-input/);assert.equal(h.calls.length,0);
  await h.emit('ui_prompt_end');await h.emit('agent_settled');h.clock.advance(6000);assert.equal(h.calls.length,1);
});
