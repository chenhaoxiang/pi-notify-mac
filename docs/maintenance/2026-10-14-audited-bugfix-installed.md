---
doc_type: handoff
project: workspace
status: completed
truth_mode: snapshot
created: 2026-10-14
verified: 2026-10-14
verified_by: manual
---

# 0.2.1 audited bugfix delivery

- Parent-only audit reproduced the concurrency/rejected-status/UI-interruption defect. The new regressions first failed against the old source; existing assertions and historical evidence remain unchanged. Feature PR [#6](https://github.com/chenhaoxiang/pi-notify-mac/pull/6) normally merged at `09eac082e60d16f0596c0daf3739f41b9277c99e` after parent native/source checks and the exact-head independent codex-local/deepseek-flash:high final review receipt was read and posted. Review is AI engineering evidence, not a second human approval.
- **98/98 local synthetic tests pass**. Exact-source main CI [38524920511](https://github.com/chenhaoxiang/pi-notify-mac/actions/runs/38524920511) succeeded. Both original/current Subagents source pins also passed for Notify. Source/local/native-synthetic/CI and actual platform delivery remain distinct.
- Immutable [v0.2.1](https://github.com/chenhaoxiang/pi-notify-mac/releases/tag/v0.2.1) attaches exactly the tarball, schema1 original release-manifest.json and SHA256SUMS. Fresh download verified both entries and current Pi1.2 isolated RPC registration. Package SHA256 `1362ba150463173d8379064b822d60a022ee091dff1e5f4d236f67c75f38e37a`; original manifest SHA256 `dcc14aff4de9a850f1f6fb801302ab057788837a33d4cdfcd2bf6f8e6a9c5e0f`. Unlike the previous release, no metadata projection/supplement is needed.
- Permanent install `/Users/robotmac/.pi/agent/packages/pi-notify-mac/0.2.1`: **9 shipped files** match the freshly downloaded package byte-for-byte. Installed RPC passes. This batch replaces exactly three package sources; unrelated settings and pi-better-compaction0.7.4-fork.2 are unchanged, old versions retained, forced restarts0.
- Parent reran actual installed source: real Pi1.2 extension-tool wrapper/default-parallel Agent scheduler + native custom-UI lifecycle with four synthetic responses returned both question answers in order and propagated Todo isError while retaining completed state. Notify installed source resumed the interrupted settle exactly once under virtual timers/FS/OS transport; zero real notifications. Four-package normal loader/fresh AgentSession additionally reports zero load errors/messages/model calls. These do not prove live terminal/IME, all ambient plugins, real model/billing or macOS delivery.
- Owner-only backup/rollback receipt `~/.pi/agent/backups/three-extension-bugfix-20261014/`; rollback not exercised. New sessions adopt disk changes; busy or opaque-dependent sessions were not forced to reload. This docs-only handoff changes no shipped code or immutable asset.
