# pi-notify-mac

English | [中文](README.zh-CN.md)

One macOS notification package for Pi: completion notifications and waiting-for-input reminders. After a session settles, it sends a macOS notification, plays Glass, updates the terminal title and rings the terminal. When a real TUI prompt needs a person, it shows a cancellable warning alert, plays Hero, repeats every 30 seconds and can focus the originating Terminal/iTerm tab. It never answers or approves the prompt.

## Requirements

- macOS and Pi with extension/package support; input lifecycle verified against Pi 1.3.0-fork.1.
- System `osascript` and `afplay`; no additional runtime dependency.

## Install and migrate

Candidate version: **0.3.0**. Publication is complete only after PR/CI, immutable Release and checksum verification; historical releases remain unchanged.

For a fresh installation, use the fixed Release and let Pi manage the first settings write:

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac@v0.3.0
```

**Existing manual installations must migrate first.** From a trusted checksum-verified extracted package, run:

```bash
sh install.sh
```

This migrates an existing `settings.json`: it installs the complete package under the personal agent directory, backs up settings plus old `approval-notify.ts`/`pi-notify-mac.ts` files outside discovery, removes their exact declarations and selects a single package source. It refuses a missing settings file so Pi's native first-write protocol remains authoritative. Optional `PI_AGENT_DIR` or `PI_CODING_AGENT_DIR` selects an isolated agent directory. Unrelated settings and existing package resource filters are preserved; conflicting installed bytes/filters stop migration.

**Do not copy only the entry file**: it now imports sibling modules. Do not enable the package and an old manual extension together. Renaming an extension inside the discovery directory is not sufficient. See [migration, recovery and verification boundaries](docs/input-reminders.md).

Use `@main` only to deliberately track a moving branch. Use `pi list` to inspect selected sources and `pi remove <source>` to remove the exact installed source. Restart voluntarily after installation; changing disk files does not hot-load existing sessions. An active Subagents runtime may reject mixed-module `/reload`; never force-stop tasks for this upgrade.

## Configuration

Completion and input reminders are independently enabled by default:

| Variable | Default | Effect |
|---|---|---|
| `PI_NOTIFY_MAC_COMPLETION` | enabled | `0`, `false` or `off` disables completion effects only |
| `PI_NOTIFY_MAC_SOUND` | `Glass` | Completion sound; empty disables sound, not title/bell |
| `PI_NOTIFY_MAC_GRACE_MS` | `6000` | Cancellable completion grace; zero removes delay, not guards |
| `PI_NOTIFY_MAC_INPUT` | enabled | Same disable values, input effects only |
| `PI_NOTIFY_MAC_INPUT_SOUND` | `Hero` | System sound name; empty keeps the alert but disables sound |
| `PI_NOTIFY_MAC_INPUT_DELAY_MS` | `250` | Cancellable delay before an input alert |
| `PI_NOTIFY_MAC_INPUT_REPEAT_MS` | `30000` | Sound repeat while the alert is open; zero disables repeats |

```bash
PI_NOTIFY_MAC_INPUT=0 pi
PI_NOTIFY_MAC_INPUT_SOUND='' pi
PI_NOTIFY_MAC_COMPLETION=0 pi
```

Disable values trim whitespace and ignore case. Milliseconds accept decimal integers from 0 to 2147483647; invalid values use defaults. Nonzero input repeats below 1000ms use 30000ms to avoid process storms. A larger Subagents completion batch window may require a larger completion grace; no fixed delay guarantees arbitrary scheduling. macOS permissions and terminal preferences affect actual presentation.

## How it works

Completion listens to `agent_settled`, not `agent_end`. It suppresses effects for pending messages or same-session queued/running top-level/nested children, determines ownership from disk/session-file identity and treats unknown/corrupt state conservatively. Dispatch rechecks guards. This is an idle hint, not proof of every child succeeding or arbitrary external work ending. Existing four frozen delivery helpers and assertions are retained.

Input reminders follow actual `ui_prompt_start/end` intervals. Confirm/select/input/editor qualify; custom questions qualify only through the opaque `pi:input-required` lifecycle from `rpiv-ask-user-question` 0.1.4-fork.5 or a compatible producer. Generic custom UI, including unrelated overlays during a running question, and bare tool calls stay silent. Older question packages still work but do not emit this optional precise reminder signal. One reminder per outer interval; resolution, new runs, session replacement and shutdown cancel owned timers and abort subprocesses. Dismissing the alert never answers the TUI. Alerts omit prompt titles, question text, options, answers and tool arguments. Terminal PID/tty lookup is asynchronous and bounded; no different Terminal instance is activated as pretend success. Other terminals offer explicitly app-only focus. See [input behavior and migration](docs/input-reminders.md).

Effects are macOS TUI-only; RPC/JSON/print and no-UI input contexts stay quiet. Any blocking UI suppresses completion; closing it rechecks a fresh context and can renew grace for an unsent settle reminder. See [resumption contract](docs/settled-ui-resume.md).

## Notification readiness

`/notify-status` is read-only: current completion guards, last lifecycle decision, both enable switches and input state. It sends no system alert, sound, bell or model request. Eligible does not mean success; an effect request is not macOS delivery proof. Pinned Subagents contracts cover 0.76.1-fork.1 and 0.78.0-fork.1, not every future release. See [diagnostics and compatibility](docs/notification-diagnostics.md).

## Development and verification

Try the complete source tree without installation:

```bash
pi -e ./src/pi-notify-mac.ts
npm test
node scripts/check-subagents-contract.mjs --repo <subagents-checkout>
node scripts/check-subagents-contract.mjs --repo <subagents-checkout> --fixture subagents-0.78.0-contract.json
```

Tests require Node 24 or another version supporting TypeScript erasure and VM modules. Frozen released/manual fixtures and assertions remain unchanged. Runtime tests virtualize FS, subprocesses, timers and terminal output; installer tests use disposable directories under `tmp/`. No real model, notification, sound or private run state is used. CI verifies both fixed public producer contracts without executing Subagents. Isolated Pi RPC verifies package registration/loading only, not actual macOS delivery or hot-loading live sessions.

## Releases and maintenance

This is an original project, using ordinary SemVer and `v<version>` tags. `main` is PR-managed; no fictional community upstream is claimed. [GitHub Releases](https://github.com/chenhaoxiang/pi-notify-mac/releases) carry the installable tarball, exact-source manifest and SHA256SUMS. Verify fresh downloads before installation. A GitHub Release is not npm publication. See [release maintenance](docs/releasing.md) and the historical [completion/migration contract](docs/notification-completion.md).

## License

MIT
