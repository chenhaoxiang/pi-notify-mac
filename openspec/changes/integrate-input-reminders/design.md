# Design

## Boundary and authorization

P1 feature integration, explicitly authorized by the owner on 2026-10-18. This independent repository is not registered in Meta's auto-merge ratings; do not invent S2 or claim an ai-gate PASS. Its owner PR, exact-head independent review, CI, immutable release and installation rules remain applicable.

## Runtime

Keep the current completion entry and frozen helper bodies. Add input-reminder and terminal-focus modules behind the same manifest entry. Completion and input enable switches are independent. Input alerts default on, with a short cancellable 250ms delay, Hero sound and 30s repetition while the alert is open. Empty input sound disables sound; zero repetition disables repeats.

Consume ui_prompt_start/end for standard confirm/select/input/editor prompts. Generic custom UI stays silent. The maintained question producer emits an optional opaque `pi:input-required` event with version/source/opaque call id/phase only around its actual custom factory; Notify matches start/end identity and never imports that package. `tool_call` or tool execution alone cannot trigger an alert. Pi 1.3.0-fork.1 coalesces nested prompts into one outer interval; this package follows that interval, while the producer event supplies ownership for the custom question.

Each interval owns an AbortController and unref'ed timers. Resolution, shutdown, session replacement and new agent runs invalidate old callbacks and kill owned display/sound/focus subprocesses. Dismissing the reminder stops sound without answering the TUI. Focus uses the existing tty/PID Terminal AppleEvent implementation, bounded asynchronous commands and explicit failure reporting; never activate a different Terminal instance as pretend success. Only TUI sessions produce effects; non-macOS is silent. Do not expose prompt titles, questions, options, answers or tool arguments in OS alerts or diagnostics.

## Migration

The local installer migrates an existing settings file only. Fresh installation with no `settings.json` is delegated to official Pi installation because Pi's native first-write callback precedes its lock. For migration, the installer installs the complete package, preserves existing settings/legacy files outside discovery, replaces only this package's declarations and exact legacy extension paths, and verifies immutable destination bytes. It stages package bytes before acquiring the same `settings.json.lock` mkdir lease used by the inspected Pi FileSettingsStorage/proper-lockfile implementation, keeps the short settings critical section under the lease deadline, and refuses an already-held/replaced lock rather than reclaiming it. Cooperative existing-settings writers cannot interleave; out-of-protocol direct editors must be quiescent. Errors before configuration commit restore moved files; unrelated settings remain unchanged. Old released versions remain rollback assets, not enabled runtime sources. No deprecated shim or second package remains active. Machine migration is separate from isolated automated tests and never forces running sessions to reload.

## Verification

Retain all frozen fixtures/assertions. Add virtual process/timer regressions for prompt lifetime, cancellation, dismissal, modes, duplicate/custom filtering, sound and focus errors, plus fixture-only installer tests. Run the existing pinned Subagents checks, packed-content verification and no-prompt isolated native Pi loader. Real macOS presentation/focus and already-running session hot-loading are not implied by synthetic checks.
