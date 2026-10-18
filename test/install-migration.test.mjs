import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
const temporary = path.join(repository, 'tmp/install-fixtures');
fs.mkdirSync(temporary, { recursive: true });
const fixture = fn => {
  const root = fs.mkdtempSync(path.join(temporary, 'case-'));
  const agent = path.join(root, 'agent'); fs.mkdirSync(path.join(agent, 'extensions'), { recursive: true });
  const write = (name, value) => { const file = path.join(agent, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const install = () => spawnSync('sh', ['install.sh'], { cwd: repository, env: { PATH: process.env.PATH, HOME: root, PI_AGENT_DIR: agent }, encoding: 'utf8', timeout: 10000 });
  try { fn({ root, agent, write, install, read: name => fs.readFileSync(path.join(agent, name), 'utf8') }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
};
const version = JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf8')).version;
const selected = `packages/pi-notify-mac/${version}`;

test('installer preserves legacy bytes/settings, removes duplicate declarations and ships complete modules', () => fixture(({ agent, write, install, read }) => {
  const initial = { packages: ['npm:unrelated@1.0.0', 'git:github.com/chenhaoxiang/pi-notify-mac@v0.2.1', 'packages/pi-notify-mac/0.2.1'], extensions: [path.join(agent, 'extensions/approval-notify.ts'), '+extensions/pi-notify-mac.ts', '/fixtures/unrelated.ts'], preference: { fixture: true } };
  write('settings.json', initial); write('extensions/approval-notify.ts', 'old approval bytes'); write('extensions/pi-notify-mac.ts', 'old completion bytes'); write('extensions/other.ts', 'keep me');
  fs.chmodSync(path.join(agent, 'settings.json'), 0o640);
  const result = install(); assert.equal(result.status, 0, result.stderr); const receipt = JSON.parse(result.stdout);
  const next = JSON.parse(read('settings.json'));
  assert.deepEqual(next, { ...initial, packages: ['npm:unrelated@1.0.0', selected], extensions: ['/fixtures/unrelated.ts'] });
  assert.equal(fs.readFileSync(path.join(receipt.backup, 'approval-notify.ts'), 'utf8'), 'old approval bytes');
  assert.equal(fs.readFileSync(path.join(receipt.backup, 'pi-notify-mac.ts'), 'utf8'), 'old completion bytes');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(receipt.backup, 'settings.json'))), initial);
  assert.equal(fs.statSync(receipt.backup).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(receipt.backup, 'settings.json')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(agent, 'settings.json')).mode & 0o777, 0o640);
  assert.equal(fs.existsSync(path.join(agent, 'extensions/approval-notify.ts')), false); assert.equal(read('extensions/other.ts'), 'keep me');
  for (const file of ['src/pi-notify-mac.ts', 'src/input-reminder.ts', 'src/terminal-focus.ts', 'docs/input-reminders.md', 'scripts/install-local.mjs']) assert.ok(fs.existsSync(path.join(agent, selected, file)), file);
  assert.equal(receipt.legacyFilesMoved, 2); assert.equal(receipt.forcedRestarts, 0);
  const again = install(); assert.equal(again.status, 0, again.stderr); assert.equal(JSON.parse(again.stdout).legacyFilesMoved, 0);
  assert.deepEqual(JSON.parse(read('settings.json')), next);
}));

test('fresh installer creates a private settings file with only the complete package', () => fixture(({ agent, install, read }) => {
  const result = install(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(read('settings.json')), { packages: [selected] });
  assert.equal(fs.statSync(path.join(agent, 'settings.json')).mode & 0o777, 0o600);
}));

test('resource filters are preserved and same-named unrelated extensions are not removed', () => fixture(({ write, install, read }) => {
  const original = { packages: [{ source: 'git:github.com/chenhaoxiang/pi-notify-mac@v0.2.1', extensions: [], skills: [] }], extensions: ['/other/project/approval-notify.ts'] };
  write('settings.json', original);
  const result = install(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(read('settings.json')), { ...original, packages: [{ ...original.packages[0], source: selected }] });
}));

test('conflicting filters fail without broadening permissions or changing legacy files', () => fixture(({ write, install, read }) => {
  const original = { packages: [{ source: 'packages/pi-notify-mac/0.2.1', extensions: [] }, { source: 'git:github.com/chenhaoxiang/pi-notify-mac@v0.2.1', extensions: ['src/pi-notify-mac.ts'] }] };
  write('settings.json', original); write('extensions/approval-notify.ts', 'keep');
  const result = install(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Conflicting package resource filters/);
  assert.deepEqual(JSON.parse(read('settings.json')), original); assert.equal(read('extensions/approval-notify.ts'), 'keep');
}));

test('conflicting immutable destination fails without changing the selected source or old files', () => fixture(({ write, install, read }) => {
  const original = { packages: ['packages/pi-notify-mac/0.2.1'] }; write('settings.json', original); write('extensions/approval-notify.ts', 'keep'); write(`${selected}/package.json`, { name: 'pi-notify-mac', version, conflict: true });
  const result = install(); assert.notEqual(result.status, 0); assert.match(result.stderr, /refusing overwrite/);
  assert.deepEqual(JSON.parse(read('settings.json')), original); assert.equal(read('extensions/approval-notify.ts'), 'keep'); assert.match(read(`${selected}/package.json`), /conflict/);
}));

test('partial legacy-file migration rolls back moved files and leaves original settings intact', () => fixture(({ agent, write, install, read }) => {
  const original = { packages: ['packages/pi-notify-mac/0.2.1'] }; write('settings.json', original); write('extensions/approval-notify.ts', 'keep'); fs.mkdirSync(path.join(agent, 'extensions/pi-notify-mac.ts'));
  const result = install(); assert.notEqual(result.status, 0); assert.match(result.stderr, /not a file/);
  assert.deepEqual(JSON.parse(read('settings.json')), original); assert.equal(read('extensions/approval-notify.ts'), 'keep'); assert.equal(fs.existsSync(path.join(agent, selected)), false);
  assert.equal(fs.existsSync(path.join(agent, 'settings.json.lock')), false);
}));

for (const input of ['not json private-sentinel', 'null', '[]', '{"packages":{}}', '{"packages":[null]}']) test('malformed settings do not leak raw values or mutate configuration: ' + input.length, () => fixture(({ write, install, read }) => {
  write('settings.json', input); write('extensions/approval-notify.ts', 'keep'); const result = install();
  assert.notEqual(result.status, 0); assert.equal(read('settings.json'), input); assert.equal(read('extensions/approval-notify.ts'), 'keep');
  assert.ok(!result.stderr.includes('private-sentinel'));
}));

test('installer lock prevents concurrent runs without changing settings', () => fixture(({ agent, write, install, read }) => {
  write('settings.json', '{}'); fs.mkdirSync(path.join(agent, 'settings.json.lock')); const result = install();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /settings lock is already held/); assert.equal(read('settings.json'), '{}'); assert.equal(fs.existsSync(path.join(agent, 'settings.json.lock')), true);
}));

test('an interleaved cooperative Pi writer cannot replace settings inside migration commit', () => fixture(({ root, agent, write, read }) => {
  write('settings.json', { packages: ['npm:unrelated@1.0.0'], preserved: true });
  const hook = path.join(root, 'interleave.cjs');
  fs.writeFileSync(hook, `const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const original=fs.renameSync;
fs.renameSync=function(from,to){
 if(to===path.join(process.env.PI_AGENT_DIR,'settings.json')){
  const writer=cp.spawnSync(process.execPath,['-e',\"const fs=require('node:fs');try{fs.mkdirSync(process.argv[1]+'.lock');process.exit(91)}catch(e){process.exit(e.code==='EEXIST'?0:92)}\",to],{encoding:'utf8'});
  if(writer.status!==0)throw Error('Cooperating Pi writer bypassed the shared lock');
  fs.writeFileSync(path.join(process.env.PI_AGENT_DIR,'interleave-proof'),'blocked');
 }
 return original.apply(this,arguments);
};`);
  const result = spawnSync(process.execPath, ['--require', hook, path.join(repository, 'scripts/install-local.mjs')], { env: { PATH: process.env.PATH, HOME: root, PI_AGENT_DIR: agent }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(read('interleave-proof'), 'blocked');
  const next = JSON.parse(read('settings.json')); assert.equal(next.preserved, true); assert.deepEqual(next.packages, ['npm:unrelated@1.0.0', selected]);
  fs.mkdirSync(path.join(agent, 'settings.json.lock')); // The waiting writer can now acquire and merge current bytes.
  write('settings.json', { ...JSON.parse(read('settings.json')), laterWriter: true }); fs.rmdirSync(path.join(agent, 'settings.json.lock'));
  assert.equal(JSON.parse(read('settings.json')).laterWriter, true);
}));

test('legacy symlink is preserved as a symlink outside discovery, not copied or dereferenced', () => fixture(({ agent, root, install }) => {
  const original = path.join(root, 'old.ts'); fs.writeFileSync(original, 'legacy source'); fs.symlinkSync(original, path.join(agent, 'extensions/approval-notify.ts'));
  const result = install(); assert.equal(result.status, 0, result.stderr); const receipt = JSON.parse(result.stdout);
  assert.equal(fs.readlinkSync(path.join(receipt.backup, 'approval-notify.ts')), original); assert.equal(fs.readFileSync(original, 'utf8'), 'legacy source');
}));
