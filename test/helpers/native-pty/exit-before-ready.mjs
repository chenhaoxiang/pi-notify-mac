// Owned fixture process: never becomes ready and exits nonzero, i.e. a startup
// failure the runner must report without signalling anything. Never a Pi process.
process.stdout.write("STARTUP FAILURE\n");
process.exit(3);
