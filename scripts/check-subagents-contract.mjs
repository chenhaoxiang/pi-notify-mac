// Verify public producer source at an immutable commit; never import its code.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const fixture = JSON.parse(readFileSync(new URL('../test/fixtures/subagents-0.76.1-contract.json', import.meta.url), 'utf8'));
const i = process.argv.indexOf('--repo');
assert.ok(i >= 0 && process.argv[i + 1], 'Usage: node scripts/check-subagents-contract.mjs --repo <public-subagents-checkout>');
const repo = resolve(process.argv[i + 1]);
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
assert.equal(git('rev-parse', `${fixture.sourceCommit}^{commit}`).trim(), fixture.sourceCommit);
const texts = {};
for (const [name, hash] of Object.entries(fixture.files)) {
  const text = git('show', `${fixture.sourceCommit}:${name}`);
  assert.equal(createHash('sha256').update(text).digest('hex'), hash, `Pinned producer changed: ${name}`);
  texts[name] = text;
}
const types = texts['src/shared/types.ts'];
const status = types.slice(types.indexOf('export interface AsyncStatus {'));
const stateLine = status.match(/^\s*state: ([^;]+);/m)?.[1];
assert.ok(stateLine, 'No AsyncStatus state declaration');
assert.deepEqual([...stateLine.matchAll(/"([a-z]+)"/g)].map(m => m[1]), fixture.knownStates);
assert.match(texts['src/runs/background/active-run-index.ts'], /return state === "queued" \|\| state === "running";/);
assert.match(texts['src/shared/session-identity.ts'], /getSessionFile\(\) \?\? sessionManager.getSessionId\(\)/);
assert.match(types, /return `uid-\$\{getuid\(\)\}`/);
assert.match(types, /PI_SUBAGENTS_TEMP_ROOT\?\.trim\(\)/);
assert.match(types, /path\.join\(os\.tmpdir\(\), `pi-subagents-\$\{resolveTempScopeId\(\)\}`\)/);
assert.match(types, /ASYNC_DIR = path\.join\(TEMP_ROOT_DIR, "async-subagent-runs"\)/);
assert.match(texts['src/runs/shared/nested-events.ts'], /path\.resolve\(TEMP_ROOT_DIR, "nested-subagent-runs", rootRunId, run.id\)/);
assert.match(texts['src/runs/background/completion-batcher.ts'], /maxWaitMs: 1000,/);
const consumer = readFileSync(new URL('../src/pi-notify-mac.ts', import.meta.url), 'utf8');
const declared = consumer.match(/const KNOWN_RUN_STATES = new Set\(\[([^\]]+)\]\)/)?.[1];
assert.ok(declared, 'Consumer must explicitly recognize the pinned schema');
assert.deepEqual([...declared.matchAll(/"([a-z]+)"/g)].map(m => m[1]), fixture.knownStates);
console.log(JSON.stringify({ producer: fixture.repository, tag: fixture.tag, sourceCommit: fixture.sourceCommit, publicSourceHashesVerified: Object.keys(texts).length, activeStates: fixture.activeStates, knownStates: fixture.knownStates, macUIDAndExplicitRoot: true, parentFileIdentity: true, nestedLayout: true, defaultBatchMaxWaitMs: 1000, importedProducerCode: false, readRealRunState: false }, null, 2));
