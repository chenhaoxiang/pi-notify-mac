"""Controlled, owned-PTY smoke for the real Pi TUI.

This entry point exists because the earlier native trial relied on macOS GUI
automation and an extra Terminal.app instance, which left window/process
cleanup that could not be attributed to the fixture. This runner never opens a
terminal application: it allocates its own pseudo-terminal, starts Pi (or a
fixture command) as a session leader inside it, drives only that PTY's stdin,
and stops only the process group it created.

Isolation contract (all enforced below, all recorded in the receipt):
  * fresh HOME, TMPDIR, agent directory, session directory, cwd and subagent
    temp root under one fixture root it creates;
  * an explicit environment dict - nothing is inherited, no credential-like
    key is present, no model provider is reachable (offline + unreachable
    fixture provider + fixture extension that refuses provider requests);
  * `osascript`/`afplay`/`open`/`terminal-notifier` resolve to stubs that
    record the invocation and fail, so the default run cannot present a macOS
    alert, play a sound or open an application;
  * default mode also sets PI_NOTIFY_MAC_COMPLETION/PI_NOTIFY_MAC_INPUT to 0,
    so no OS reminder is even requested. Real delivery needs the separate
    `--allow-os-effects` flag and is never part of `npm test`.

Ownership contract: the child is a session leader (pid == pgid == sid). Every
signal is preceded by re-reading the pid's pgid/sid/start time and comparing
them with the recorded identity, and is sent to that process group only. The
pid cannot be recycled before we reap it, so a stale pid can never be
signalled. A failed verification records `refused` and no signal is sent.
"""

import argparse
import fcntl
import hashlib
import json
import os
import pty
import re
import select
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import termios
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PI_FIXTURE_EXTENSION = Path(__file__).resolve().parent / "native-pty-pi-fixture.ts"
EFFECT_COMMANDS = ("osascript", "afplay", "open", "terminal-notifier")
MARKER = ".owned-native-pty-fixture"
MAX_OUTPUT = 1 << 21
CREDENTIAL_HINT = re.compile(r"key|token|secret|passw|credential|auth|proxy", re.IGNORECASE)

STUB_TEMPLATE = '#!/bin/sh\nprintf \'%s\\n\' "$0" >> {journal}\nexit 1\n'


def iso_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def process_start_identity(pid):
    """Corroborating start time for a pid; None when unavailable (fail closed)."""
    try:
        result = subprocess.run(
            ["ps", "-o", "lstart=", "-p", str(pid)],
            capture_output=True, text=True, timeout=5, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    value = result.stdout.strip()
    return value or None


def process_identity(pid):
    try:
        pgid = os.getpgid(pid)
        sid = os.getsid(pid)
    except ProcessLookupError:
        return None
    except OSError:
        return {"pid": pid, "pgid": None, "sid": None, "start": None, "error": "not-visible"}
    return {"pid": pid, "pgid": pgid, "sid": sid, "start": process_start_identity(pid)}


def ownership_check(pid, expect=None, require_session_leader=True):
    """(ok, reason, current) - the only gate in front of every signal."""
    if not pid or pid <= 0:
        return False, "invalid-pid", None
    current = process_identity(pid)
    if current is None:
        return False, "not-running", None
    if current.get("error"):
        return False, current["error"], current
    expect = expect or {}
    for field, reason in (("pgid", "group-mismatch"), ("sid", "session-mismatch"), ("start", "start-mismatch")):
        if expect.get(field) is not None and current.get(field) != expect[field]:
            return False, reason, current
    if require_session_leader and not (current["pgid"] == pid and current["sid"] == pid):
        return False, "not-session-leader", current
    return True, "ok", current


class Receipt:
    def __init__(self, profile, mode, out_dir):
        self.path = Path(out_dir) / "receipt.json"
        self.data = {
            "version": 1,
            "profile": profile,
            "mode": mode,
            "startedAt": iso_now(),
            "finishedAt": None,
            "steps": [],
            "signals": [],
            "checks": [],
            "limitations": [],
        }

    def step(self, action, result="ok", **extra):
        row = {"at": iso_now(), "action": action, "result": result}
        row.update({key: value for key, value in extra.items() if value is not None})
        self.data["steps"].append(row)
        return row

    def check(self, name, ok, detail=None):
        self.data["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
        return bool(ok)

    def finish(self):
        self.data["finishedAt"] = iso_now()
        checks = self.data["checks"]
        self.data["success"] = bool(checks) and all(item["ok"] for item in checks)
        self.data["failedChecks"] = [item["name"] for item in checks if not item["ok"]]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(self.data, indent=2, ensure_ascii=False) + "\n")
        temporary.chmod(0o600)
        os.replace(temporary, self.path)
        return self.data


class OwnedChild:
    """The only process this runner is allowed to stop."""

    def __init__(self, pid, receipt):
        self.pid = pid
        self.receipt = receipt
        self.identity = process_identity(pid)
        self.reaped = False
        self.exit = None
        self.record = {
            "pid": pid,
            "pgid": (self.identity or {}).get("pgid"),
            "sid": (self.identity or {}).get("sid"),
            "start": (self.identity or {}).get("start"),
        }
        receipt.data["child"] = dict(self.record)

    @property
    def session_leader(self):
        return self.record["pgid"] == self.pid == self.record["sid"]

    def poll(self):
        if self.reaped:
            return True
        try:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
        except ChildProcessError:
            self.reaped = True
            self.exit = {"status": "unknown-reaped"}
            self.receipt.data["child"]["exit"] = self.exit
            return True
        if pid == 0:
            return False
        self.reaped = True
        if os.WIFSIGNALED(status):
            self.exit = {"status": "signalled", "signal": signal.Signals(os.WTERMSIG(status)).name}
        else:
            self.exit = {"status": "exited", "code": os.WEXITSTATUS(status)}
        self.receipt.data["child"]["exit"] = self.exit
        return True

    def send(self, signame):
        number = getattr(signal, signame)
        if self.reaped:
            ok, reason, current = False, "already-reaped", None
        else:
            ok, reason, current = ownership_check(self.pid, self.record, require_session_leader=True)
        row = {"signal": signame, "pgid": self.record["pgid"], "verified": current, "result": "sent" if ok else "refused"}
        if not ok:
            row["reason"] = reason
        self.receipt.data["signals"].append(row)
        self.receipt.step("signal-" + signame, "sent" if ok else "refused", reason=reason)
        if not ok:
            return False
        try:
            os.killpg(self.record["pgid"], number)
        except ProcessLookupError:
            row["result"] = "gone"
        except OSError as error:
            row["result"] = "failed"
            row["error"] = error.strerror or str(error)
        return row["result"] == "sent"


class PTYSession:
    def __init__(self, pid, fd, receipt):
        self.owned = OwnedChild(pid, receipt)
        self.fd = fd
        self.receipt = receipt
        self.output = b""
        self.total = 0
        self.eof = False
        self.closed = False

    def drain(self):
        if self.closed:
            return
        while True:
            try:
                chunk = os.read(self.fd, 65536)
            except (BlockingIOError, InterruptedError):
                return
            except OSError:
                self.eof = True
                return
            if not chunk:
                self.eof = True
                return
            self.total += len(chunk)
            if len(self.output) < MAX_OUTPUT:
                self.output += chunk[: MAX_OUTPUT - len(self.output)]

    def wait_for(self, timeout, predicate):
        """'predicate' | 'exited' | 'timeout'."""
        end = time.monotonic() + max(0.0, timeout)
        while True:
            self.drain()
            if predicate():
                return "predicate"
            if self.owned.poll():
                self.drain()
                return "exited"
            remaining = end - time.monotonic()
            if remaining <= 0:
                self.drain()
                return "predicate" if predicate() else "timeout"
            if self.eof or self.closed:
                time.sleep(min(0.02, remaining))
            else:
                select.select([self.fd], [], [], min(0.05, remaining))

    def wait_exit(self, timeout):
        return self.wait_for(timeout, lambda: False) in ("exited", "predicate") and self.owned.reaped

    def send(self, text, action):
        payload = text.encode()
        try:
            os.write(self.fd, payload)
        except OSError as error:
            self.receipt.step(action, "failed", error=error.strerror or str(error))
            return False
        self.receipt.step(action, "sent", bytes=len(payload))
        return True

    def close_master(self):
        if self.closed:
            return
        self.closed = True
        try:
            os.close(self.fd)
        except OSError:
            pass
        self.receipt.step("close-master", "closed")

    def saw(self, text):
        return text.encode() in self.output


def journal_rows(path):
    try:
        text = Path(path).read_text()
    except (FileNotFoundError, NotADirectoryError, PermissionError):
        return []
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def install_effect_stubs(root):
    bin_dir = Path(root) / "bin"
    bin_dir.mkdir()
    journal = Path(root) / "effects-denied.jsonl"
    script = STUB_TEMPLATE.format(journal=shlex.quote(str(journal)))
    for name in EFFECT_COMMANDS:
        target = bin_dir / name
        target.write_text(script)
        target.chmod(0o700)
    return bin_dir


def seed_agent_dir(root):
    agent = Path(root) / "agent"
    agent.mkdir()
    (Path(root) / "home").mkdir()
    (Path(root) / "tmp").mkdir()
    (Path(root) / "work").mkdir()
    (agent / "settings.json").write_text(json.dumps({
        "defaultProvider": "fixture",
        "defaultModel": "fixture",
        "enableAnalytics": False,
        "enableInstallTelemetry": False,
        "cacheWarming": "off",
    }))
    (agent / "models.json").write_text(json.dumps({
        "providers": {
            "fixture": {
                "baseUrl": "http://127.0.0.1:9",
                "api": "openai-completions",
                "apiKey": "synthetic-not-a-credential",
                "models": [{
                    "id": "fixture",
                    "name": "fixture",
                    "reasoning": False,
                    "input": ["text"],
                    "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
                    "contextWindow": 32768,
                    "maxTokens": 4096,
                }],
            }
        }
    }))


def child_env(root, node_dir, bin_dir, label, mode):
    """Built from nothing: no os.environ entry is copied into the child."""
    env = {
        "PATH": os.pathsep.join([str(bin_dir), str(node_dir), "/usr/bin", "/bin", "/usr/sbin", "/sbin"]),
        "HOME": str(Path(root) / "home"),
        "TMPDIR": str(Path(root) / "tmp"),
        "LANG": "en_US.UTF-8",
        "TERM": "xterm-256color",
        "PI_OFFLINE": "1",
        "PI_CODING_AGENT_DIR": str(Path(root) / "agent"),
        "PI_CODING_AGENT_SESSION_DIR": str(Path(root) / "sessions"),
        "PI_SUBAGENTS_TEMP_ROOT": str(Path(root) / "synthetic-runs"),
        "PI_NATIVE_TEST_ROOT": str(root),
        "PI_NATIVE_TEST_LABEL": label,
    }
    if mode == "synthetic":
        env["PI_NOTIFY_MAC_COMPLETION"] = "0"
        env["PI_NOTIFY_MAC_INPUT"] = "0"
    return env


def pi_arguments(entry, fixture, label):
    return [
        "--offline",
        "--no-session",
        "--no-tools",
        "--no-extensions",
        "--no-mcp",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-approve",
        "--name", "OWNED-NATIVE-PTY-" + label,
        "--extension", str(entry),
        "--extension", str(fixture),
        "/notify-native-test",
    ]


def spawn_pty(command, argv, env, cwd, rows, cols):
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.chdir(cwd)
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            os.execvpe(command, [command] + list(argv), env)
        except BaseException:
            os._exit(127)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    os.set_blocking(fd, False)
    return pid, fd


def escalate(session, receipt, args):
    """Bounded, owned cleanup in a fixed order; each step re-verifies identity."""
    if session.owned.poll():
        receipt.step("stop", "already-exited")
        return
    session.close_master()
    if session.wait_exit(2):
        receipt.step("stop", "closed-master")
        return
    if session.owned.send("SIGTERM") and session.wait_exit(args.term_timeout):
        receipt.step("stop", "sigterm")
        return
    if session.owned.send("SIGKILL"):
        session.wait_exit(args.kill_timeout)
        receipt.step("stop", "sigkill")
        return
    receipt.step("stop", "refused", reason="ownership-unproven")


def drive_pi(session, root, journal, receipt, args):
    label = args.label
    start = session.wait_for(args.ready_timeout, lambda: any(row.get("phase") == "session-start" for row in journal_rows(journal)))
    receipt.check("fixture-session-start", start == "predicate", start)

    opened = session.wait_for(args.ready_timeout, lambda: any(row.get("phase") == "question-open" for row in journal_rows(journal)))
    receipt.check("native-select-opened", opened == "predicate", opened)

    if opened == "predicate":
        session.send("\r", "answer-enter")
        resolved = session.wait_for(args.ready_timeout, lambda: any(row.get("phase") == "question-resolved" for row in journal_rows(journal)))
        receipt.check("native-select-resolved", resolved == "predicate", resolved)

    session.send("\x04", "quit-ctrl-d")
    if not session.wait_exit(args.quit_timeout):
        session.send("/notify-native-end\r", "quit-fixture-command")
    if session.wait_exit(args.quit_timeout):
        receipt.step("exit", "graceful")
        return
    escalate(session, receipt, args)
    receipt.step("exit", "escalated")


def drive_fixture(session, receipt, args):
    ready = session.wait_for(args.ready_timeout, lambda: session.saw(args.ready_text))
    receipt.check("fixture-ready", ready == "predicate", ready)
    if ready != "predicate":
        return
    session.send(args.quit_keys, "quit-keys")
    if session.wait_exit(args.quit_timeout):
        receipt.step("exit", "graceful")
        return
    escalate(session, receipt, args)
    receipt.step("exit", "escalated")


def evaluate(receipt, args, session, root, journal, exit_row):
    expect_graceful = args.expect == "graceful"
    receipt.check("pty-allocated", session.fd >= 0)
    receipt.check("child-is-session-leader", session.owned.session_leader, session.owned.record)
    receipt.check("child-reaped", session.owned.reaped, session.owned.exit)
    if expect_graceful:
        receipt.check("graceful-exit", (exit_row or {}).get("result") == "graceful", session.owned.exit)
    receipt.check("owned-signals-only", all(row["pgid"] == session.owned.pid for row in receipt.data["signals"]),
                  receipt.data["signals"])
    denied = root / "effects-denied.jsonl"
    if args.mode == "synthetic":
        receipt.check("no-os-effect-transport", not denied.exists(), denied.name)
    if args.profile == "pi":
        rows = journal_rows(journal)
        receipt.check("tui-output-observed", session.total > 200, session.total)
        receipt.check("no-provider-request", not any(row.get("phase") == "UNEXPECTED-PROVIDER-REQUEST" for row in rows))
        exit_rows = [row for row in rows if row.get("phase") == "fixture-exit"]
        receipt.check("no-network-calls", bool(exit_rows) and all(row.get("networkCalls") == 0 for row in exit_rows),
                      [row.get("networkCalls") for row in exit_rows])
        answered = [row.get("test_response") for row in rows if row.get("phase") == "question-resolved"]
        receipt.check("synthetic-answer-recorded", bool(answered) and all(str(value).startswith("PASS_") or value == "cancelled" for value in answered), answered)
    else:
        receipt.check("fixture-output-observed", session.total > 0, session.total)


def validate_paths(args):
    out = Path(args.out).expanduser().resolve()
    forbidden = {Path("/"), Path("/tmp"), Path("/var"), Path("/Users"), Path("/private/tmp"), Path.home()}
    if out in forbidden or str(out) == "":
        raise SystemExit(f"refusing unsafe --out {out}")
    package = Path(args.package).expanduser().resolve()
    entry = package / "src" / "pi-notify-mac.ts"
    if not entry.is_file():
        raise SystemExit(f"--package has no src/pi-notify-mac.ts: {package}")
    fixture = Path(args.fixture_extension).expanduser().resolve()
    if args.profile == "pi" and not fixture.is_file():
        raise SystemExit(f"--fixture-extension missing: {fixture}")
    return out, package, entry, fixture


def make_fixture_root(out, args):
    stamp = time.strftime("%Y%m%d%H%M%S", time.gmtime()) + f"-{os.getpid()}"
    root = out / f"run-{args.label}-{stamp}"
    root.mkdir(parents=True)
    (root / MARKER).write_text(str(out) + "\n")
    return root


def main(argv=None):
    parser = argparse.ArgumentParser(description="Owned-PTY smoke for the Pi TUI; synthetic and OS-effect-free by default.")
    parser.add_argument("--package", default=str(REPO_ROOT), help="package directory containing src/pi-notify-mac.ts")
    parser.add_argument("--out", default=str(REPO_ROOT / "tmp" / "native-pty-smoke"), help="receipt/directory root")
    parser.add_argument("--profile", choices=("pi", "fixture"), default="pi")
    parser.add_argument("--mode", choices=("synthetic", "os-effects"), default="synthetic",
                        help="synthetic refuses every OS effect; os-effects is the separate opt-in delivery run")
    parser.add_argument("--label", default="P")
    parser.add_argument("--command", help="fixture profile: executable to run instead of pi")
    parser.add_argument("--command-arg", action="append", default=[], help="fixture profile: extra argv")
    parser.add_argument("--fixture-extension", default=str(PI_FIXTURE_EXTENSION))
    parser.add_argument("--ready-text", default="READY")
    parser.add_argument("--quit-keys", default="\u0004")
    parser.add_argument("--rows", type=int, default=40)
    parser.add_argument("--cols", type=int, default=120)
    parser.add_argument("--ready-timeout", type=float, default=90)
    parser.add_argument("--quit-timeout", type=float, default=15)
    parser.add_argument("--term-timeout", type=float, default=5)
    parser.add_argument("--kill-timeout", type=float, default=5)
    parser.add_argument("--expect", choices=("graceful", "any-exit"), default="graceful")
    parser.add_argument("--allow-os-effects", action="store_true",
                        help="opt in to real macOS delivery; never used by npm test and not run by default")
    parser.add_argument("--dry-run", action="store_true", help="print the isolation/env plan without spawning")
    parser.add_argument("--remove-fixture", action="store_true", help="delete the owned fixture root after the run")
    parser.add_argument("--verify-ownership", metavar="PID", type=int,
                        help="print the identity of PID and exit 0 only when it is an owned session leader")
    parser.add_argument("--expect-pgid", type=int)
    parser.add_argument("--expect-sid", type=int)
    parser.add_argument("--expect-start")
    args = parser.parse_args(argv)

    if args.verify_ownership is not None:
        expect = {"pgid": args.expect_pgid, "sid": args.expect_sid, "start": args.expect_start}
        ok, reason, current = ownership_check(args.verify_ownership, expect, require_session_leader=True)
        print(json.dumps({"ok": ok, "reason": reason, "identity": current}, indent=2))
        return 0 if ok else 3

    if args.allow_os_effects:
        if args.mode != "os-effects":
            raise SystemExit("--allow-os-effects requires --mode os-effects")
    elif args.mode != "synthetic":
        raise SystemExit("--mode os-effects requires the explicit --allow-os-effects flag")

    out, package, entry, fixture = validate_paths(args)
    if args.profile == "pi":
        pi = args.command or shutil.which("pi")
        if not pi:
            raise SystemExit("Pi CLI unavailable")
        executable = str(Path(pi).resolve())
        command_argv = pi_arguments(entry, fixture, args.label)
    else:
        if not args.command:
            raise SystemExit("--command is required for --profile fixture")
        executable = str(Path(args.command).resolve())
        command_argv = list(args.command_arg)

    receipt = Receipt(args.profile, args.mode, out)
    receipt.data["command"] = {"executable": None, "argv": [], "sourceSha256": {}}
    session = None
    fixture_root = None
    emitted = False

    try:
        fixture_root = make_fixture_root(out, args)
        where = {
            "root": str(fixture_root),
            "home": str(fixture_root / "home"),
            "agentDir": str(fixture_root / "agent"),
            "cwd": str(fixture_root / "work"),
            "tmpdir": str(fixture_root / "tmp"),
        }
        receipt.data["isolation"] = where
        receipt.data["package"] = str(package)
        for name in ("pi-notify-mac.ts", "input-reminder.ts", "terminal-focus.ts"):
            receipt.data["command"]["sourceSha256"][name] = sha256(package / "src" / name)

        node = shutil.which("node") or "/usr/bin/node"
        node_dir = Path(node).resolve().parent
        seed_agent_dir(fixture_root)
        bin_dir = install_effect_stubs(fixture_root) if args.mode == "synthetic" else Path("/usr/bin")
        if args.mode != "synthetic":
            receipt.data["limitations"].append("OS-effect mode: real macOS alert/sound delivery is possible; this run is not part of npm test")

        env = child_env(fixture_root, node_dir, bin_dir, args.label, args.mode)
        receipt.data["env"] = {"keys": sorted(env), "values": env, "inheritedKeys": []}
        credential_keys = sorted(key for key in env if CREDENTIAL_HINT.search(key))
        receipt.data["credentialLikeKeys"] = credential_keys
        receipt.data["command"].update({"executable": executable, "argv": command_argv})
        receipt.data["piVersion"] = None
        if args.profile == "pi":
            try:
                version = subprocess.run([executable, "--version"], capture_output=True, text=True,
                                         timeout=20, env=env, cwd=where["cwd"], check=False)
                receipt.data["piVersion"] = (version.stdout or version.stderr).strip().splitlines()[0] if (version.stdout or version.stderr).strip() else None
            except (OSError, subprocess.SubprocessError, IndexError):
                receipt.data["piVersion"] = None

        if args.dry_run:
            receipt.step("dry-run", "planned")
            receipt.check("isolated-home", Path(where["home"]).is_dir())
            receipt.check("isolated-agent-dir", Path(where["agentDir"]).is_dir())
            receipt.check("no-inherited-env", receipt.data["env"]["inheritedKeys"] == [])
            receipt.check("no-credential-env", credential_keys == [], credential_keys)
            emitted = True
            plan = receipt.finish()
            print(json.dumps(plan, indent=2, ensure_ascii=False))
            return 0

        pid, fd = spawn_pty(executable, command_argv, env, where["cwd"], args.rows, args.cols)
        session = PTYSession(pid, fd, receipt)
        receipt.data["pty"] = {"rows": args.rows, "cols": args.cols, "allocated": True}
        receipt.check("isolated-home", Path(where["home"]).is_dir())
        receipt.check("isolated-agent-dir", Path(where["agentDir"]).is_dir())
        receipt.check("no-inherited-env", receipt.data["env"]["inheritedKeys"] == [])
        receipt.check("no-credential-env", credential_keys == [], credential_keys)

        journal = fixture_root / f"lifecycle-{args.label}.jsonl"
        if args.profile == "pi":
            drive_pi(session, fixture_root, journal, receipt, args)
        else:
            drive_fixture(session, receipt, args)

        if not session.owned.reaped:
            escalate(session, receipt, args)
        exit_row = next((row for row in receipt.data["steps"] if row["action"] == "exit"), None)
        evaluate(receipt, args, session, fixture_root, journal, exit_row)
        transcript = fixture_root / "pty-output.bin"
        transcript.write_bytes(session.output)
        transcript.chmod(0o600)
        receipt.data["pty"]["transcript"] = transcript.name
        session.close_master()
        code = 0
    except KeyboardInterrupt:
        receipt.data["interrupted"] = True
        receipt.check("interrupted", False, "SIGINT/SIGTERM received; bounded owned cleanup attempted")
        if session is not None:
            try:
                escalate(session, receipt, args)
                session.close_master()
            except Exception as error:  # cleanup must still produce a receipt
                receipt.step("cleanup-error", "failed", error=str(error))
        code = 130
    except SystemExit:
        raise
    except Exception as error:
        receipt.step("runner-error", "failed", error=str(error))
        receipt.check("runner-ran", False, str(error))
        if session is not None:
            try:
                escalate(session, receipt, args)
                session.close_master()
            except Exception as nested:
                receipt.step("cleanup-error", "failed", error=str(nested))
        code = 3
    finally:
        if session is not None:
            if not session.owned.reaped:
                try:
                    escalate(session, receipt, args)
                except Exception as error:
                    receipt.step("cleanup-error", "failed", error=str(error))
            session.close_master()
        if not emitted:
            plan = receipt.finish()
            print(json.dumps(plan, indent=2, ensure_ascii=False))
        if fixture_root is not None and args.remove_fixture:
            remove_owned_fixture(fixture_root, out)

    if code == 0 and not receipt.data.get("success"):
        code = 3
    return code


def remove_owned_fixture(root, out):
    """Delete only a directory this runner created under the requested --out."""
    root = Path(root).resolve()
    marker = root / MARKER
    if not marker.is_file() or marker.read_text().strip() != str(Path(out).resolve()):
        return False
    if root.parent != Path(out).resolve():
        return False
    shutil.rmtree(root)
    return True


def _interrupt(signum, _frame):
    raise KeyboardInterrupt(f"signal {signum}")


if __name__ == "__main__":
    for name in ("SIGINT", "SIGTERM", "SIGHUP"):
        signal.signal(getattr(signal, name), _interrupt)
    sys.exit(main())
