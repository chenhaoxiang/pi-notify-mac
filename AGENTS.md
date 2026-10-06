# Project guidance

This is an original macOS Pi extension, not a community fork. Use an isolated worktree. `main` accepts changes through PRs and is the release branch. Use SemVer with `v<version>` tags; preserve historical releases. Each version needs a GitHub Release, installable package, exact-source manifest and SHA-256 checksums.

Do not trigger real notifications, sounds, model requests or edit machine-wide Pi settings for automated package tests. This repository currently has no automated functional suite: distinguish registration/startup checks from manual macOS delivery acceptance. Do not enable a package and an old manual extension copy simultaneously.

## Documentation map

- `README.md` / `README.zh-CN.md`: default English and complete Chinese installation/configuration/verification boundaries.
- `docs/releasing.md`: per-version releases, asset verification, permanent installation paths and rollback.
