const root = import.meta.dir;
process.chdir(root);

const build = Bun.spawn(["bun", "run", "build"], {
  cwd: `${root}/web`,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const buildExitCode = await build.exited;
if (buildExitCode !== 0) {
  console.error(`Frontend build failed with exit code ${buildExitCode}`);
  process.exit(buildExitCode);
}

process.env.NODE_ENV = "production";
await import("./src/index");
