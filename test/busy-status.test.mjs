import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/extension-vm.mjs';
test('diagnostics cannot claim eligible while the new idle guard refuses',async()=>{
 const h=await harness(new URL('../src/pi-notify-mac.ts',import.meta.url));await h.emit('session_start');h.state.idle=false;
 await h.commands.get('notify-status').handler('',h.ctx);assert.match(h.notifications.at(-1).message,/readiness: running/);assert.equal(h.calls.length,0);assert.equal(h.clock.pending,0);
});
