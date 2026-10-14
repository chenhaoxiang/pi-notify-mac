---
doc_type: bug
project: workspace
status: active
truth_mode: maintained
created: 2026-10-14
verified: 2026-10-14
verified_by: manual
---

# Settled notification after blocking UI

The 0.2.0 implementation cancelled completion grace at ui_prompt_start but forgot the interrupted settle when ui_prompt_end arrived, so an idle panel could suppress the sole completion reminder permanently. Version0.2.1 retains one boolean pending settle intent, not a stale ExtensionContext. Closing a blocking UI uses the current end-event context to recheck mode, isIdle, pending messages and same-session/nested child metadata, then starts a new cancelable grace. Dispatch rechecks the same guards. Session start/shutdown, new agent_start, detected busy/compacting state and successful notification request retire intent; a manual compact may therefore suppress the older reminder without a new settle event, deliberately avoiding stale completion alerts; an already requested notification cannot be duplicated by later panels. UI ending without any prior settle never invents completion. Prompt-specific permission notifications remain out of scope.

The appended regression file first failed against0.2.0 on both interrupted grace and settle-while-panel-open. Existing83 assertions stay unchanged. Tests now cover resumption, one-shot delivery, no prior settle, session/run invalidation, pending/active/corrupt/busy/stale/non-TUI refusals, late busy state and fresh end-event context;98/98 synthetic cases pass. Read-only readiness includes the same idle guard and reports running rather than eligible when busy. Native Pi1.2 clears active-run state before emitting agent_settled, and its public context provides isIdle with stale-context rejection. No real notification/sound/model requests or private run-state fixtures are used. Actual macOS delivery and live-session activation are separate acceptance.
