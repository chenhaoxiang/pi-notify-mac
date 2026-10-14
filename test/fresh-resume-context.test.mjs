import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/extension-vm.mjs';
test('UI end uses its fresh context rather than retaining the old settle context',async()=>{
 const h=await harness(new URL('../src/pi-notify-mac.ts',import.meta.url));await h.emit('session_start');await h.emit('agent_settled');await h.emit('ui_prompt_start');
 h.ctx.isIdle=()=>{throw new Error('old context invalid')};
 const fresh={...h.ctx,isIdle:()=>true,hasPendingMessages:()=>false};
 await h.handlers.get('ui_prompt_end')({type:'ui_prompt_end'},fresh);h.clock.advance(6000);assert.equal(h.calls.length,1);
});
