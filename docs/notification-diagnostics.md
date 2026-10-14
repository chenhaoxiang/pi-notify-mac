---
doc_type: guide
project: workspace
status: active
truth_mode: maintained
created: 2026-10-14
verified: 2026-10-14
---

# Notification diagnostics and compatibility

Version 0.2.1 retains the four historical delivery helper bodies and completion guards. `/notify-status` is TUI-only and read-only: it rescans metadata without creating a timer, sending a macOS notification or modifying child state. It distinguishes pending messages, active children, unknown/corrupt child metadata, stale context and eligibility; the last lifecycle decision additionally shows running, grace, shutdown and notification-requested. Eligibility is a guard observation, not proof of task success; requested delivery is not OS delivery acceptance. Any blocking extension UI prompt (including a long-lived custom panel) reports waiting-for-input and pauses an unsent settle reminder. On closing an idle panel, the fresh event context rechecks all guards and starts a renewed grace; new sessions/runs, detected busy state and delivery retire old intent. See [resumption contract](settled-ui-resume.md). This package sends no prompt-specific alarm; other approval-notification extensions, if configured by the host, remain independent and are not assumed present. It never exposes prompt titles, run IDs, raw status JSON or session paths in command output.

The exact public Subagents release commits e40a8bbc218f9bfeb7e0818430b5d361d3416591 (0.76.1-fork.1) and 88d5be272f7ca222a127ccb2a70f093a537ff73b (0.78.0-fork.1) retain the same state, session-file-first ownership, nested directory and 1000ms default batch-window contracts. Separate source-hash fixtures and CI matrix entries preserve old evidence rather than replacing it. Unknown schemas still suppress completion. A custom batch window may require a larger grace delay; compatibility checks do not guarantee arbitrary timing.

Baseline: 72 synthetic tests pass unchanged. The new diagnostic and blocking-UI regressions bring the suite to 98/98 locally; both immutable producer checks pass. Tests virtualize FS, timers, notifications and terminal effects. They do not read real coordination history, invoke a model, prove macOS sound/notification delivery, or hot-reload active sessions. Source/PR/Release/installed verification are separate and must be recorded after actual delivery.
