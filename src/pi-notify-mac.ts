import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import path from "node:path";

const EXTENSION_NAME = "pi-notify-mac";
const DEFAULT_SOUND = "Glass";

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\\r\\n]/g, " ")}"`;
}

function sendMacNotification(title: string, message: string, sound: string): void {
  const script = `display notification ${appleScriptString(message)} with title ${appleScriptString(title)}${sound ? ` sound name ${appleScriptString(sound)}` : ""}`;

  execFile("osascript", ["-e", script], (error) => {
    if (error) {
      // Notifications must never interfere with the Pi session.
      console.error(`[${EXTENSION_NAME}] macOS notification failed: ${error.message}`);
    }
  });
}

function setTerminalTitle(title: string): void {
  // OSC 0 is supported by Terminal.app, iTerm2, Ghostty, and most xterm-compatible terminals.
  process.stdout.write(`\x1b]0;${title.replace(/[\x00-\x1f\x7f]/g, "")}\x07`);
}

function getProjectName(): string {
  return path.basename(process.cwd()) || "Pi";
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_settled", async () => {
    const project = getProjectName();
    const title = `✓ ${project}`;
    const message = `${project} session 已完成，等待输入`;
    const sound = process.env.PI_NOTIFY_MAC_SOUND ?? DEFAULT_SOUND;

    sendMacNotification("Pi 已完成", message, sound);
    setTerminalTitle(title);
    process.stdout.write("\x07");
  });
}
