import { spawn } from "node:child_process";

const commands = [
  ["AI backend", "node", ["server/ai-makeover.mjs"]],
  ["Vite app", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"]],
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });
  child.stderr.on("data", (data) => {
    process.stderr.write(`[${name}] ${data}`);
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      stopAll();
    }
  });

  return child;
});

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}
