// Owned fixture process: becomes ready, then exits only on the quit keystroke.
// Used by test/native-pty-smoke.test.mjs; never a Pi or notification process.
process.stdout.write("READY\n");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", chunk => {
  if (!chunk.toString().includes("quit")) return;
  process.stdout.write("BYE\n");
  process.exit(0);
});
