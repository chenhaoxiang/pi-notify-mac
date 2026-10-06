import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness } from './helpers/extension-vm.mjs';
const source = new URL('../src/pi-notify-mac.ts', import.meta.url);

for (const sessionId of ['', ' ', '\t']) for (const state of ['queued', 'running']) test(`unreadable ownership ${JSON.stringify(sessionId)} / ${state} cannot be foreign`, async () => {
  const h = await harness(source); await h.emit('session_start');
  h.run('unknown-owner', { state, sessionId }); await h.emit('agent_settled');
  assert.equal(h.clock.pending, 0); assert.equal(h.calls.length, 0);
});

test('blank ownership appearing during grace is rechecked', async () => {
  const h = await harness(source); await h.emit('session_start'); await h.emit('agent_settled');
  h.run('new', { state: 'running', sessionId: '' }); h.clock.advance(6000);
  assert.equal(h.calls.length, 0); assert.equal(h.outputs.length, 0);
});

for (const mode of ['rpc', 'json', 'print']) test(`late mode ${mode} cannot write TUI effects`, async () => {
  const h = await harness(source); await h.emit('session_start'); await h.emit('agent_settled');
  h.state.mode = mode; h.clock.advance(6000);
  assert.equal(h.calls.length, 0); assert.equal(h.outputs.length, 0);
});

test('artifact manifest carries both linked owner documents', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['docs/releasing.md', 'docs/notification-completion.md']) {
    assert.ok(pkg.files.includes(name)); assert.ok((await readFile(new URL('../' + name, import.meta.url), 'utf8')).startsWith('---\n'));
  }
});

test('release runbook uses paragraphs, not escaped newline literals', async () => {
  const text = await readFile(new URL('../docs/releasing.md', import.meta.url), 'utf8');
  assert.ok(!text.includes('\\n\\n')); assert.ok(text.includes('\n\nRestart Pi'));
});
