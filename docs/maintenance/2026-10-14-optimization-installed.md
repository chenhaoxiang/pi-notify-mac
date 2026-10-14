---
doc_type: handoff
project: workspace
status: completed
truth_mode: snapshot
created: 2026-10-14
verified: 2026-10-14
verified_by: manual
---

# 0.2.0 release and installed acceptance

- Feature/source PR [#4](https://github.com/chenhaoxiang/pi-notify-mac/pull/4) merged normally at `bf9d149b9b9b03f3c328ee85f8e0ce74cbd3dcc8`; exact-head independent codex-local/deepseek-flash:high initial/fix review records and hashes are in that PR. Original findings remain preserved; all P0/P1 resolved. AI engineering review is not a second human approval.
- Local merged-source provider-free suite: **83/83 pass**. Exact-main hosted CI [38507864439](https://github.com/chenhaoxiang/pi-notify-mac/actions/runs/38507864439) succeeded. Fixtures use synthetic models/empty auth, not personal credentials/history. No OpenSpec or compaction coverage claim applies to this repository.
- Immutable [Release v0.2.0](https://github.com/chenhaoxiang/pi-notify-mac/releases/tag/v0.2.0) is built from that exact clean source with tarball, release-manifest.json and SHA256SUMS. Fresh download verified both checksum entries and passed current Pi1.2.0-fork.1 isolated package/RPC loading. Package SHA256: `7c3b455601b797db519acac5751d5ea39dadd2c097989c229b792e291b24cdb1`. Earlier scratch packs/logs are not release provenance.
- Installed permanent path: `/Users/robotmac/.pi/agent/packages/pi-notify-mac/0.2.0`. All **8 shipped files** read back byte-for-byte against the downloaded package; the source-bound manifest is retained beside them. Installed-path RPC loading passed without a model prompt.
- Exactly four package source declarations (Notify, Ask, Todo, Compaction) changed together; unrelated settings structurally unchanged, old fixed installations/Git caches preserved, forced restarts **0**. An isolated normal DefaultResourceLoader/fresh AgentSession on installed Pi1.2 loaded four packages with zero load errors/messages/model calls and exposed todo/ask_user_question. This does not exhaust every ambient extension or prove old sessions hot-loaded.
- Owner-only rollback snapshot/receipt: `~/.pi/agent/backups/four-extension-optimization-20261014/`. Rollback not exercised; not a promise that opaque-dependent sessions can safely downgrade. Finish current work before restarting to adopt installed code; never force-unload compaction while relying on an opaque checkpoint.
- No real provider compaction/billing or macOS notification/sound/terminal/IME acceptance performed. Readiness is observation, not business success, authorization or a complete bill. Source, merge, Release, installed bytes and running-session activation are separate facts. This docs-only handoff does not alter or republish immutable assets.

## Supplementary installation provenance

The original published manifest omitted schemaVersion and used a repository ID rather than a URL, so SAW correctly refused its source association while still displaying the installed version. Original tarball, tag, release-manifest.json and SHA256SUMS remain unchanged. Two uniquely named supplementary assets were appended: installation-manifest-v1.json and INSTALLATION-SHA256SUMS. A fresh download verified the package and supplementary manifest; it binds the same source/package hash and the original manifest SHA256. The installed release-manifest.json is that downloaded schema1 projection; release-manifest-original.json preserves original bytes. No runtime source file, settings or SAW rule was changed by this metadata repair; it proves only declared source/tag association, not running-session loading.
