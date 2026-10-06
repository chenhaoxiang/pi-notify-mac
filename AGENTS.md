# Project guidance

This is an original macOS Pi extension, not a community fork. Use an isolated worktree. `main` accepts changes through PRs and is the release branch. Use SemVer with `v<version>` tags; preserve historical releases. Each version needs a GitHub Release, installable package, exact-source manifest and SHA-256 checksums.

Do not trigger real notifications, sounds, model requests or edit machine-wide Pi settings for automated package tests. Run `npm test` for frozen baseline and synthetic behavior checks, plus the pinned Subagents contract checker. Tests virtualize notifications/output/timers/status trees; no production run data. Distinguish those and registration/startup checks from manual macOS delivery acceptance. Do not enable a package and an old manual extension copy simultaneously.

## Documentation map

- `README.md` / `README.zh-CN.md`: default English and complete Chinese installation/configuration/verification boundaries.
- `docs/releasing.md`: per-version releases, asset verification, permanent installation paths and rollback.
- `docs/notification-completion.md`: completion guards, pinned Subagents0.76.1 contract, synthetic verification, single-source migration and acceptance boundaries.
- `test/characterization.test.mjs` / `test/fixtures/`: frozen pre-migration released/manual source baselines; do not weaken assertions or alter snapshots.
- `test/completion.test.mjs`, `scripts/check-subagents-contract.mjs`, `.github/workflows/ci.yml`: no-side-effect regressions and exact producer-source conformance.
