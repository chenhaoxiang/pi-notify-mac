# pi-notify-mac

English | [中文](README.zh-CN.md)

A macOS completion-notification extension for Pi. After a session finishes retries, compaction, and queued work and reaches `agent_settled`, it sends a macOS notification, plays the configured sound, updates the terminal title to `✓ <project>`, and emits a terminal bell. Useful when several Pi sessions run in different terminals.

## Requirements

- macOS.
- Pi with extension/package support (`pi install`).
- `osascript`, included with macOS.

## Install

**Before installing, preserve any existing manual copy and move it outside `~/.pi/agent/extensions/`.** Do not enable both the manual file and the package: that produces duplicate notifications. Renaming a file inside a still-discovered extension directory is not a reliable disable method.

Install the fixed release as a standard Pi package:

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac@v0.1.1
```

Use `@main` only when deliberately following the moving branch. Restart Pi after installation. An active Subagents 0.76.1 runtime may reject mixed-module `/reload`; never force-stop active sessions for this upgrade. Inspect packages with `pi list`; remove this source with `pi remove git:github.com/chenhaoxiang/pi-notify-mac@v0.1.1`. Releases also support checksum-verified extraction to a permanent local package directory.

### Manual installation (alternative)

```bash
mkdir -p ~/.pi/agent/extensions
cp src/pi-notify-mac.ts ~/.pi/agent/extensions/pi-notify-mac.ts
```

Use either manual discovery or package installation, not both.

## Releases and maintenance

Current packaged release: **0.1.1**. This is an original project using ordinary SemVer and `v<version>` tags. `main` is the PR-managed release branch; there is no fictional community upstream or `upstream-main` branch. The historical v0.0.1 release remains available.

[GitHub Releases](https://github.com/chenhaoxiang/pi-notify-mac/releases) include an installable tarball, source manifest, and `SHA256SUMS`. Verify the assets before installing them. GitHub release does not imply npm publication. See [release maintenance](docs/releasing.md).

## Configuration

The default notification sound is `Glass`. Change it for one session:

```bash
PI_NOTIFY_MAC_SOUND=Ping pi
```

Disable the sound:

```bash
PI_NOTIFY_MAC_SOUND='' pi
```

A cancellable 6000ms grace lets asynchronous result delivery wake the parent before notification. Configure it with `PI_NOTIFY_MAC_GRACE_MS=8000 pi`; `0` removes the delay, not the guards. Only non-negative decimal integer milliseconds up to 2147483647 are accepted; invalid values use the default. If a Subagents completion batch window is enlarged, enlarge the grace too. The delay is not an absolute scheduling guarantee.

macOS notification permissions and terminal bell/title preferences may affect what is visible or audible.

## How it works

The extension listens to `agent_settled`, not the earlier `agent_end`. It suppresses notification while messages are pending or same-session top-level/nested Subagents are queued/running; it reads disk status so restoration does not depend on pairing start/completion events. Unknown/corrupt state suppresses rather than guesses. New agents, session changes and shutdown cancel the grace timer, and readiness is checked again at dispatch.

Only TUI mode gets notification/title/bell effects; RPC, JSON and print stay quiet. This is an idle/ready-for-input hint, not proof that every child succeeded or arbitrary external work finished. Notification failures must not interfere with the main session. Subagents support is bounded to the inspected 0.76.1-fork.1 source/schema; see [behavior and migration contract](docs/notification-completion.md).

## Development and verification

Source: `src/pi-notify-mac.ts`. Try it without installation:

```bash
pi -e ./src/pi-notify-mac.ts
```

Run `npm test` with Node 24 (or a version supporting `stripTypeScriptTypes` and VM modules). Tests preserve the released/manual source baselines and virtualize filesystem, timers, process output and notification transport: no real notification, sound, session data or model request.

`node scripts/check-subagents-contract.mjs --repo <subagents-checkout>` verifies five public source hashes at the fixed 0.76.1-fork.1 commit plus state/ownership/layout/batcher contracts. CI runs both checks without installing or executing Subagents. Isolated Pi RPC startup verifies registration/load only; actual notification/sound/title delivery and every running session’s hot-load still need separate manual acceptance.

## License

MIT
