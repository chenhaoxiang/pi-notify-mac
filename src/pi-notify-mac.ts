import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXTENSION_NAME = "pi-notify-mac";
const DEFAULT_SOUND = "Glass";
// Grace period before dispatching the notification. Must exceed the
// pi-subagents completion-delivery path: result-watcher polling fallback (3s)
// + result coalescer (~50ms) + intercom wait (<=500ms) + completion batcher
// (<=1s by default) ~= 4.55s. The wake-up triggered by that delivery cancels
// this timer via agent_start. A longer configured batcher maxWaitMs requires
// raising PI_NOTIFY_MAC_GRACE_MS accordingly. 0 disables the delay.
const DEFAULT_GRACE_MS = 6000;

// pi-subagents async-run state layout (src/shared/types.ts +
// runs/shared/nested-events.ts): top-level runs live in
//   async-subagent-runs/<runId>/status.json
// nested workflow children live in
//   nested-subagent-runs/<rootRunId>/<childRunId>/status.json
// Each status.json carries { runId, sessionId, state }; active states are
// exactly "queued"/"running" (active-run-index.ts isActiveAsyncState).
// NOTE: a nested run's "sessionId" is the runner subprocess session, not the
// parent session - nested ownership is derived from the rootRunId directory.
const ACTIVE_RUN_STATES = new Set(["queued", "running"]);
const KNOWN_RUN_STATES = new Set(["queued", "running", "complete", "failed", "partial", "paused", "stopped", "rejected"]);

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\\r\\n]/g, " ")}"`;
}

function sendMacNotification(title: string, message: string, sound: string): void {
  const script = `display notification ${appleScriptString(message)} with title ${appleScriptString(title)}${sound ? ` sound name ${appleScriptString(sound)}` : ""}`;

  execFile("osascript", ["-e", script], (error) => {
    if (error) {
      // Notifications must never interfere with the Pi session.
      console.error(`[${EXTENSION_NAME}] macOS notification failed: ${error.message}`);
    }
  });
}

function setTerminalTitle(title: string): void {
  // OSC 0 is supported by Terminal.app, iTerm2, Ghostty, and most xterm-compatible terminals.
  process.stdout.write(`\x1b]0;${title.replace(/[\x00-\x1f\x7f]/g, "")}\x07`);
}

function getProjectName(): string {
  return path.basename(process.cwd()) || "Pi";
}

function tempRoot(): string {
  const configured = process.env.PI_SUBAGENTS_TEMP_ROOT?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(os.tmpdir(), `pi-subagents-uid-${process.getuid?.() ?? os.userInfo().uid}`);
}

// "missing" = definitively absent (ENOENT/ENOTDIR); null = unknown (any other
// failure). Unknown must fail CLOSED (suppress the notification): an active
// run whose state cannot be read is indistinguishable from "no run" otherwise.
function readDirSafe(dir: string): fs.Dirent[] | "missing" | null {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    console.error(`[${EXTENSION_NAME}] failed to scan async status directory`);
    return null;
  }
}

function readRunState(runDir: string): { state?: unknown; sessionId?: unknown } | "missing" | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(runDir, "status.json"), "utf8"));
    // status.json is written atomically, so a parse failure means corruption.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error(`[${EXTENSION_NAME}] corrupt status.json in '${runDir}': not a plain object`);
      return null;
    }
    return parsed as { state?: unknown; sessionId?: unknown };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing"; // cleaned up mid-scan
    if (error instanceof SyntaxError) {
      console.error(`[${EXTENSION_NAME}] corrupt status.json: invalid JSON`);
      return null;
    }
    console.error(`[${EXTENSION_NAME}] failed to read async status`);
    return null;
  }
}

/**
 * Authoritative check for async subagent runs (including heterogeneous-model
 * children dispatched via `model=`) whose completion can still wake this
 * session. While any such run is active, agent_settled only means "waiting
 * for children", not "task complete".
 *
 * The filesystem is the source of truth rather than event pairing: after
 * /resume, /reload or a process restart, pi-subagents restores active runs
 * from disk WITHOUT re-emitting subagent:async-started, so an event-counter
 * approach silently loses track of them.
 */
function hasActiveSubagentRuns(sessionIdentity: string | undefined): boolean {
  const root = tempRoot();
  const topDir = path.join(root, "async-subagent-runs");
  const ownRunIds = new Set<string>();

  const topLevel = readDirSafe(topDir);
  if (topLevel === null) return true; // scan failure: fail closed
  if (topLevel !== "missing") {
    for (const entry of topLevel) {
      // Skip the .active-runs / .terminal-runs index directories.
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory()) {
        console.error(`[${EXTENSION_NAME}] unexpected non-directory entry '${entry.name}' in '${topDir}'`);
        return true; // unknown layout: fail closed
      }
      const status = readRunState(path.join(topDir, entry.name));
      if (status === null) return true;
      if (status === "missing") continue;
      // Runs without a readable sessionId cannot be attributed: treat them as
      // belonging to this session (conservative).
      const belongs =
        !sessionIdentity ||
        typeof status.sessionId !== "string" ||
        status.sessionId === sessionIdentity;
      if (!belongs) continue;
      ownRunIds.add(entry.name); // directory name IS the run id
      if (typeof status.state !== "string" || !KNOWN_RUN_STATES.has(status.state)) return true; // corrupt: conservative
      if (ACTIVE_RUN_STATES.has(status.state)) return true;
    }
  }

  // Nested runs of this session's top-level runs. A nested child can outlive
  // its parent's control object (crash repair / released foreground control),
  // so top-level terminal state alone is not proof that nothing will wake us.
  if (ownRunIds.size === 0) return false;
  const nestedDir = path.join(root, "nested-subagent-runs");
  const nestedRoots = readDirSafe(nestedDir);
  if (nestedRoots === null) return true;
  if (nestedRoots === "missing") return false;
  for (const entry of nestedRoots) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory()) {
      console.error(`[${EXTENSION_NAME}] unexpected non-directory entry '${entry.name}' in '${nestedDir}'`);
      return true;
    }
    if (!ownRunIds.has(entry.name)) continue; // other session's or cleaned-up root
    const children = readDirSafe(path.join(nestedDir, entry.name));
    if (children === null) return true;
    if (children === "missing") continue;
    for (const child of children) {
      if (child.name.startsWith(".")) continue;
      if (!child.isDirectory()) {
        console.error(`[${EXTENSION_NAME}] unexpected non-directory entry '${child.name}' in '${path.join(nestedDir, entry.name)}'`);
        return true;
      }
      const status = readRunState(path.join(nestedDir, entry.name, child.name));
      if (status === null) return true;
      if (status === "missing") continue;
      if (typeof status.state !== "string" || !KNOWN_RUN_STATES.has(status.state)) return true;
      if (ACTIVE_RUN_STATES.has(status.state)) return true;
    }
  }
  return false;
}

export default function (pi: ExtensionAPI) {
  // pi-subagents identifies sessions by session FILE first
  // (shared/session-identity.ts): status.json "sessionId" actually holds the
  // .jsonl path. Mirror that exactly or the per-session filter silently
  // matches nothing and counts runs from other sessions.
  let currentSessionIdentity: string | undefined;
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelScheduledNotification = () => {
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    currentSessionIdentity =
      ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();
    cancelScheduledNotification();
  });

  pi.on("agent_start", () => {
    // A new run means the previous settle was only an intermediate wait.
    cancelScheduledNotification();
  });

  pi.on("session_shutdown", () => {
    cancelScheduledNotification();
  });

  pi.on("agent_settled", (_event, ctx) => {
    // Notifications, terminal titles and bells are for interactive sessions
    // only; never write control sequences into print/json/rpc output streams.
    if (ctx.mode !== "tui") return;
    // A queued follow-up message (e.g. a subagent completion delivery) is
    // about to trigger a new turn.
    try {
      if (ctx.hasPendingMessages()) return;
    } catch {
      return; // A replaced context is not proof of an idle session.
    }
    if (hasActiveSubagentRuns(currentSessionIdentity)) return;

    // Do not await a delay inside this handler: deferred work requested by
    // other settled handlers only starts after every handler returns.
    cancelScheduledNotification();
    const graceText = process.env.PI_NOTIFY_MAC_GRACE_MS?.trim() ?? "";
    const graceEnv = /^\d+$/.test(graceText) ? Number(graceText) : Number.NaN;
    const delay = Number.isSafeInteger(graceEnv) && graceEnv >= 0 && graceEnv <= 2147483647
      ? graceEnv : DEFAULT_GRACE_MS;
    const identitySnapshot = currentSessionIdentity;

    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      // The session was switched/reloaded after this timer was scheduled.
      if (currentSessionIdentity !== identitySnapshot) return;
      try {
        // A completion delivery may have been queued during the grace window
        // while its run is already terminal and agent_start has not fired yet.
        if (ctx.hasPendingMessages()) return;
      } catch {
        return; // ctx is stale after session replacement: do not notify.
      }
      // Re-check the authoritative source in case a run appeared meanwhile.
      if (hasActiveSubagentRuns(currentSessionIdentity)) return;

      const project = getProjectName();
      const title = `✓ ${project}`;
      const message = `${project} session 已完成，等待输入`;
      const sound = process.env.PI_NOTIFY_MAC_SOUND ?? DEFAULT_SOUND;

      sendMacNotification("Pi 已完成", message, sound);
      setTerminalTitle(title);
      process.stdout.write("\x07");
    }, delay);
    // Never keep the process alive just to fire a notification.
    notifyTimer.unref?.();
  });
}
