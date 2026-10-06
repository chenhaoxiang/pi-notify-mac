---
doc_type: spec
project: workspace
status: active
truth_mode: maintained
created: 2026-10-06
verified: 2026-10-06
verified_by: manual
owner: chx
---

# Completion notifications and the 0.1.1 migration

## Authorized scope

Import the existing local completion protections, add synthetic regressions and verify the published Subagents 0.76.1 interface, release this original project as 0.1.1, preserve the prior manual source and switch to exactly one fixed package. This does not authorize model prompts, real notification/sound tests, other services, or forced reload/restart of active Pi sessions.

The local 242-line source has SHA256 `273272e30e1e82ee95bcb9e3f23b61d10a3274386db4c1462e2922bebfde23e0`. The released 0.0.1/0.1.0 source has SHA256 `d77aa85e0e2bc6612534e23356ad6fddc289e05146154c05a3119cefa187efb4`. Four basic delivery/title/project helpers are identical. No matching local enhancement exists in the currently reachable named repository history; file mtime is not authorship evidence. Retain frozen source fixtures and characterization assertions before changing production code.

## Delivery contract

- Register on `agent_settled`, not `agent_end`; preserve macOS notification, configured sound, sanitized terminal title and bell.
- Only TUI mode may schedule or write terminal control sequences. RPC, JSON and print must remain quiet.
- Suppress when pending messages exist or a same-session asynchronous run is queued/running. Determine ownership by session file first, then session ID, not by model ID or a start/completion event counter.
- Inspect top-level status and children under owned root-run IDs. A terminal top-level controller does not prove its nested children are finished. Other identifiable sessions must not block this one.
- Missing directories/files may represent absence or cleanup; unreadable/corrupt/unrecognized status is uncertainty, not proof of completion. Preserve conservative suppression. Never print raw malformed JSON in diagnostics.
- Schedule a cancellable, unreferenced grace timer (default 6000ms); do not await a delay in the settled handler, which would block deferred work from other handlers. Recheck pending messages, identity and active runs before dispatch.
- Cancel on `agent_start`, `session_start` and `session_shutdown`; repeated settle replaces rather than duplicates a timer. Stale contexts suppress dispatch.
- `PI_NOTIFY_MAC_GRACE_MS=0` disables the delay, not the guards. Invalid or out-of-range timer values use the default rather than Node's overflow clamp. `PI_NOTIFY_MAC_SOUND=''` disables the notification sound only, not the bell/title.
- Notification errors must not fail the session. A settled notification means that this session has returned to input; it is not proof that every child succeeded or that arbitrary detached external work finished.

## Pinned Subagents interface

Inspected release `v0.76.1-fork.1`, source `e40a8bbc218f9bfeb7e0818430b5d361d3416591`:

| Property | Source contract |
|---|---|
| Session identity | `src/shared/session-identity.ts`: `getSessionFile() ?? getSessionId()` |
| Active state | `src/runs/background/active-run-index.ts`: exactly `queued` and `running` |
| Other known status states | `src/shared/types.ts` `AsyncStatus`: `complete`, `failed`, `partial`, `paused`, `stopped`, `rejected` |
| macOS default root | `src/shared/types.ts`: UID-scoped directory under `os.tmpdir()`; explicit `PI_SUBAGENTS_TEMP_ROOT` takes precedence |
| Top-level status | `async-subagent-runs/<runId>/status.json`; producer uses current parent session identity |
| Nested status | `src/runs/shared/nested-events.ts`: `nested-subagent-runs/<rootRunId>/<childRunId>/status.json`; nested session ID is the child identity, so attribute via root |
| Completion batcher | `src/runs/background/completion-batcher.ts`: default max wait 1000ms |

The 6-second grace covers the inspected default polling/coalescing/batching path, not an absolute timing guarantee. Larger configured batch windows or host scheduling delays require an appropriately larger grace. Compatibility is bounded to this inspected schema; unknown future states suppress rather than guess. No source import from an installed Subagents package or scanning of personal configuration is needed at runtime.

Pi's installed exported context declarations provide `mode`, `hasPendingMessages()`, the session manager and all four lifecycle events. Pi's documentation requires terminal-only effects to use `ctx.mode === 'tui'` and cleanup to be idempotent.

## Synthetic verification

Use a Node VM module with TypeScript erasure and an allowlisted linker. Supply fake filesystem/status trees, fake process/stdout/console, fake os values, fake timers, and a fake child-process module. No test imports the real notification transport, accesses real run/session data, or sends prompts. Baseline fixtures remain immutable; regression assertions are append-only after their introduction.

Cover mode guards, queues, both active states, known non-active states, unknown/corrupt data, different/missing ownership, nested ownership, missing/IO failures, resume/reload reconstruction from disk, delay boundaries and overrides, cancellation/replacement/unref, and errors/stale contexts. Contract checks use pinned public producer source and synthetic data, not live runs. Isolated Pi RPC startup checks only registration/load and JSON framing without model prompts; it does not prove macOS permissions or actual delivery.

## Local candidate evidence

Before publication, the candidate implementation passed 60 synthetic tests with no skips, the five pinned public producer hashes/state contracts, and isolated Pi RPC proof of all four registrations with two successful read-only commands, zero prompts and zero notification-transport invocations. These are local checks, not review/CI/release/installation completion or macOS delivery acceptance. The workspace-wide docmeta gate is not this repository's control-file set; owner documents use the official staged subrepository docmeta-lite schema check instead.

## Publication and installation boundaries

Follow [release maintenance](releasing.md), publish immutable tag/assets and verify fresh public downloads before installation. Back up the manual source and the pre-switch package configuration to an owner-only location. Move the manual file outside the automatic extension-discovery directory before enabling the fixed package. If installation fails, retain the recoverable backup and report/restore the previous single source; never leave two enabled copies.

Record exact release source, asset checksums, installed selection, source backup match and changed settings fields. Existing sessions may still hold the old module; do not claim hot-load or real delivery without separate evidence. Delivery results will be appended after actual review, CI, release and installation rather than checking future work off in advance.
