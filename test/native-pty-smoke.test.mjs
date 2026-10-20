// Owned-PTY runner regressions: real processes, but only node fixtures this
// repository starts. No Pi session, model request, notification, sound or GUI.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const runner = path.join(repository, 'scripts/native-pty-smoke.py');
const fixtures = path.join(repository, 'test/helpers/native-pty');
const node = process.execPath;
const scratchRoot = path.join(repository, 'tmp/native-pty-tests');

const python = (() => {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return undefined;
})();
const skip = python ? false : 'python3 is unavailable; the owned-PTY runner needs its standard-library pty module';

let sequence = 0;
const outDir = label => {
  const dir = path.join(scratchRoot, `${label}-${process.pid}-${++sequence}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const run = (args, timeout = 60000) => {
  const out = outDir('run');
  const result = spawnSync(python, [runner, ...args, '--out', out], { cwd: repository, encoding: 'utf8', timeout });
  const receiptPath = path.join(out, 'receipt.json');
  const receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : undefined;
  fs.rmSync(out, { recursive: true, force: true });
  return { ...result, receipt };
};

const fixtureRun = (name, extra = []) => [
  '--profile', 'fixture',
  '--command', node,
  '--command-arg', path.join(fixtures, name),
  '--ready-timeout', '10', '--quit-timeout', '1', '--term-timeout', '1', '--kill-timeout', '3',
  '--expect', 'any-exit',
  ...extra,
];

const alive = pid => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

const spawnSessionLeader = () => spawn(node, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
const spawnOrdinaryChild = () => spawn(node, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });

const waitForExit = async (child, timeout = 30000) => {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('process did not exit in time')), timeout);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
};

test('quit keystroke ends the owned session leader and leaves no signal behind', { skip }, () => {
  const result = run(fixtureRun('ready-then-quit.mjs', ['--quit-keys', 'quit\n']));
  assert.equal(result.status, 0, result.stderr);
  const { receipt } = result;
  assert.equal(receipt.success, true, JSON.stringify(receipt.failedChecks));
  assert.equal(receipt.child.pid, receipt.child.pgid);
  assert.equal(receipt.child.pid, receipt.child.sid, 'child must be its own session leader');
  assert.deepEqual(receipt.signals, [], 'a graceful quit needs no signal');
  assert.deepEqual(receipt.steps.map(step => `${step.action}:${step.result}`), ['quit-keys:sent', 'exit:graceful', 'close-master:closed']);
  assert.equal(alive(receipt.child.pid), false, 'owned child must be gone');
  assert.deepEqual(receipt.env.inheritedKeys, []);
  assert.deepEqual(receipt.credentialLikeKeys, []);
  assert.equal(fs.existsSync(path.join(receipt.isolation.root, 'effects-denied.jsonl')), false);
});

test('escalation signals only the recorded process group and never a foreign session', { skip }, async () => {
  const decoy = spawnSessionLeader();
  try {
    const result = run(fixtureRun('ignore-quit.mjs', ['--quit-keys', 'quit\n']));
    assert.equal(result.status, 0, result.stderr);
    const { receipt } = result;
    assert.equal(receipt.success, true, JSON.stringify(receipt.failedChecks));
    assert.deepEqual(receipt.signals.map(signal => signal.signal), ['SIGTERM', 'SIGKILL']);
    for (const signal of receipt.signals) {
      assert.equal(signal.pgid, receipt.child.pid, 'signals must address the owned process group only');
      assert.equal(signal.result, 'sent');
      assert.equal(signal.verified.pgid, receipt.child.pid);
      assert.equal(signal.verified.sid, receipt.child.pid);
    }
    assert.equal(receipt.child.exit.status, 'signalled');
    assert.equal(receipt.child.exit.signal, 'SIGKILL');
    assert.equal(alive(receipt.child.pid), false);
    assert.equal(alive(decoy.pid), true, 'a foreign session leader must survive');
  } finally {
    decoy.kill('SIGKILL');
    await waitForExit(decoy).catch(() => {});
  }
});

test('a startup failure is reported without any signal', { skip }, () => {
  const result = run(fixtureRun('exit-before-ready.mjs', ['--quit-keys', 'quit\n']));
  assert.equal(result.status, 3, result.stderr);
  const { receipt } = result;
  assert.equal(receipt.success, false);
  assert.ok(receipt.failedChecks.includes('fixture-ready'));
  assert.deepEqual(receipt.signals, []);
  assert.deepEqual(receipt.child.exit, { status: 'exited', code: 3 });
  assert.equal(receipt.checks.find(check => check.name === 'owned-signals-only').ok, true);
});

test('an interrupt cleans up the owned session and exits 130', { skip }, async () => {
  const out = outDir('interrupt');
  const marker = path.join(out, 'fixture-ready');
  const child = spawn(python, [runner, ...fixtureRun('ignore-quit.mjs', ['--quit-keys', 'quit\n']), '--command-arg', marker, '--out', out],
    { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] });
  const deadline = Date.now() + 15000;
  while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(fs.existsSync(marker), 'fixture never signalled readiness');
  child.kill('SIGINT');
  const code = await waitForExit(child);
  const receipt = JSON.parse(fs.readFileSync(path.join(out, 'receipt.json'), 'utf8'));
  fs.rmSync(out, { recursive: true, force: true });
  assert.equal(code, 130);
  assert.equal(receipt.interrupted, true);
  assert.equal(receipt.success, false);
  assert.equal(alive(receipt.child.pid), false, 'interrupt must not orphan the owned session');
  for (const signal of receipt.signals) assert.equal(signal.pgid, receipt.child.pid, 'interrupt cleanup may only address the owned group');
});

test('ownership guard refuses pids, groups and start identities it did not create', { skip }, async () => {
  const leader = spawnSessionLeader();
  const ordinary = spawnOrdinaryChild();
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    const record = spawnSync(python, [runner, '--verify-ownership', String(leader.pid)], { cwd: repository, encoding: 'utf8' });
    const identity = JSON.parse(record.stdout).identity;
    assert.equal(record.status, 0);
    assert.equal(identity.sid, leader.pid);

    const matched = spawnSync(python, [runner, '--verify-ownership', String(leader.pid),
      '--expect-pgid', String(identity.pgid), '--expect-sid', String(identity.sid), '--expect-start', identity.start],
    { cwd: repository, encoding: 'utf8' });
    assert.equal(matched.status, 0, matched.stdout);

    const drifted = spawnSync(python, [runner, '--verify-ownership', String(leader.pid),
      '--expect-pgid', String(identity.pgid), '--expect-start', `${identity.start} drifted`], { cwd: repository, encoding: 'utf8' });
    assert.equal(drifted.status, 3);
    assert.equal(JSON.parse(drifted.stdout).reason, 'start-mismatch');

    const otherGroup = spawnSync(python, [runner, '--verify-ownership', String(leader.pid),
      '--expect-pgid', String(identity.pgid + 1)], { cwd: repository, encoding: 'utf8' });
    assert.equal(otherGroup.status, 3);
    assert.equal(JSON.parse(otherGroup.stdout).reason, 'group-mismatch');

    const notLeader = spawnSync(python, [runner, '--verify-ownership', String(ordinary.pid)], { cwd: repository, encoding: 'utf8' });
    assert.equal(notLeader.status, 3);
    assert.equal(JSON.parse(notLeader.stdout).reason, 'not-session-leader');

    const missing = spawnSync(python, [runner, '--verify-ownership', '999999'], { cwd: repository, encoding: 'utf8' });
    assert.equal(missing.status, 3);
    assert.equal(JSON.parse(missing.stdout).reason, 'not-running');

    assert.equal(alive(leader.pid), true, 'the guard never signals the process it inspects');
    assert.equal(alive(ordinary.pid), true);
  } finally {
    leader.kill('SIGKILL');
    ordinary.kill('SIGKILL');
    await Promise.all([waitForExit(leader).catch(() => {}), waitForExit(ordinary).catch(() => {})]);
  }
});

test('dry run builds an isolated environment that inherits no credentials', { skip }, () => {
  const result = run(['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  const plan = result.receipt;
  assert.equal(plan.success, true, JSON.stringify(plan.failedChecks));
  assert.deepEqual(plan.env.inheritedKeys, []);
  assert.deepEqual(plan.credentialLikeKeys, []);
  assert.equal(plan.child, undefined, 'a dry run must not start a process');
  assert.deepEqual(plan.env.keys, [
    'HOME', 'LANG', 'PATH', 'PI_CODING_AGENT_DIR', 'PI_CODING_AGENT_SESSION_DIR', 'PI_NATIVE_TEST_LABEL',
    'PI_NATIVE_TEST_ROOT', 'PI_NOTIFY_MAC_COMPLETION', 'PI_NOTIFY_MAC_INPUT', 'PI_OFFLINE',
    'PI_SUBAGENTS_TEMP_ROOT', 'TERM', 'TMPDIR',
  ]);
  assert.equal(plan.env.values.PI_NOTIFY_MAC_COMPLETION, '0');
  assert.equal(plan.env.values.PI_NOTIFY_MAC_INPUT, '0');
  assert.equal(plan.env.values.HOME, plan.isolation.home);
  assert.equal(plan.env.values.PI_CODING_AGENT_DIR, plan.isolation.agentDir);
  assert.ok(plan.isolation.home.startsWith(plan.isolation.root));
  assert.deepEqual(Object.keys(plan.command.sourceSha256).sort(), ['input-reminder.ts', 'pi-notify-mac.ts', 'terminal-focus.ts']);
});

test('unsafe roots, packages and the OS-effect mode are refused before spawning', { skip }, () => {
  const unsafeOut = spawnSync(python, [runner, '--profile', 'fixture', '--command', node, '--out', '/'], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(unsafeOut.status, 0);
  assert.match(unsafeOut.stderr, /refusing unsafe --out/);

  const missingPackage = spawnSync(python, [runner, '--dry-run', '--package', path.join(repository, 'test'), '--out', outDir('pkg')],
    { cwd: repository, encoding: 'utf8' });
  assert.notEqual(missingPackage.status, 0);
  assert.match(missingPackage.stderr, /no src\/pi-notify-mac\.ts/);

  const effectsWithoutOptIn = spawnSync(python, [runner, '--mode', 'os-effects', '--out', outDir('effects')], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(effectsWithoutOptIn.status, 0);
  assert.match(effectsWithoutOptIn.stderr, /requires the explicit --allow-os-effects flag/);

  const optInWithoutMode = spawnSync(python, [runner, '--allow-os-effects', '--out', outDir('optin')], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(optInWithoutMode.status, 0);
  assert.match(optInWithoutMode.stderr, /requires --mode os-effects/);
});

after(() => fs.rmSync(scratchRoot, { recursive: true, force: true }));
