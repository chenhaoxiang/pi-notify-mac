# pi-notify-mac

English | [中文](README.zh-CN.md)

A macOS completion-notification extension for Pi. After a session finishes retries, compaction, and queued work and reaches `agent_settled`, it sends a macOS notification, plays the configured sound, updates the terminal title to `✓ <project>`, and emits a terminal bell. Useful when several Pi sessions run in different terminals.

## Requirements

- macOS.
- Pi with extension/package support (`pi install`).
- `osascript`, included with macOS.

## Install

Install the fixed release as a standard Pi package:

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac@v0.1.0
```

Use `@main` only when you deliberately want the moving maintained branch. Restart Pi after installation, or `/reload` in an existing session. Inspect packages with `pi list`. Remove this source with `pi remove git:github.com/chenhaoxiang/pi-notify-mac@v0.1.0`.

If you previously copied the extension into `~/.pi/agent/extensions/pi-notify-mac.ts`, avoid also enabling the package: two enabled copies produce duplicate notifications. Preserve the old copy and disable one source before switching.

### Manual installation (alternative)

```bash
mkdir -p ~/.pi/agent/extensions
cp src/pi-notify-mac.ts ~/.pi/agent/extensions/pi-notify-mac.ts
```

Use either manual discovery or package installation, not both.

## Releases and maintenance

Current packaged release: **0.1.0**. This is an original project using ordinary SemVer and `v<version>` tags. `main` is the PR-managed release branch; there is no fictional community upstream or `upstream-main` branch. The historical v0.0.1 release remains available.

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

macOS notification permissions and terminal bell/title preferences may affect what is visible or audible.

## How it works

The extension listens to `agent_settled`, not the earlier `agent_end`. Only after Pi completes automatic retries, context compaction and queued follow-ups does it notify. Notification failures are logged and must not interfere with the main session.

## Development and verification

Source: `src/pi-notify-mac.ts`. Try it without installation:

```bash
pi -e ./src/pi-notify-mac.ts
```

This repository currently has no automated functional test suite. Release checks cover event registration, package contents and isolated Pi startup without sending model prompts or creating macOS notifications. Actual notification/sound/title delivery requires a manual macOS permission and terminal check; package loading alone does not prove it.

## License

MIT
