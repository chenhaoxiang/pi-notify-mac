// Virtualize effects of these trusted source fixtures; not a security sandbox.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

export const OWNER = '/fixtures/owner.jsonl';
export const OTHER = '/fixtures/other.jsonl';
export const ROOT = '/fixtures/pi-subagents';
const missing = () => Object.assign(new Error('fixture missing'), { code: 'ENOENT' });
export const entry = (name, directory = true) => ({ name, isDirectory: () => directory });

export async function harness(source, options = {}) {
  const env = { PI_SUBAGENTS_TEMP_ROOT: ROOT, ...options.env };
  const uid = options.uid ?? 501;
  const fakePath = { ...path, resolve: (...parts) => path.resolve('/fixtures/demo', ...parts) };
  const root = env.PI_SUBAGENTS_TEMP_ROOT?.trim()
    ? fakePath.resolve(env.PI_SUBAGENTS_TEMP_ROOT.trim())
    : `/fixtures/tmp/pi-subagents-uid-${uid}`;
  const top = path.join(root, 'async-subagent-runs');
  const nested = path.join(root, 'nested-subagent-runs');
  const dirs = new Map([[top, []], [nested, []]]);
  const files = new Map();
  const reads = [], errors = [], outputs = [], calls = [], delays = [];
  const handlers = new Map(), timers = new Map();
  let now = 0, nextId = 0, unrefs = 0;
  const clock = {
    setTimeout(fn, delay) {
      delays.push(delay);
      // Model Node's minimum and signed-32-bit timer overflow behavior.
      const effective = !Number.isFinite(delay) || delay < 1 || delay > 2147483647 ? 1 : Math.trunc(delay);
      const handle = { id: ++nextId, unref() { unrefs++; } };
      timers.set(handle.id, { handle, due: now + effective, fn });
      return handle;
    },
    clearTimeout(handle) { timers.delete(handle?.id); },
    advance(ms) {
      const end = now + ms;
      let count = 0;
      for (;;) {
        const next = [...timers.values()].filter(t => t.due <= end).sort((a, b) => a.due - b.due || a.handle.id - b.handle.id)[0];
        if (!next) break;
        if (++count > 100) throw new Error('fixture timer loop');
        now = next.due; timers.delete(next.handle.id); next.fn();
      }
      now = end;
    },
    get pending() { return timers.size; },
    get unrefs() { return unrefs; },
  };
  const fakeFs = {
    readdirSync(file) {
      reads.push(file);
      if (!dirs.has(file)) throw missing();
      const value = dirs.get(file);
      if (value instanceof Error) throw value;
      return value;
    },
    readFileSync(file) {
      reads.push(file);
      if (!files.has(file)) throw missing();
      const value = files.get(file);
      if (value instanceof Error) throw value;
      return value;
    },
  };
  const fakeProcess = {
    env, cwd: () => '/fixtures/demo', getuid: () => uid,
    stdout: { write: value => { outputs.push(String(value)); return true; } },
  };
  const fakeOs = { tmpdir: () => '/fixtures/tmp', userInfo: () => ({ uid }) };
  const context = createContext({
    process: fakeProcess, console: { error: (...args) => errors.push(args.map(String).join(' ')) },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  });
  const modules = {
    'node:fs': { default: fakeFs },
    'node:os': { default: fakeOs },
    'node:path': { default: fakePath },
    'node:child_process': { execFile: (command, args, callback) => {
      calls.push({ command, args }); callback(options.deliveryError);
    } },
  };
  const text = source instanceof URL ? await readFile(source, 'utf8') : source;
  const module = new SourceTextModule(stripTypeScriptTypes(text), { context });
  await module.link(specifier => {
    const values = modules[specifier];
    if (!values) throw new Error(`Fixture refuses unapproved import ${specifier}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  module.namespace.default({ on: (event, fn) => {
    if (handlers.has(event)) throw new Error(`Duplicate fixture registration ${event}`);
    handlers.set(event, fn);
    return () => handlers.delete(event);
  } });
  const state = { mode: 'tui', sessionFile: OWNER, sessionId: 'fallback-owner', pending: false, stale: false };
  const ctx = {
    get mode() { return state.mode; },
    hasPendingMessages: () => { if (state.stale) throw new Error('fixture stale'); return state.pending; },
    sessionManager: { getSessionFile: () => state.sessionFile, getSessionId: () => state.sessionId },
  };
  const addEntry = (parent, name) => {
    if (!dirs.has(parent)) dirs.set(parent, []);
    const list = dirs.get(parent);
    if (!list.some(e => e.name === name)) list.push(entry(name));
  };
  return {
    state, clock, dirs, files, reads, errors, outputs, calls, delays, handlers, top, nested, root,
    async emit(name) { const fn = handlers.get(name); if (fn) await fn({ type: name }, ctx); },
    run(name, status = {}) {
      addEntry(top, name);
      files.set(path.join(top, name, 'status.json'), typeof status === 'string' ? status : JSON.stringify(status));
    },
    child(parent, name, status = {}) {
      addEntry(nested, parent); addEntry(path.join(nested, parent), name);
      files.set(path.join(nested, parent, name, 'status.json'), typeof status === 'string' ? status : JSON.stringify(status));
    },
    ioError(kind, file, code = 'EACCES', message = 'synthetic private sentinel') {
      (kind === 'dir' ? dirs : files).set(file, Object.assign(new Error(message), { code }));
    },
  };
}
