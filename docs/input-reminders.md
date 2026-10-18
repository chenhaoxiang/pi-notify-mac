---
doc_type: guide
project: workspace
status: active
truth_mode: maintained
created: 2026-10-18
verified: 2026-10-18
verified_by: manual
owner: chx
updated: 2026-10-19
reviewed: 2026-10-19
manual_smoke: partial
release: 0.3.0
---

# Waiting-for-input reminders and legacy migration

## One package, two purposes

The 0.3.0 source integrates the former personal `approval-notify.ts` behavior into `pi-notify-mac`. `src/pi-notify-mac.ts` is the only manifest entry; `input-reminder.ts` and `terminal-focus.ts` are internal modules, not separately discoverable extensions. Do not copy just the entry file. No old-path import, deprecated shim, second package or dependency on `rpiv-ask-user-question` is retained.

Completion notifications keep their existing final-settle, pending-message, child-state and renewed-grace guards. Input reminders independently request a macOS warning alert, Hero sound and a TTY-only bell. The alert is an attention hint, never an approval decision. “知道了”/Escape dismisses the reminder only; “去终端处理” selects the originating Terminal/iTerm tab. Unknown/no tty has no jump button; other recognized terminals offer explicitly app-only activation. Parent-tty fallback says “返回父会话” and does not claim a background confirmation awaits there.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PI_NOTIFY_MAC_COMPLETION` | enabled | `0`, `false` or `off` disables completion effects only |
| `PI_NOTIFY_MAC_INPUT` | enabled | Same disable values, input effects only |
| `PI_NOTIFY_MAC_INPUT_SOUND` | `Hero` | System sound name; empty disables input sounds, not the alert |
| `PI_NOTIFY_MAC_INPUT_REPEAT_MS` | `30000` | Repeat while the alert remains open; `0` disables repeats |
| `PI_NOTIFY_MAC_INPUT_DELAY_MS` | `250` | Cancellable initial delay; `0` removes the grace only |

Disable values are case-insensitive and trim whitespace. Millisecond values must be decimal integers from 0 to 2147483647; invalid/overflow values use defaults. Nonzero repeats below 1000ms use the 30000ms default to avoid a sound/process storm. Invalid sound names fall back to Hero and cannot become arbitrary paths. Existing completion sound/grace variables remain unchanged.

## Lifecycle and privacy

Actual `ui_prompt_start/end` intervals control delivery. Standard confirm/select/input/editor qualify. Generic custom UI never qualifies by tool execution alone. The actual question factory in `rpiv-ask-user-question` 0.1.4-fork.5 emits `pi:input-required` with `{version:1, source:"ask_user_question", id:<opaque call id>, phase:"start"|"end"}`. Notify matches the end ID to the accepted start; no source import or package dependency is needed. Unrelated overlays stay silent even while a question is executing. Older producers still ask normally but lack this optional precise reminder signal. Invalid/no-UI/already-aborted questions emit no start. On the verified Pi 1.3.0-fork.1 host, nested prompts share one outer start/end interval; this is not a per-inner-dialog or universal arbitrary-custom-UI attribution contract.

Prompt resolution, the matching producer end event, new runs, session replacement and shutdown cancel owned timers and abort alert/sound/focus subprocesses. Acknowledgement stops repeating sound without answering the UI; late callbacks cannot jump after cancellation. Mode/UI are rechecked before dispatch and sound repetition. Only macOS TUI contexts with UI can remind; RPC/JSON/print and no-UI runners stay silent. No factory-time subprocesses or timers are started.

The OS alert does not include prompt titles, question text, options, answers, tool arguments or session-file paths. `/notify-status` is read-only and reports both enable switches and input state (`idle`, `delay`, `alert-requested`, `dismissed`, `dismissed-or-unavailable`, `disabled`). A requested alert is not proof of macOS presentation. Terminal tty lookup is asynchronous with a 1s timeout, focus with 2s, and sound playback with 5s. The human-facing alert has no timeout but is abortable with its prompt lifetime. Exact Terminal selection uses PID-addressed AppleEvents, not application-name fallback to an arbitrary instance. Jump failures are logged without raw subprocess output or prompt data. tmux tty indirection may prevent exact lookup; iTerm and cross-Space behavior still require environment-specific manual checks.

## Install and migrate

Verify a trusted source/package and its checksums first. For a new installation use the pinned package source; for migration from old manual files run `sh install.sh` inside the verified extracted package. Optional `PI_AGENT_DIR` (legacy installer override) or `PI_CODING_AGENT_DIR` selects an isolated agent directory.

The local installer is for migration of an existing installation only. For a fresh agent directory with no `settings.json`, use official `pi install`; `sh install.sh` refuses that case so it cannot compete with Pi's native first-write behavior. If that directory still contains a manual `extensions/approval-notify.ts` or `extensions/pi-notify-mac.ts`, preserve and move those exact files outside extension discovery before enabling the package. Official package installation does not itself remove those manual files; never leave both sources enabled.

The local installer:

1. Stages the complete shipped package into `packages/pi-notify-mac/<version>` under the agent directory; an existing different version directory is never overwritten. A repeated installation of identical bytes is safe.
2. Preserves original settings and legacy `extensions/approval-notify.ts` / `extensions/pi-notify-mac.ts` outside discovery in a private `backups/pi-notify-mac/<id>/` directory. Backed-up settings may contain private configuration; never publish them.
3. Replaces only recognized Notify package declarations, removes exact old extension declarations and keeps unrelated settings. Existing resource filters are retained; conflicting filters stop migration instead of being guessed. Same-named files elsewhere are not removed.
4. Stages package bytes before acquiring the same `settings.json.lock` atomic-directory protocol used by Pi 1.3.0 FileSettingsStorage/proper-lockfile. The settings read/modify/rename critical section is bounded to 2 seconds, ahead of the inspected 10-second default stale lease; an already-held lock is never reclaimed, and a replacement inode is never removed. Cooperative Pi writers cannot interleave an **existing-settings** migration. Pi's native first-write path computes missing-file settings before its own lock, so fresh creation is deliberately excluded. Direct editors or other writers that ignore this protocol must be quiescent. Byte checks catch observed out-of-protocol changes but are not an atomic compare-and-swap against arbitrary writers. Caught installation failures restore moved legacy files and do not select a partial package.
5. Prints a non-secret installation receipt. It does not call a model, play a sound, send an alert, force reload or stop a running session.

Old released versions and private backups are intentional rollback assets, not active dependencies. To roll back, stop new sessions, restore the preserved settings and legacy files only when no newer changes would be overwritten; select the previous package as a single source. Do not blindly restore settings if other packages were changed afterwards. Existing Pi sessions retain already-loaded code until voluntarily restarted; disk migration is not hot-load proof.

## Dependency inventory and verification boundary

On 2026-10-18, active workspace code/scripts/config/docs plus personal extensions, package sources, skills and helper directories were searched for `approval-notify`. The only active legacy implementation was the personal extension; no other project import or install handler was found. The later independent review identified missing custom-prompt ownership metadata, so this change also adds the optional content-free producer signal to the maintained question package; this is an explicit compatibility change, not a pre-existing approval-notify dependency. One 2026-09-22 asset inventory snapshot names the former extension and is retained as dated history, not an installation instruction. Private session logs, caches, backups and frozen/retired assets are not active dependencies and are not rewritten. Arbitrary user CLI overrides or machines outside this scan cannot be claimed exhausted.

Synthetic runtime tests virtualize subprocesses, timers, stdout and run trees. Installer tests use disposable agent directories under repository `tmp/`. Retain the old 98-test baseline and four frozen delivery helpers. The no-prompt native loader check and pinned Subagents checks are separate from manual macOS alert/sound/focus acceptance. Release, installation and live-session activation must be reported from actual evidence, not inferred from passing tests.

## Post-delivery review and manual smoke boundary (2026-10-19)

A read-only review of the current main branches, installed sources, release evidence, lifecycle bridge and migration boundary found no blocker or major issue. The current personal selection is exactly `packages/pi-notify-mac/0.3.0` plus `git:github.com/chenhaoxiang/rpiv-ask-user-question@v0.1.4-fork.5`; the old `approval-notify.ts` and manual `pi-notify-mac.ts` are absent from automatic discovery. Main CI remains green. This review did not change code, settings or release assets.

The next highest-value validation is a real macOS smoke, which is intentionally separate from automated tests:

1. Open `confirm`, `select`, `input` and editor prompts in Terminal.app or iTerm and verify the warning appears after the short delay.
2. Open `ask_user_question` and verify exactly one warning; open an unrelated custom overlay and verify it does not add another warning.
3. Click “知道了” or press Escape and confirm that only the reminder closes; the original prompt remains pending.
4. Answer/cancel the prompt and confirm repeated sound, alert subprocesses and late focus work stop.
5. Use “去终端处理” with multiple Terminal.app/iTerm windows and verify the originating tab; record background, missing-tty, tmux and cross-Space behavior as limitations rather than exact-focus success.
6. Restart a disposable/current Pi session voluntarily before considering old-session behavior accepted; no live session is force-stopped by this checklist.

### 2026-10-19 paired manual result

In a newly opened test session, the user supplied the following observations:

- Round 1: the user explicitly reported seeing and closing the reminder. Asked jointly whether the original question remained usable and whether the sound/quieting behavior was normal, the user replied “是好的”; the question also returned “测试 A” normally. This is a combined user confirmation, not separately instrumented visual/audio assertions.
- Round 2: instructed to switch to another existing Terminal window/tab and click “去终端处理”, the user selected “跳回了正确的窗口和标签”. This supports correct focus in that one scenario, not every Terminal instance or window layout.

The private local session journal records the two normal test answers at `2026-10-18T22:07:41.171Z` and `2026-10-18T22:11:53.342Z`; the visual/audio observations came from the user. Only synthetic test labels and timestamps are summarized here; no private transcript or machine settings are attached. This is user-observed manual evidence, not an independently instrumented OS-delivery receipt.

Not covered by this paired run: the full 30-second repeat interval, answering while the system alert is still open (automatic close/sound cancellation), standard confirm/select/input/editor prompt types, iTerm or other terminal types, tmux, cross-Space/minimized windows, abort/error cleanup, or hot-loading an already-running session. Those remain open boundaries.

### Future optimization candidates

These are not current release blockers:

- **P2 — missing-settings legacy helper:** `sh install.sh` intentionally refuses when `settings.json` is absent because Pi’s native first-write callback is computed before its lock. If a future fresh-agent workflow must remove an old manual extension too, add a separate `legacy-disable` operation that only backs up/moves exact legacy files and never creates or edits `settings.json`.
- **P2 — native smoke receipt:** after the manual checklist, add a dated acceptance snapshot recording terminal/profile, prompt kinds, focus result and tmux/cross-Space limitations. Do not turn synthetic RPC or virtual transport into native-delivery proof.
- **P3 — packaged README wording:** the immutable 0.3.0/fork.5 tarballs retain the candidate-version wording present when they were built; maintained main documentation now records their released status. Align that wording before packing the next normal release, without rebuilding or replacing these versions. Flat checksum generation is already documented in the release runbooks; the current versions use the supplementary `DOWNLOAD-SHA256SUMS`.
