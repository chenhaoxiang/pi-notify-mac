// Owned fixture for scripts/native-pty-smoke.py. Only loaded by that runner.
// It records lifecycle phases, opens one synthetic question through the real
// ctx.ui API, and refuses every provider request and network call. It performs
// no business action and never answers anything on the user's behalf.
import fs from "node:fs";

const root = process.env.PI_NATIVE_TEST_ROOT;
if (!root || !process.env.PI_NATIVE_TEST_LABEL) throw new Error("owned PTY fixture requires PI_NATIVE_TEST_ROOT and PI_NATIVE_TEST_LABEL");
const label = process.env.PI_NATIVE_TEST_LABEL;
const journal = `${root}/lifecycle-${label}.jsonl`;
let networkCalls = 0;

const log = (row: Record<string, unknown>) => fs.appendFileSync(journal, `${JSON.stringify({ at: new Date().toISOString(), fixture: label, ...row })}\n`, { mode: 0o600 });

globalThis.fetch = async () => {
  networkCalls++;
  log({ phase: "network-blocked" });
  throw new Error("native-pty-fixture-network-disabled");
};
process.on("exit", code => log({ phase: "fixture-exit", code, networkCalls }));

export default function (pi: any) {
  let questions = 0;
  pi.on("session_start", (_event: unknown, ctx: any) => {
    log({ phase: "session-start", mode: ctx.mode, hasUI: ctx.hasUI });
    ctx.ui.setStatus("native-pty-fixture", `OWNED NATIVE PTY TEST ${label} - NO MODEL, NO OS EFFECTS`);
  });
  pi.on("ui_prompt_start", (event: any) => log({ phase: "ui-start", kind: event.kind }));
  pi.on("ui_prompt_end", () => log({ phase: "ui-end" }));
  pi.on("before_provider_request", () => {
    log({ phase: "UNEXPECTED-PROVIDER-REQUEST" });
    throw new Error("no model request is permitted in the owned PTY smoke");
  });
  pi.on("session_shutdown", () => log({ phase: "session-shutdown" }));
  pi.registerCommand("notify-native-test", {
    description: "Owned synthetic question only; no model, tool or business action",
    handler: async (args: string, ctx: any) => {
      const n = ++questions;
      const kind = args.trim() || "select";
      log({ phase: "question-open", n, kind });
      let answer;
      if (kind === "confirm") answer = await ctx.ui.confirm(`OWNED TEST ${label}.${n}`, "Synthetic test only. No real operation is approved.");
      else if (kind === "input") answer = await ctx.ui.input(`OWNED TEST ${label}.${n}`, "Type TEST");
      else if (kind === "editor") answer = await ctx.ui.editor(`OWNED TEST ${label}.${n}`, "TEST");
      else answer = await ctx.ui.select(`OWNED TEST ${label}.${n} - select PASS_${label}`, [`PASS_${label}`, `CANCEL_${label}`]);
      log({
        phase: "question-resolved",
        n,
        kind,
        test_response: answer === undefined ? "cancelled" : answer === true ? "true" : answer === false ? "false" : String(answer).slice(0, 32),
      });
      ctx.ui.notify(`OWNED TEST ${label}.${n}: response recorded; no model or business action.`, "info");
    },
  });
  pi.registerCommand("notify-native-end", {
    description: "End this disposable fixture session only",
    handler: async (_args: string, ctx: any) => {
      log({ phase: "owned-end-request" });
      ctx.shutdown();
    },
  });
}
