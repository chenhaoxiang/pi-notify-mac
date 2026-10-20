// Owned-PTY runner regressions: real processes, but only node fixtures this
// repository starts. No Pi session, model request, notification, sound or GUI.
// A failing case keeps its receipt/transcript/journal under tmp/native-pty-tests.
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
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  return undefined;
})();
const skip = python ? false : 'python3 is unavailable; the owned-PTY runner needs its standard-library pty module';

const cases = new Set();
let sequence = 0;
const caseDir = label => {
  const dir = path.join(scratchRoot, `${label}-${process.pid}-${++sequence}`);
  fs.mkdirSync(dir, { recursive: true });
  cases.add(dir);
  return dir;
};
// Only a passing case is cleaned; a failing one keeps receipt/transcript/journal.
// A path the runner may reject before creating anything; never tracked or cleaned.
const scratchPath = label => path.join(scratchRoot, `${label}-${process.pid}-${++sequence}`);
const keep = dir => {
  fs.rmSync(dir, { recursive: true, force: true });
  cases.delete(dir);
};

const run = (label, args, options = {}) => {
  const out = caseDir(label);
  const result = spawnSync(python, [runner, ...args, '--out', out], {
    cwd: repository, encoding: 'utf8', timeout: options.timeout ?? 60000, env: options.env ?? process.env,
  });
  const receiptPath = path.join(out, 'receipt.json');
  const receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : undefined;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, receipt, out };
};

const fixtureRun = (name, extra = []) => [
  '--profile', 'fixture',
  '--command', node,
  '--command-arg', path.join(fixtures, name),
  '--ready-timeout', '10', '--quit-timeout', '1', '--term-timeout', '1', '--kill-timeout', '3',
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
  const result = run('graceful', fixtureRun('ready-then-quit.mjs', ['--quit-keys', 'quit\n']));
  assert.equal(result.status, 0, result.stderr);
  const { receipt } = result;
  assert.equal(receipt.success, true, JSON.stringify(receipt.failedChecks));
  assert.equal(receipt.child.pid, receipt.child.pgid);
  assert.equal(receipt.child.pid, receipt.child.sid, 'child must be its own session leader');
  assert.deepEqual(receipt.signals, [], 'a graceful quit needs no signal');
  assert.deepEqual(receipt.steps.map(step => `${step.action}:${step.result}`),
    ['pty-prepared:ok', 'quit-keys:sent', 'exit:graceful', 'close-master:closed']);
  assert.deepEqual(receipt.child.exit, { status: 'exited', code: 0 });
  assert.equal(alive(receipt.child.pid), false, 'owned child must be gone');
  assert.deepEqual(receipt.env.inheritedKeys, []);
  assert.deepEqual(receipt.credentialLikeKeys, []);
  assert.equal(fs.existsSync(path.join(receipt.isolation.root, 'effects-denied.jsonl')), false);
  assert.ok(fs.existsSync(path.join(receipt.isolation.root, receipt.pty.transcript)), 'transcript kept for review');
  keep(result.out);
});

test('escalation signals only the recorded process group and never a foreign session', { skip }, async () => {
  const decoy = spawnSessionLeader();
  try {
    const result = run('escalation', fixtureRun('ignore-quit.mjs', ['--quit-keys', 'quit\n', '--expect', 'any-exit']));
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
    keep(result.out);
  } finally {
    decoy.kill('SIGKILL');
    await waitForExit(decoy).catch(() => {});
  }
});

test('a startup failure is reported without any signal', { skip }, () => {
  const result = run('startup-failure', fixtureRun('exit-before-ready.mjs', ['--quit-keys', 'quit\n']));
  assert.equal(result.status, 3, result.stderr);
  const { receipt } = result;
  assert.equal(receipt.success, false);
  assert.ok(receipt.failedChecks.includes('fixture-ready'));
  assert.deepEqual(receipt.signals, []);
  assert.deepEqual(receipt.child.exit, { status: 'exited', code: 3 });
  assert.equal(receipt.checks.find(check => check.name === 'owned-signals-only').ok, true);
  keep(result.out);
});

test('a non-zero exit after READY is never accepted as graceful', { skip }, () => {
  const rejected = run('exit-seven-graceful', fixtureRun('exit-seven.mjs', ['--quit-keys', 'quit\n']));
  assert.equal(rejected.status, 3, rejected.stderr);
  assert.equal(rejected.receipt.success, false);
  assert.ok(rejected.receipt.failedChecks.includes('graceful-exit'));
  assert.equal(rejected.receipt.steps.find(step => step.action === 'exit').result, 'exited-nonzero');
  assert.deepEqual(rejected.receipt.child.exit, { status: 'exited', code: 7 });

  const explicit = run('exit-seven-any', fixtureRun('exit-seven.mjs', ['--quit-keys', 'quit\n', '--expect', 'any-exit']));
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(explicit.receipt.success, true, JSON.stringify(explicit.receipt.failedChecks));
  assert.equal(explicit.receipt.steps.find(step => step.action === 'exit').result, 'exited-nonzero');
  keep(rejected.out);
  keep(explicit.out);
});

test('a signal exit after READY is never accepted as graceful', { skip }, () => {
  const rejected = run('exit-signal-graceful', fixtureRun('exit-signal.mjs', ['--quit-keys', 'quit\n']));
  assert.equal(rejected.status, 3, rejected.stderr);
  assert.ok(rejected.receipt.failedChecks.includes('graceful-exit'));
  assert.equal(rejected.receipt.steps.find(step => step.action === 'exit').result, 'signalled');
  assert.deepEqual(rejected.receipt.child.exit, { status: 'signalled', signal: 'SIGTERM' });

  const explicit = run('exit-signal-any', fixtureRun('exit-signal.mjs', ['--quit-keys', 'quit\n', '--expect', 'any-exit']));
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(explicit.receipt.success, true, JSON.stringify(explicit.receipt.failedChecks));
  keep(rejected.out);
  keep(explicit.out);
});

test('an interrupt cleans up the owned session and exits 130', { skip }, async () => {
  const out = caseDir('interrupt');
  const marker = path.join(out, 'fixture-ready');
  const child = spawn(python, [runner, ...fixtureRun('ignore-quit.mjs', ['--quit-keys', 'quit\n']), '--command-arg', marker, '--out', out],
    { cwd: repository, stdio: ['ignore', 'pipe', 'pipe'] });
  const deadline = Date.now() + 15000;
  while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(fs.existsSync(marker), 'fixture never signalled readiness');
  child.kill('SIGINT');
  const code = await waitForExit(child);
  const receipt = JSON.parse(fs.readFileSync(path.join(out, 'receipt.json'), 'utf8'));
  assert.equal(code, 130);
  assert.equal(receipt.interrupted, true);
  assert.equal(receipt.success, false);
  assert.equal(alive(receipt.child.pid), false, 'interrupt must not orphan the owned session');
  for (const signal of receipt.signals) assert.equal(signal.pgid, receipt.child.pid, 'interrupt cleanup may only address the owned group');
  keep(out);
});

test('a registration failure after fork still closes, verifies and reaps the child', { skip }, async () => {
  const decoy = spawnSessionLeader();
  try {
    const result = run('fault-after-fork', fixtureRun('ignore-quit.mjs', ['--quit-keys', 'quit\n', '--expect', 'any-exit']),
      { env: { ...process.env, PI_NATIVE_PTY_FAULT: 'after-fork' } });
    assert.equal(result.status, 3, result.stderr);
    const { receipt } = result;
    assert.equal(receipt.success, false);
    assert.deepEqual(receipt.steps.filter(step => step.action === 'spawn-abort').map(step => step.result), ['started', 'reaped']);
    assert.equal(receipt.abortedChild.reaped, true);
    assert.equal(receipt.abortedChild.identity.sid, receipt.abortedChild.pid, 'abort only runs for its own session leader');
    assert.equal(alive(receipt.abortedChild.pid), false);
    assert.deepEqual(receipt.signals, []);
    assert.equal(alive(decoy.pid), true, 'abort must not touch a foreign session');
    keep(result.out);
  } finally {
    decoy.kill('SIGKILL');
    await waitForExit(decoy).catch(() => {});
  }
});

test('a signal inside the fork-to-registration window is replayed after the child is owned', { skip }, () => {
  const result = run('fault-early-interrupt', fixtureRun('ignore-quit.mjs', ['--quit-keys', 'quit\n', '--expect', 'any-exit']),
    { env: { ...process.env, PI_NATIVE_PTY_FAULT: 'interrupt-after-fork' } });
  assert.equal(result.status, 130, result.stderr);
  const { receipt } = result;
  assert.equal(receipt.interrupted, true);
  assert.equal(receipt.child.pid, receipt.child.sid, 'the child was registered before the deferred signal was replayed');
  assert.ok(receipt.child.exit, 'the deferred interrupt still reaps its own child');
  assert.equal(alive(receipt.child.pid), false);
  for (const signal of receipt.signals) assert.equal(signal.pgid, receipt.child.pid);
  keep(result.out);
});

test('ownership guard refuses pids, groups, start identities and non-leader processes it did not create', { skip }, async () => {
  const leader = spawnSessionLeader();
  const ordinary = spawnOrdinaryChild();
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    const verify = (...args) => spawnSync(python, [runner, '--verify-ownership', ...args], { cwd: repository, encoding: 'utf8' });
    const record = verify(String(leader.pid));
    const identity = JSON.parse(record.stdout).identity;
    assert.equal(record.status, 0);
    assert.equal(identity.sid, leader.pid);

    assert.equal(verify(String(leader.pid), '--expect-pgid', String(identity.pgid),
      '--expect-sid', String(identity.sid), '--expect-start', identity.start).status, 0);

    const drifted = verify(String(leader.pid), '--expect-pgid', String(identity.pgid), '--expect-start', `${identity.start} drifted`);
    assert.equal(drifted.status, 3);
    assert.equal(JSON.parse(drifted.stdout).reason, 'start-mismatch');

    const missingStart = verify(String(leader.pid), '--expect-start', '');
    assert.equal(missingStart.status, 3, 'an unavailable start identity must fail closed');
    assert.equal(JSON.parse(missingStart.stdout).reason, 'start-unavailable');

    const otherGroup = verify(String(leader.pid), '--expect-pgid', String(identity.pgid + 1));
    assert.equal(otherGroup.status, 3);
    assert.equal(JSON.parse(otherGroup.stdout).reason, 'group-mismatch');

    const notLeader = verify(String(ordinary.pid));
    assert.equal(notLeader.status, 3);
    assert.equal(JSON.parse(notLeader.stdout).reason, 'not-session-leader');

    const missing = verify('999999');
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

test('dry run builds an isolated environment, inherits no credentials and starts nothing', { skip }, () => {
  const result = run('dry-run', ['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  const plan = result.receipt;
  assert.equal(plan.success, true, JSON.stringify(plan.failedChecks));
  assert.deepEqual(plan.env.inheritedKeys, []);
  assert.deepEqual(plan.credentialLikeKeys, []);
  assert.equal(plan.child, undefined, 'a dry run must not start a process');
  assert.equal(plan.versionProbed, false, 'a dry run must not probe the Pi version');
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
  keep(result.out);
});

test('dry run plans without Pi installed and never executes a resolvable Pi', { skip }, () => {
  const withoutPi = run('dry-run-no-pi', ['--dry-run'], { env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME } });
  assert.equal(withoutPi.status, 0, withoutPi.stderr);
  assert.equal(withoutPi.receipt.success, true, JSON.stringify(withoutPi.receipt.failedChecks));
  assert.equal(withoutPi.receipt.command.executable, null, 'an uninstalled Pi is recorded, not required');
  assert.equal(withoutPi.receipt.child, undefined);

  const stubRoot = caseDir('dry-run-stub-pi');
  const bin = path.join(stubRoot, 'bin');
  fs.mkdirSync(bin);
  const invoked = path.join(bin, 'version-invoked');
  fs.writeFileSync(path.join(bin, 'pi'), `#!/bin/sh\nprintf invoked > ${JSON.stringify(invoked)}\nexit 1\n`);
  fs.chmodSync(path.join(bin, 'pi'), 0o700);
  const withStub = run('dry-run-stub-pi', ['--dry-run'], { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: process.env.HOME } });
  assert.equal(withStub.status, 0, withStub.stderr);
  assert.equal(withStub.receipt.success, true, JSON.stringify(withStub.receipt.failedChecks));
  assert.equal(withStub.receipt.command.executable, path.join(bin, 'pi'));
  assert.equal(withStub.receipt.versionProbed, false);
  assert.equal(fs.existsSync(invoked), false, 'the resolved Pi must not be executed by a plan');
  keep(withoutPi.out);
  keep(withStub.out);
  keep(stubRoot);
});

test('unsafe roots, packages, dimensions and the OS-effect mode are refused before spawning', { skip }, () => {
  const unsafeOut = spawnSync(python, [runner, '--profile', 'fixture', '--command', node, '--out', '/'], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(unsafeOut.status, 0);
  assert.match(unsafeOut.stderr, /refusing unsafe --out/);

  const missingPackage = spawnSync(python, [runner, '--dry-run', '--package', path.join(repository, 'test'), '--out', scratchPath('pkg')],
    { cwd: repository, encoding: 'utf8' });
  assert.notEqual(missingPackage.status, 0);
  assert.match(missingPackage.stderr, /no src\/pi-notify-mac\.ts/);

  const badDimensions = spawnSync(python, [runner, '--dry-run', '--rows', '0', '--out', scratchPath('rows')], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(badDimensions.status, 0);
  assert.match(badDimensions.stderr, /--rows\/--cols/);

  const negativeTimeout = spawnSync(python, [runner, '--dry-run', '--quit-timeout', '-1', '--out', scratchPath('timeout')], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(negativeTimeout.status, 0);
  assert.match(negativeTimeout.stderr, /must not be negative/);

  const effectsWithoutOptIn = spawnSync(python, [runner, '--mode', 'os-effects', '--out', scratchPath('effects')], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(effectsWithoutOptIn.status, 0);
  assert.match(effectsWithoutOptIn.stderr, /requires the explicit --allow-os-effects flag/);

  const optInWithoutMode = spawnSync(python, [runner, '--allow-os-effects', '--out', scratchPath('optin')], { cwd: repository, encoding: 'utf8' });
  assert.notEqual(optInWithoutMode.status, 0);
  assert.match(optInWithoutMode.stderr, /requires --mode os-effects/);
});

after(() => {
  if (cases.size === 0) return;
  console.log(`owned-PTY failure artifacts preserved at ${scratchRoot}:`);
  for (const dir of [...cases].sort()) console.log(`  ${dir}`);
});
