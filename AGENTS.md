# Project guidance

This is an original macOS Pi extension, not a community fork. Use an isolated worktree. `main` accepts changes through PRs and is the release branch. Use SemVer with `v<version>` tags; preserve historical releases. Each version needs a GitHub Release, installable package, exact-source manifest and SHA-256 checksums.

Do not trigger real notifications, sounds, model requests or edit machine-wide Pi settings for automated package tests. Run `npm test` for frozen baseline and synthetic behavior checks, plus the pinned Subagents contract checker. Tests virtualize notifications/output/timers/status trees; no production run data. Distinguish those and registration/startup checks from manual macOS delivery acceptance. Do not enable a package and an old manual extension copy simultaneously.

## Documentation map

- `docs/maintenance/2026-10-18-input-reminders-installed.md`: 0.3.0 exact-head review/merge/CI, immutable assets and flat checksum supplement, single-source installed bytes/legacy backup, and unverified live macOS boundaries.

- `openspec/changes/integrate-input-reminders/`: approved single-package input-reminder behavior, design, migration scope and verification tasks.
- `docs/input-reminders.md`: cancellable prompt lifecycle, independent controls, migration/fresh-agent legacy handling, post-delivery review, pending native macOS smoke and optional optimization candidates.

- `docs/maintenance/2026-10-14-audited-bugfix-installed.md`: 0.2.1 red/green defect closure, exact-review-before-merge, main CI, schema1 original Release, installed bytes/native synthetic recheck and activation limits.

- `docs/settled-ui-resume.md`: one pending settle intent, fresh UI-end context, renewed grace and complete current-state guard/invalidation regression.

- `docs/maintenance/2026-10-14-optimization-installed.md`: 0.2.0 exact-source normal merge, CI, fresh-download checksums, installed bytes, combined loader and rollback/activation boundaries.

- `docs/notification-diagnostics.md`: read-only readiness/last-decision command, 0.76.1/0.78.0 pinned compatibility and synthetic regression scope.

- `README.md` / `README.zh-CN.md`: default English and complete Chinese installation/configuration/verification boundaries.
- `docs/releasing.md`: per-version releases, asset verification, permanent installation paths and rollback.
- `docs/notification-completion.md`: completion guards, pinned Subagents0.76.1 contract, synthetic verification, single-source migration and acceptance boundaries.
- `test/characterization.test.mjs` / `test/fixtures/`: frozen pre-migration released/manual source baselines; do not weaken assertions or alter snapshots.
- `test/completion.test.mjs`, `scripts/check-subagents-contract.mjs`, `.github/workflows/ci.yml`: no-side-effect regressions and exact producer-source conformance.
