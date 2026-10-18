# Proposal

## Why

Waiting-for-input reminders currently live in an unversioned personal approval-notify.ts file, separately from completion notifications. The owner approved one pi-notify-mac package and migration of all active consumers, without stale alerts or duplicate loading.

## What Changes

- Add independently configurable input reminders for blocking TUI prompts, including ask_user_question custom UI.
- Preserve completion guards and notification delivery behavior; reminders do not grant permission or answer prompts.
- Cancel alerts, repeating sound and terminal-focus work when the prompt ends or the session changes.
- Replace the single-file installer with package installation plus reversible migration of legacy files and declarations.
- Retain historical evidence and rollback copies outside extension discovery, not compatibility shims.

## Capabilities

### New Capabilities
- `input-reminders`: cancellable macOS attention reminders and single-source package migration.

### Modified Capabilities
None; the existing completion contract and frozen baselines remain authoritative.

## Impact

One runtime package and entry point, its installer, tests and owner documentation. No runtime dependency on approval-notify.ts, rpiv-ask-user-question, approval policy or another project. Active workspace/global extension/package/skill scans found only the personal legacy file; one September inventory snapshot remains historical. No production credentials or model requests are needed.
