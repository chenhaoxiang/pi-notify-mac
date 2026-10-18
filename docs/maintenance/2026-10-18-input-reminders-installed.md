---
doc_type: report
project: workspace
status: completed
truth_mode: snapshot
created: 2026-10-18
verified: 2026-10-18
verified_by: manual
release: 0.3.0
---

# 0.3.0 single-package input-reminder delivery

## Source and review

- [Feature PR #8](https://github.com/chenhaoxiang/pi-notify-mac/pull/8) merged normally to main at `9a0101dd64692651ad9520695dd305db884b17f2`. Reviewed head: `aa422625fcc31eb4a3ce8be906e67c8922249185`.
- Independent fresh/read-only `codex-local/kimi-k3:high` review initially found custom-UI ownership and settings concurrency defects plus two test-harness gaps. All blocker/major findings were fixed; the final exact-head verdict was **OK with notes**. Full original/follow-up reports were [posted before merge](https://github.com/chenhaoxiang/pi-notify-mac/pull/8#issuecomment-6250925794); final report SHA256 `5daa580f6f2c213bc8278ccad576a07fef1e51eb55c19f4a8e62f25eb33fb69b`.
- Exact-head and exact merged-source suites passed **161/161** with zero skips; the original 98 runtime cases and four frozen helper bodies remain intact. Source-bound packed input behavior passed **46/46**. Both pinned Subagents contracts passed, as did native existing-settings locking and native missing-settings refusal proofs. [Merged-source CI 39135082642](https://github.com/chenhaoxiang/pi-notify-mac/actions/runs/39135082642) succeeded. These are engineering evidence, not second-human approval or macOS delivery acceptance.

## Release and download verification

Immutable [Release v0.3.0](https://github.com/chenhaoxiang/pi-notify-mac/releases/tag/v0.3.0) targets the exact merge above. No npm publication occurred. Source manifest schema1 and canonical repository URL are present.

| Asset | SHA256 |
|---|---|
| `pi-notify-mac-0.3.0.tgz` | `2836671c9db6a87140af31fcba64ce3547d2ab4c5b911fec554570c478c31b36` |
| original `release-manifest.json` | `f65f597a1f1dd94a6c8a734baf3b3599dc69f15e9ec2dd2d21c3bb97ca0c0178` |

The original `SHA256SUMS` contains build-relative `tmp/release/` prefixes. It and all original assets remain unchanged. A separately named `DOWNLOAD-SHA256SUMS` was appended, binding the tarball, original manifest and original checksum file with flat asset names; fresh public downloads passed all three entries. Download all four files and run `shasum -a 256 -c DOWNLOAD-SHA256SUMS` in that directory. This is a usability supplement, not replacement provenance or a rebuilt package.

## Installation and legacy boundary

The verified downloaded tarball was extracted and its `install.sh` used to migrate the existing personal installation. All **14 shipped files** in the permanent `packages/pi-notify-mac/0.3.0` directory match the fresh download byte-for-byte. Installed-source isolated Pi RPC registration passed with zero model prompts or notification transports.

The old automatic `extensions/approval-notify.ts` file was moved outside discovery into an owner-only backup; there is no compatibility shim or second approval package. Preserved source SHA256 is `90d9bfdadd36696e36a49ef4206e5a2430e33dd993689d46f3078f7e0f04b84f`. Previous release directories and private original settings remain rollback assets, not selected runtime dependencies. Exactly one Notify source and one maintained question source are selected; no legacy completion/approval manual file remains in automatic discovery. Non-package settings match the pre-migration backup; only intended package declarations were changed. Private settings/backup contents are not published.

The active-reference inventory found no other project importing or handling the old file. One September asset inventory remains dated history; it was not rewritten. Precise custom-question ownership uses an optional opaque event from the maintained question package, not a runtime import of another package or old path. Installed producer/consumer modules were also exercised together with virtual transport: matching start/end, no private prompt payload, alert abort and no remaining timers passed.

No live task was stopped or force-reloaded. Existing sessions may still hold the old loaded module until voluntarily restarted. Real macOS warning presentation, sound, Terminal/iTerm focus, tmux/cross-Space behavior and old-session hot-load are **not verified** by these tests. No model request or real notification/sound was intentionally generated for automated verification. Local migration deliberately rejects missing settings; fresh setup uses official Pi installation, and out-of-protocol settings editors must be quiescent.

## Current entry points

- [Input reminder and migration contract](../input-reminders.md)
- [Release maintenance](../releasing.md)
- [Diagnostic/compatibility contract](../notification-diagnostics.md)

This report closes source/release/installation evidence only. It does not claim universal CLI override discovery, all-machine migration, native macOS acceptance or every running session using the new code.
