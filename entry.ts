const root = import.meta.dir;

const children = [
  Bun.spawn(["bun", "--watch", "src/index.ts"], {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn(["bun", "run", "dev"], {
    cwd: `${root}/web`,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
];

let stopping = false;
let exitCode = 0;

function stop(signal: NodeJS.Signals, code: number) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT", 130));
process.on("SIGTERM", () => stop("SIGTERM", 143));

for (const child of children) {
  void child.exited.then((code) => {
    if (!stopping) stop("SIGTERM", code || 1);
  });
}

await Promise.allSettled(children.map((child) => child.exited));
process.exit(exitCode);
