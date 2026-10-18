import { execFile } from "node:child_process";

const FOCUS_TIMEOUT_MS = 2000;
export const scriptString = (value: string): string => JSON.stringify(value.replace(/[\x00-\x1f\x7f]/g, " "));

/** Every subprocess belongs to a prompt lifetime; late callbacks cannot focus another session. */
export function command(
  executable: string, args: string[], signal: AbortSignal,
  done: (error: Error | null, stdout: string) => void = () => {}, timeout = FOCUS_TIMEOUT_MS,
): void {
  if (signal.aborted) return;
  try {
    execFile(executable, args, { signal, ...(timeout ? { timeout } : {}), encoding: "utf8" }, (error, stdout) => {
      if (!signal.aborted) done(error, String(stdout));
    });
  } catch {
    if (!signal.aborted) done(new Error("macOS reminder process unavailable"), "");
  }
}

export function terminalAppName(): string | undefined {
  return ({ Apple_Terminal: "Terminal", "iTerm.app": "iTerm", WezTerm: "WezTerm", ghostty: "ghostty", vscode: "Visual Studio Code" } as Record<string, string>)[process.env.TERM_PROGRAM ?? ""];
}

export function resolveTargetTty(signal: AbortSignal, done: (tty?: string, background?: boolean) => void): void {
  const query = (pid: number, next: (tty?: string) => void) => command("ps", ["-p", String(pid), "-o", "tty="], signal, (error, output) => {
    const tty = output.trim();
    next(!error && /^ttys?\d+$/.test(tty) ? `/dev/${tty}` : undefined);
  }, 1000);
  query(process.pid, tty => {
    if (tty) done(tty, false);
    else query(process.ppid, parent => done(parent, true));
  });
}

/** Preserve PID-addressed AppleEvents: application-name activation can select the wrong Terminal instance. */
export function terminalFocusScript(tty: string): string {
  return `
ObjC.import("AppKit");
function code(s) {
  return ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) |
          (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
}
function type(s) { return $.NSAppleEventDescriptor.descriptorWithTypeCode(code(s)); }
function object(want, form, selector, from) {
  var record = $.NSAppleEventDescriptor.recordDescriptor;
  record.setDescriptorForKeyword(type(want), code("want"));
  record.setDescriptorForKeyword($.NSAppleEventDescriptor.descriptorWithEnumCode(code(form)), code("form"));
  record.setDescriptorForKeyword(selector, code("seld"));
  record.setDescriptorForKeyword(from || $.NSAppleEventDescriptor.nullDescriptor, code("from"));
  return record.coerceToDescriptorType(code("obj "));
}
function property(name, from) { return object("prop", "prop", type(name), from); }
function all(want, from) {
  var ordinal = $.NSAppleEventDescriptor.descriptorWithDescriptorTypeData(
    code("abso"), $.NSAppleEventDescriptor.descriptorWithEnumCode(code("all ")).data);
  return object(want, "indx", ordinal, from);
}
function run() {
  var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("com.apple.Terminal");
  var targetTty = ${scriptString(tty)};
  var lastError = "";
  for (var a = 0; a < apps.count; a++) {
    var app = apps.objectAtIndex(a);
    var address = $.NSAppleEventDescriptor.descriptorWithDescriptorTypeData(
      code("kpid"), $.NSAppleEventDescriptor.descriptorWithInt32(app.processIdentifier).data);
    function send(id, direct, value, eventClass) {
      var event = $.NSAppleEventDescriptor.appleEventWithEventClassEventIDTargetDescriptorReturnIDTransactionID(
        code(eventClass || "core"), code(id), address, -1, 0);
      if (direct) event.setParamDescriptorForKeyword(direct, code("----"));
      if (value) event.setParamDescriptorForKeyword(value, code("data"));
      var error = Ref();
      var reply = event.sendEventWithOptionsTimeoutError(3, 0.5, error);
      if (!reply) throw Error(ObjC.unwrap(error[0].description));
      var number = reply.paramDescriptorForKeyword(code("errn"));
      if (number && number.int32Value) throw Error("AppleEvent error " + number.int32Value);
      return reply.paramDescriptorForKeyword(code("----"));
    }
    try {
      var windows = send("getd", all("cwin"));
      for (var w = 1; w <= windows.numberOfItems; w++) {
        var window = windows.descriptorAtIndex(w);
        var tabs = send("getd", all("ttab", window));
        for (var t = 1; t <= tabs.numberOfItems; t++) {
          var tab = tabs.descriptorAtIndex(t);
          if (ObjC.unwrap(send("getd", property("ttty", tab)).stringValue) !== targetTty) continue;
          send("setd", property("tbsl", tab), $.NSAppleEventDescriptor.descriptorWithBoolean(true));
          send("setd", property("pmnd", window), $.NSAppleEventDescriptor.descriptorWithBoolean(false));
          send("setd", property("pidx", window), $.NSAppleEventDescriptor.descriptorWithInt32(1));
          send("actv", null, null, "misc");
          if (!send("getd", property("tbsl", tab)).booleanValue ||
              send("getd", property("pidx", window)).int32Value !== 1 || !app.active) {
            throw Error("Terminal selection verification failed");
          }
          return "ok";
        }
      }
    } catch (error) { lastError = String(error); }
  }
  return lastError ? "failed" : "notfound";
}
run();`;
}

export function focusTerminal(tty: string, signal: AbortSignal): void {
  const app = terminalAppName();
  if (!app) return;
  const failure = () => console.error("[pi-notify-mac] Terminal jump failed; return to the originating Pi window manually. No prompt was answered.");
  if (app === "Terminal") {
    command("osascript", ["-l", "JavaScript", "-e", terminalFocusScript(tty)], signal, (error, output) => {
      if (error || output.trim() !== "ok") failure();
    });
  } else if (app === "iTerm") {
    const script = `tell application "iTerm"
repeat with w in windows
repeat with tb in tabs of w
repeat with s in sessions of tb
if tty of s is ${scriptString(tty)} then
select s
select tb
select w
activate
return "ok"
end if
end repeat
end repeat
end repeat
end tell
return "notfound"`;
    command("osascript", ["-e", script], signal, (error, output) => {
      if (error || output.trim() !== "ok") failure();
    });
  } else {
    // Other terminals have no verified per-tab contract; activation is explicitly app-only.
    command("osascript", ["-e", `tell application ${scriptString(app)} to activate`], signal, error => {
      if (error) failure();
      else console.error("[pi-notify-mac] Activated terminal app only; select the originating Pi tab manually.");
    });
  }
}
