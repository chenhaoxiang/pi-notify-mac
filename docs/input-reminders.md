---
doc_type: guide
project: workspace
status: active
truth_mode: maintained
created: 2026-10-18
verified: 2026-10-20
verified_by: manual+controlled-pty
verification_scope: Scoped agent-driven native select lifecycle, owned alert cancellation and real playback timing, plus a controlled isolated own-PTY TUI run with reminders disabled; not acoustic, GUI-cleanup or all-prompt acceptance
owner: chx
updated: 2026-10-20
reviewed: 2026-10-20
manual_smoke: partial
native_agent_smoke: scoped-select
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

### 2026-10-20 common-scenario source regression successor

A source-only test successor exercises two simultaneously waiting extension instances with the
same opaque question ID in separate virtual runtimes; each instance retains its own
timer/alert/sound state when A resolves, dismisses, starts a run, is replaced or shuts down.
This is per-instance characterization, not proof about shared native delivery resources. It also checks the full default
30-second boundary twice (initial/30s/60s sound requests), one OS-alert request per waiting
interval, and no repeat after synthetic resolution while the alert is still open.
Input resolution alone must not emit a task-completion notification.

The existing virtual-transport harness passes 172/172 tests (prior 166 retained plus six new
scenarios). These are synthetic lifecycle/timer/subprocess observations, **not** real macOS
alert closure, audible repetition, a direct human answer, or multiple real Terminal sessions.
Runtime source, default intervals, switches, release 0.3.0 and installed bytes are unchanged.
No global deduplication or backoff is added: this evidence shows isolation at the existing
instance boundary and does not establish a native duplicate-notification defect.

The 2026-10-19 user-observed results above remain partial. Before the native successor
below, answer-with-alert-open, concurrent real sessions and full-30-second repetition
remained unverified. An earlier read-only check on 2026-10-20 found Cua Driver CLI 0.34.0
installed but its daemon not running;
that is an observation prerequisite gap, not a notification failure. This source successor
does not restart a shared service, launch/stop another user session, auto-answer a prompt,
change host settings or treat installation as existing-session activation.

### 2026-10-20 agent-driven native select successor

The Owner explicitly requested autonomous testing. Two disposable, separately configured
Pi **1.3.0-fork.1** TUI processes ran in dedicated Terminal.app windows with no model,
credentials, tools, discovered packages or persistent conversation. Each loaded only the
installed Notify **0.3.0** runtime and an owned synthetic-question extension. Cua Driver
**0.34.0** started in its normal standard mode; existing Accessibility/Screen Recording
permissions were read, not changed. No resident Pi session was reloaded or stopped.

The synthetic fixture used the **real native `ctx.ui.select()` lifecycle**, not injected
`ui_prompt_end` events or virtual timers. Agent input was restricted to its labelled test
windows. A transparent test-process observer passed through the real `execFile` calls,
recording fixed effect classes/times, child exit and AbortSignal state, never prompt text.
The installed runtime was neither patched nor reinstalled. Its three source SHA-256 pins
matched the tested clean checkout's `src` at commit
`18f0451f34e49e85602756f75b203ff5816974b7` (parent Git/diff readback; source pin,
not in-memory execution attestation):

- `pi-notify-mac.ts`: `3e90f4fea3c31312630db9ab8b412ed73b0386c83d29464e75e12ed24c620415`
- `input-reminder.ts`: `df1963df0442190a21c828842ee946c56aee4f1fe54c31921829a606a2443d7e`
- `terminal-focus.ts`: `a6ec4980b8ecfa7e05d34a06c141e3ec853b0b63b726877565774211f6aa2477`

| Scoped observation | Actual result |
|---|---|
| Three accepted select trials, 05:36:19–05:44:58 UTC | A.2, A.3 and B.1 returned the intended synthetic response through native window input. Their reminder process had not acknowledged/exited before the response; real UI resolution aborted it with `ABORT_ERR` and it exited by `SIGTERM`. |
| Two real sessions waiting concurrently | A.3 resolved while B.1 stayed on its question and continued its own playback schedule. A emitted no later sound request; resolving A did not cancel B. |
| Full default repeat intervals | 19 real `afplay` processes completed with exit 0 across accepted trials; consecutive in-prompt request intervals were **30000.75–30003.10 ms**, not a shortened test interval. |
| Native alert presentation and removal | B.1's owned layer-8 alert window was observed on screen through AX and a window-scoped screenshot. After resolution, the owned alert processes exited and their all-layer window metadata was empty. Cua's layer-0 `list_windows` alone cannot establish alert absence. |
| Stop after resolution | A parent-recorded 31-second check reported **zero** new sound requests. The lifecycle/effect journals independently show no new requests from final response until fixture exit (more than 31 seconds). No task-completion notification was requested by these input-only commands. |
| Isolation and cleanup | The fixture had no available models; its provider-request hook recorded 0 requests and its fetch observer recorded 0 fetch calls (not general socket/network isolation). B exited through its owned shutdown command. After an exact-window focus failure during A cleanup, its recorded PID/current-directory ownership was rechecked and only that disposable fixture received `SIGTERM`; no other Pi process was signalled. |

A first A.1 trial is **excluded**: its alert exited normally and triggered terminal
focus before the question resolved, with no agent response input recorded for that trial.
The observed external interaction cannot be attributed to autonomous acceptance. GUI delivery
failures/unverifiable responses were re-observed rather than blindly replayed; successful
answers were established from the native question-result journal, not the input tool's exit.
Raw window captures and journals remain private temporary evidence; none is attached here.

**Cleanup residual:** the two labelled Pi fixtures exited and their windows disappeared.
A separately launched Terminal instance restored old window layouts; its attempted normal
menu quit exposed termination confirmations for processes not proven to belong to the
fixture. The agent did not confirm termination or signal those processes. Exact-window
cancel/Escape delivery then failed (`ax_window_unresolved`/foreground failure); those
extra-instance confirmations remain an explicitly unresolved GUI-cleanup item. No broad
kill, unbound desktop input or alternate UI-control channel was used to hide this failure.

**Audio limit:** the system reported output volume 44 and `output muted:false`; actual
playback exit/timing is verified, but physical speaker audibility was not independently
measured or claimed. This closes the scoped native **select** cancellation/concurrency/
playback-timing gap, not every standard prompt kind, the custom `ask_user_question`
producer, iTerm/tmux, cross-Space/minimized variants, acoustic acceptance, resident-session
hot loading, general reliability or ROI. The older user-observed manual results stay partial.

### 2026-10-20 controlled isolated PTY entry (no GUI, no OS effects by default)

The native successor above depended on Terminal.app windows, Cua Driver and an extra Terminal
instance whose termination confirmations could not be attributed to the fixture. That path is
usable as manual evidence but not as a repeatable automated entry. This successor adds one
source-owned alternative and leaves the unresolved GUI residue alone.

**Entry points** (repository scripts, not shipped in the package; `npm test` never runs Pi):

```sh
# default: real Pi TUI in an owned PTY, reminders disabled, macOS transport stubbed
python3 scripts/native-pty-smoke.py
# supervision regression only: no Pi, no model, node fixtures as the child process
python3 scripts/native-pty-smoke.py --profile fixture --command "$(command -v node)" \
  --command-arg "$PWD/test/helpers/native-pty/ready-then-quit.mjs" --quit-keys $'quit\n'
# plan only: prints the environment/isolation contract without spawning anything
python3 scripts/native-pty-smoke.py --dry-run
```

`scripts/native-pty-pi-fixture.ts` is the owned fixture extension loaded next to the package
source. It exercises the real `ctx.ui.select()` lifecycle, refuses every provider request, and
counts blocked `fetch` calls. The run is not a notification run: no alert, sound, focus or
application launch is requested or delivered.

**Isolation.** The runner allocates its own PTY (`pty.fork()`), so no Terminal.app, iTerm,
GUI automation or desktop input is involved. It creates one fixture root and gives the child a
fresh `HOME`, `TMPDIR`, agent directory, session directory, cwd and Subagents temp root.
The child environment is built from an explicit allowlist; nothing is copied from the
runner's environment and no credential-like key is present. Pi starts with `--offline`,
`--no-session`, `--no-tools`, discovery disabled for extensions/skills/prompt
templates/themes/context files, and an unreachable `127.0.0.1:9` fixture provider whose key is
the literal `synthetic-not-a-credential`. `osascript`, `afplay`, `open` and
`terminal-notifier` resolve to stub executables in the fixture `PATH` that record the
invocation and exit 1. Default mode additionally sets `PI_NOTIFY_MAC_COMPLETION=0` and
`PI_NOTIFY_MAC_INPUT=0`, so no OS reminder is supposed to be requested at all. Real macOS
delivery is the separate `--mode os-effects --allow-os-effects` entry; it is not part of
`npm test` and was not run here.

**Ownership and cleanup.** The child is a session leader (`pid == pgid == sid`) inside the
PTY the runner created. Every signal is preceded by re-reading that pid's `pgid`, `sid` and
`ps -o lstart=` start time and comparing them with the identity recorded at spawn; the signal
then goes to that process group only. Because the child is unreaped while the check runs, its
pid cannot be recycled, so a stale or foreign pid is never signalled; a failed comparison is
recorded as `refused` and nothing is sent. The normal path is the quit keystroke
(`Ctrl-D`, Pi's `app.exit`), then the owned fixture's `ctx.shutdown()` command, then closing the
PTY master, then `SIGTERM`, then `SIGKILL`; each stage is bounded and each result lands in the
receipt. `SIGINT`/`SIGTERM`/`SIGHUP` to the runner take the same cleanup path and exit 130.

**Observed run at this head.** Real `pi 1.3.0-fork.1` TUI in the owned PTY:
`session_start` with `mode=tui`/`hasUI=true`, one real `ctx.ui.select()` opened and resolved to
`PASS_P` by a real Enter keystroke on the PTY, `session_shutdown`, fixture exit code 0, zero
provider requests, zero `fetch` calls, zero denied-transport invocations, graceful exit with
zero signals, and a PTY transcript containing the rendered prompt and the fixture status line.
The receipt also
carries the three `src` SHA-256 pins, the explicit child environment and the child identity.

**Limits.** This is a real TUI/PTY run with reminders disabled: it proves process isolation,
the owned prompt lifecycle and supervision, **not** audible delivery, alert presentation,
terminal focus, iTerm/tmux/cross-Space behavior or hot-loading an existing session. It also
does not stop, remove or acknowledge the earlier extra Terminal instance and its termination
confirmations — those processes were never proven to belong to the fixture and remain an
explicit manual GUI-cleanup item. `--mode os-effects` is implemented but unverified. Runtime
source, defaults, release 0.3.0 and installed bytes are unchanged.

**Regression coverage.** Seven process-level tests (`test/native-pty-smoke.test.mjs`) drive
only node fixture processes: graceful owned exit, bounded `SIGTERM`/`SIGKILL` escalation
confined to the owned group while a foreign session leader survives, startup failure without
any signal, interrupt cleanup with exit 130, the ownership guard's refusal of pid/group/start
mismatches and of non-leader processes, the inherited-environment and credential-free plan,
and refusal of unsafe roots/packages/effect modes before any spawn. Total local suite: 179/179.

### Future optimization candidates

These are not current release blockers:

- **P2 — missing-settings legacy helper:** `sh install.sh` intentionally refuses when `settings.json` is absent because Pi’s native first-write callback is computed before its lock. If a future fresh-agent workflow must remove an old manual extension too, add a separate `legacy-disable` operation that only backs up/moves exact legacy files and never creates or edits `settings.json`.
- **P2 — native smoke receipt:** after the manual checklist, add a dated acceptance snapshot recording terminal/profile, prompt kinds, focus result and tmux/cross-Space limitations. Do not turn synthetic RPC or virtual transport into native-delivery proof.
- **P2 — real-delivery PTY run:** exercise `--mode os-effects --allow-os-effects` once in a disposable PTY and record whether the alert/sound actually appeared, without claiming acoustic audibility; keep the synthetic default as the automated entry.
- **P2 — GUI residue:** the extra Terminal instance and its unattributed termination confirmations from the 2026-10-20 native successor remain an open manual-cleanup item; no automated entry here claims to close it.
- **P3 — packaged README wording:** the immutable 0.3.0/fork.5 tarballs retain the candidate-version wording present when they were built; maintained main documentation now records their released status. Align that wording before packing the next normal release, without rebuilding or replacing these versions. Flat checksum generation is already documented in the release runbooks; the current versions use the supplementary `DOWNLOAD-SHA256SUMS`.
