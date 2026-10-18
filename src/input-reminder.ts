import type { ExtensionContext, UIPromptStartEvent } from "@earendil-works/pi-coding-agent";
import { command, focusTerminal, resolveTargetTty, scriptString, terminalAppName } from "./terminal-focus.ts";

export const enabled = (name: string): boolean => !["0", "false", "off"].includes(process.env[name]?.trim().toLowerCase() ?? "");
const milliseconds = (name: string, fallback: number): number => {
  const value = process.env[name]?.trim() ?? "";
  const parsed = /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2147483647 ? parsed : fallback;
};
const interactive = (ctx: ExtensionContext): boolean => {
  try { return process.platform === "darwin" && ctx.mode === "tui" && ctx.hasUI; }
  catch { return false; }
};

/** No prompt text or tool arguments are accepted by the delivery layer. */
export function createInputReminder() {
  let lifetime: AbortController | undefined;
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let soundTimer: ReturnType<typeof setTimeout> | undefined;
  let soundLifetime: AbortController | undefined;
  let reason = "idle";
  let promptKind: string | undefined;
  let questionId: string | undefined;
  const stopSound = () => {
    clearTimeout(soundTimer);
    soundTimer = undefined;
    soundLifetime?.abort();
    soundLifetime = undefined;
  };
  const cancel = () => {
    clearTimeout(delayTimer);
    delayTimer = undefined;
    stopSound();
    lifetime?.abort();
    lifetime = undefined;
    promptKind = undefined;
    questionId = undefined;
    reason = "idle";
  };
  const play = (signal: AbortSignal) => {
    const sound = process.env.PI_NOTIFY_MAC_INPUT_SOUND ?? "Hero";
    if (!sound) return;
    const name = /^[a-zA-Z0-9 _-]+$/.test(sound) ? sound : "Hero";
    command("afplay", [`/System/Library/Sounds/${name}.aiff`], signal, error => {
      if (error) console.error("[pi-notify-mac] Input reminder sound unavailable.");
    }, 5000);
  };
  const dispatch = (owner: AbortController, ctx: ExtensionContext) => {
    if (!interactive(ctx)) { cancel(); return; }
    resolveTargetTty(owner.signal, (tty, background) => {
      if (!interactive(ctx)) { cancel(); return; }
      const app = terminalAppName();
      const jump = tty && app ? (background ? "返回父会话" : app === "Terminal" || app === "iTerm" ? "去终端处理" : "打开终端应用") : undefined;
      const source = background ? "提醒来自后台任务；父会话仅供查看任务状态。" : "请返回发起交互的 Pi 终端处理。";
      const buttons = jump ? `buttons {${scriptString(jump)}, "知道了"} default button ${scriptString(jump)} cancel button "知道了"` : 'buttons {"知道了"} default button "知道了" cancel button "知道了"';
      const script = `display alert "Pi 等待输入" message ${scriptString(`Pi 正在等待确认、选择或输入。${source} 此弹窗不会自动回答或授权。`)} ${buttons} as warning`;
      reason = "alert-requested";
      soundLifetime = new AbortController();
      const soundSignal = AbortSignal.any([owner.signal, soundLifetime.signal]);
      play(soundSignal);
      const configuredRepeat = milliseconds("PI_NOTIFY_MAC_INPUT_REPEAT_MS", 30000);
      const repeat = configuredRepeat && configuredRepeat < 1000 ? 30000 : configuredRepeat;
      const remind = () => {
        if (soundSignal.aborted) return;
        if (!interactive(ctx)) { cancel(); return; }
        play(soundSignal);
        soundTimer = setTimeout(remind, repeat);
        soundTimer.unref?.();
      };
      if (repeat && (process.env.PI_NOTIFY_MAC_INPUT_SOUND ?? "Hero")) {
        soundTimer = setTimeout(remind, repeat);
        soundTimer.unref?.();
      }
      if (process.stdout.isTTY) process.stdout.write("\x07");
      command("osascript", ["-e", script], owner.signal, (error, output) => {
        stopSound();
        reason = error ? "dismissed-or-unavailable" : "dismissed";
        // Escape/acknowledge never answers the underlying prompt. Ignore old callbacks after resolution.
        if (!error && tty && jump && output.trim() === `button returned:${jump}` && interactive(ctx)) focusTerminal(tty, owner.signal);
      }, 0);
    });
  };
  return {
    start(event: UIPromptStartEvent, ctx: ExtensionContext, id?: string) {
      if (promptKind) return; // One outer UI interval, even if a host repeats its start event.
      if (!enabled("PI_NOTIFY_MAC_INPUT") || !interactive(ctx)) return;
      if (!["confirm", "select", "input", "editor"].includes(event.kind) && !(event.kind === "custom" && id)) return;
      promptKind = event.kind;
      questionId = id;
      const owner = lifetime = new AbortController();
      reason = "delay";
      delayTimer = setTimeout(() => { delayTimer = undefined; dispatch(owner, ctx); }, milliseconds("PI_NOTIFY_MAC_INPUT_DELAY_MS", 250));
      delayTimer.unref?.();
    },
    end: cancel,
    reset: cancel,
    questionEnd(id: string) { if (questionId === id) cancel(); },
    status: () => enabled("PI_NOTIFY_MAC_INPUT") ? reason : "disabled",
  };
}
