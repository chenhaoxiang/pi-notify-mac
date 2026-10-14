import test from 'node:test';
import assert from 'node:assert/strict';
import { harness,OWNER } from './helpers/extension-vm.mjs';
const source=new URL('../src/pi-notify-mac.ts',import.meta.url);
const ready=async()=>{const h=await harness(source);await h.emit('session_start');return h;};
test('closing idle UI resumes pending settle with a new grace and emits once',async()=>{
 const h=await ready();await h.emit('agent_settled');h.clock.advance(1000);await h.emit('ui_prompt_start');assert.equal(h.clock.pending,0);
 await h.emit('ui_prompt_end');assert.equal(h.clock.pending,1);h.clock.advance(5999);assert.equal(h.calls.length,0);h.clock.advance(1);assert.equal(h.calls.length,1);
 await h.emit('ui_prompt_start');await h.emit('ui_prompt_end');h.clock.advance(10000);assert.equal(h.calls.length,1);
});
test('settle observed while UI open is retained until close',async()=>{
 const h=await ready();await h.emit('ui_prompt_start');await h.emit('agent_settled');assert.equal(h.clock.pending,0);
 await h.emit('ui_prompt_end');h.clock.advance(6000);assert.equal(h.calls.length,1);
});
for(const event of ['agent_start','session_shutdown','session_start'])test(`${event} retires old settle intent during UI`,async()=>{
 const h=await ready();await h.emit('agent_settled');await h.emit('ui_prompt_start');await h.emit(event);await h.emit('ui_prompt_end');h.clock.advance(10000);assert.equal(h.calls.length,0);assert.equal(h.clock.pending,0);
});
for(const kind of ['pending','active','corrupt','busy','stale','rpc'])test(`resumption rechecks ${kind} before scheduling`,async()=>{
 const h=await ready();await h.emit('agent_settled');await h.emit('ui_prompt_start');
 if(kind==='pending')h.state.pending=true;if(kind==='active')h.run('own',{state:'running',sessionId:OWNER});if(kind==='corrupt')h.run('own','broken');if(kind==='busy')h.state.idle=false;if(kind==='stale')h.state.stale=true;if(kind==='rpc')h.state.mode='rpc';
 await h.emit('ui_prompt_end');h.clock.advance(10000);assert.equal(h.calls.length,0);assert.equal(h.clock.pending,0);
});
test('no previous settle means prompt end never invents completion',async()=>{
 const h=await ready();await h.emit('ui_prompt_start');await h.emit('ui_prompt_end');h.clock.advance(10000);assert.equal(h.calls.length,0);assert.equal(h.clock.pending,0);
});
test('a busy state appearing inside renewed grace is also rechecked',async()=>{
 const h=await ready();await h.emit('agent_settled');await h.emit('ui_prompt_start');await h.emit('ui_prompt_end');h.state.idle=false;h.clock.advance(6000);assert.equal(h.calls.length,0);
});
