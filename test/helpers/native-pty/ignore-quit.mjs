// Owned fixture process: ignores stdin, SIGHUP and SIGTERM, so the runner must
// reach its bounded SIGKILL escalation. Never a Pi or notification process.
// Optional argv[2] is a readiness marker written once the signal handlers are in place.
import fs from "node:fs";

process.on("SIGHUP", () => {});
process.on("SIGTERM", () => {});
process.stdin.on("error", () => {});
process.stdout.on("error", () => {});
process.stdout.write("READY\n");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", () => {});
if (process.argv[2]) fs.writeFileSync(process.argv[2], `${process.pid}\n`);
setInterval(() => {}, 1000);
