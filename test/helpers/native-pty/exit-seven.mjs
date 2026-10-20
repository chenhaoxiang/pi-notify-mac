// Owned fixture process: ready, then exits with code 7 on the quit keystroke.
// Used to prove a non-zero exit is never reported as graceful/success.
process.stdout.write("READY\n");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", () => process.exit(7));
