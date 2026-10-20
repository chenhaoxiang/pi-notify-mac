// Owned fixture process: ready, then dies from SIGTERM on the quit keystroke.
// Used to prove a signal exit is never reported as graceful/success.
process.stdout.write("READY\n");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", () => process.kill(process.pid, "SIGTERM"));
