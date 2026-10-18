---
doc_type: guide
project: workspace
status: active
truth_mode: maintained
created: 2026-10-14
verified: 2026-10-18
verified_by: manual
release: 0.3.0
---

# Notification diagnostics and compatibility

The 0.3.0 candidate retains the four historical delivery helper bodies and completion guards, and adds a separate cancellable input-reminder path. `/notify-status` is TUI-only and read-only: it rescans metadata without creating a timer, sending a macOS notification/alert, playing a sound or modifying child state. It distinguishes pending messages, active children, unknown/corrupt child metadata, stale context and eligibility; the last lifecycle decision additionally shows running, grace, shutdown and notification-requested, plus completion/input switches and input state. Eligibility is a guard observation, not proof of task success; a requested effect is not OS delivery acceptance.

A blocking extension UI prompt reports waiting-for-input and pauses an unsent settle reminder. Closing an idle panel uses the fresh event context to recheck all guards and renew completion grace. New sessions/runs, detected busy state and delivery retire old completion intent. Input reminders separately qualify for confirm/select/input/editor prompts and only for custom questions explicitly identified by the opaque `pi:input-required` producer event; unrelated display overlays remain silent even while a question tool is executing. Resolution and session/run invalidation cancel input subprocesses. See [resumption contract](settled-ui-resume.md) and [input reminder contract](input-reminders.md). No prompt title, question, option, answer, tool argument, run ID, raw status JSON or session path is exposed in command output or the input OS alert.

The exact public Subagents release commits e40a8bbc218f9bfeb7e0818430b5d361d3416591 (0.76.1-fork.1) and 88d5be272f7ca222a127ccb2a70f093a537ff73b (0.78.0-fork.1) retain the same state, session-file-first ownership, nested directory and 1000ms default batch-window contracts. Separate source-hash fixtures and CI matrix entries preserve old evidence rather than replacing it. Unknown schemas still suppress completion. A custom batch window may require a larger grace delay; compatibility checks do not guarantee arbitrary timing or imply verification of all later Subagents versions.

Baseline: the prior 98 runtime cases remain green; the current candidate adds input-reminder and disposable-agent installer regressions for 161/161 local tests. Both immutable producer checks remain separate. Tests virtualize runtime FS, timers, subprocesses, notifications and terminal effects; installer settings are disposable fixtures under `tmp/`. They do not read real coordination history, invoke a model, prove macOS alert/sound/Terminal focus delivery, or hot-reload active sessions. Source/PR/Release/installed verification are separate and must be recorded after actual delivery.
