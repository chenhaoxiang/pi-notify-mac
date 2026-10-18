import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { harness } from './helpers/extension-vm.mjs';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));

test('packed artifact includes every runtime module, migration installer and linked maintained guide', () => {
  const parent = path.join(repository, 'tmp/package-fixtures'); fs.mkdirSync(parent, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(parent, 'pack-'));
  try {
    const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], { cwd: repository, env: { PATH: process.env.PATH, HOME: scratch, npm_config_cache: path.join(scratch, 'cache') }, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const files = JSON.parse(result.stdout)[0].files.map(f => f.path);
    for (const name of ['src/pi-notify-mac.ts', 'src/input-reminder.ts', 'src/terminal-focus.ts', 'install.sh', 'scripts/install-local.mjs', 'README.md', 'README.zh-CN.md', 'docs/input-reminders.md', 'docs/notification-diagnostics.md', 'docs/notification-completion.md', 'docs/settled-ui-resume.md', 'docs/releasing.md']) assert.ok(files.includes(name), name);
    assert.ok(files.every(name => !name.startsWith('test/') && !name.startsWith('tmp/') && !name.includes('approval-notify.ts')));
    const manifest = JSON.parse(fs.readFileSync(path.join(repository, 'package.json')));
    assert.deepEqual(manifest.pi.extensions, ['./src/pi-notify-mac.ts']);
    assert.equal(manifest.dependencies, undefined);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});

test('alternate entry behavior loads co-located sibling modules, not worktree siblings', async () => {
  const parent = path.join(repository, 'tmp/package-fixtures'); fs.mkdirSync(parent, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(parent, 'siblings-'));
  try {
    fs.cpSync(path.join(repository, 'src'), scratch, { recursive: true });
    fs.writeFileSync(path.join(scratch, 'input-reminder.ts'), 'export function enabled(){return true;} export function createInputReminder(){} throw new Error("co-located-module-sentinel");');
    await assert.rejects(harness(pathToFileURL(path.join(scratch, 'pi-notify-mac.ts'))), /co-located-module-sentinel/);
    fs.unlinkSync(path.join(scratch, 'input-reminder.ts'));
    await assert.rejects(harness(pathToFileURL(path.join(scratch, 'pi-notify-mac.ts'))), /ENOENT/);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});

test('maintained installation instructions no longer teach broken single-file copying', () => {
  for (const file of ['README.md', 'README.zh-CN.md', 'install.sh']) {
    const text = fs.readFileSync(path.join(repository, file), 'utf8');
    assert.doesNotMatch(text, /cp\s+(?:"\$source_file"|src\/pi-notify-mac\.ts)/);
  }
  for (const file of ['README.md', 'README.zh-CN.md', 'docs/input-reminders.md']) {
    const text = fs.readFileSync(path.join(repository, file), 'utf8');
    assert.match(text, /approval-notify\.ts/); assert.match(text, /install\.sh/);
  }
});
