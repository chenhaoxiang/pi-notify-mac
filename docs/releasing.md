---
doc_type: runbook
project: workspace
status: active
truth_mode: maintained
created: 2026-10-06
verified: 2026-10-06
verified_by: manual
---

# Release maintenance

Applies to the independent original project chenhaoxiang/pi-notify-mac.

## Branches and versions

`main` is the maintained default/release branch and accepts changes through pull requests. Use ordinary SemVer and `v<version>` tags. No community base, fork suffix, or community mirror is claimed. Retain all historical branches and previous releases. Never reuse a published tag or replace its assets.

## Publish every version

1. Fetch origin/main and create an isolated worktree from its exact latest commit. Preserve unrelated dirty work.
2. Update package version, lockfile version metadata when changed, and both README files. English README is the default; the Chinese document links back.
3. Run `npm test` without altering frozen baseline fixtures/assertions. Run the pinned producer contract checker against the public Subagents checkout. Inspect package contents and smoke-load in an isolated agent directory without prompts or macOS notifications; real sound/notification/title checks remain manual.
4. Review the exact diff and merge the PR normally; verify remote main contains the validated head.
5. Build the package at that exact main SHA using `npm pack --ignore-scripts --pack-destination tmp/release`. Extract the tarball and load it through isolated Pi RPC with a synthetic loopback model and no prompts. Include both README files and this runbook.
6. Generate `release-manifest.json` with repository, version, exact source commit, tarball filename and SHA-256; community fields are null. Generate `SHA256SUMS` for the tarball and manifest.
7. Create the public GitHub Release `v<version>` targeting that exact SHA with the package, provenance and checksums attached. No npm publication is implied.
8. Download the published assets afresh, check `shasum -a 256 -c SHA256SUMS`, and repeat isolated RPC loading. Release notes record PR, validation and remaining limitations.

## Installation and rollback

Before enabling the pinned package, preserve an existing manual file and the pre-switch package configuration in an owner-only backup; verify its bytes, then move the manual file outside extension discovery. Use the pinned GitHub command in README, or download all three Release assets, verify checksums, extract to a permanent user-owned directory and run `pi install /absolute/path/to/package`. Verify exactly one selected source and that unrelated settings are unchanged. If package installation fails, preserve the error and restore the previous single source without enabling both copies. Keep previous source/version for rollback; do not overwrite old tags/assets.\n\nRestart Pi after installing; changing disk files does not hot-load existing sessions, and an active Subagents0.76.1 runtime may reject mixed-module `/reload`. Do not force-stop live tasks. See [notification/migration contract](notification-completion.md) for the imported local guards, tested schema and actual acceptance record.

## 中文摘要

本项目使用自己的 SemVer，不冒充社区 fork。`main` 是经过 PR 整合的维护主线。每次发布都固定 tag、来源提交和安装制品，附 SHA-256 校验，下载回读后再次做不调用真实模型的隔离加载验证。英文说明为默认入口，中文说明同步维护。
