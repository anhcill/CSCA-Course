import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const service = process.argv[2];
const isBackend = service === "backend";

if (!isBackend && service !== "frontend") {
  console.error("Usage: node scripts/dev-console.mjs <backend|frontend>");
  process.exit(1);
}

const command = isBackend
  ? {
      bin: path.join(root, "node_modules", "nodemon", "bin", "nodemon.js"),
      args: ["--quiet", "--watch", "backend", "--watch", "database", "--ignore", "frontend", "--ignore", "frontend/node_modules", "./backend/server.js"],
      cwd: root,
      port: 7000,
      name: "BACKEND API",
      subtitle: "Express  ·  PostgreSQL  ·  auto reload",
    }
  : {
      bin: path.join(root, "frontend", "node_modules", "vite", "bin", "vite.js"),
      args: ["--host", "127.0.0.1"],
      cwd: path.join(root, "frontend"),
      port: 5173,
      name: "FRONTEND",
      subtitle: "React  ·  Vite  ·  hot reload",
    };

if (!existsSync(command.bin)) {
  console.error(`Missing dependency: ${command.bin}`);
  console.error("Run npm install in the project and frontend directories first.");
  process.exit(1);
}

const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ansi = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  blue: "\x1b[94m",
  green: "\x1b[92m",
  amber: "\x1b[93m",
  red: "\x1b[91m",
};
const paint = (value, style) => enabled ? `${ansi[style]}${value}${ansi.reset}` : value;
const timestamp = () => new Date().toLocaleTimeString("vi-VN", { hour12: false });
const stripAnsi = (value) => value
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
  .trimEnd();

const log = (level, message) => {
  const tone = level === "ERROR" ? "red" : level === "WARN" ? "amber" : level === "READY" || level === "OK" ? "green" : "cyan";
  process.stdout.write(`${paint(timestamp(), "dim")}  ${paint(level.padEnd(5), tone)}  ${message}\n`);
};

if (enabled) process.stdout.write(`\x1b]0;CSCA • ${command.name}\x07`);
process.stdout.write("\n");
process.stdout.write(`${paint("  CSCA COURSE", "bold")}  ${paint("/ LOCAL DEVELOPMENT", "blue")}\n`);
process.stdout.write(`${paint("  " + "─".repeat(54), "dim")}\n`);
process.stdout.write(`  ${paint("●", "green")} ${paint(command.name, "bold")}  ${paint(command.subtitle, "dim")}\n`);
process.stdout.write(`  ${paint("↗", "cyan")} ${paint(`http://127.0.0.1:${command.port}`, "cyan")}\n`);
process.stdout.write(`  ${paint("Ctrl+C to stop  ·  live logs below", "dim")}\n`);
process.stdout.write(`${paint("  " + "─".repeat(54), "dim")}\n\n`);

let child;
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  if (child && !child.killed) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

child = spawn(process.execPath, [command.bin, ...command.args], {
  cwd: command.cwd,
  env: { ...process.env, NODE_ENV: "development", FORCE_COLOR: "0" },
  stdio: ["inherit", "pipe", "pipe"],
});

let stderrLevel = "WARN";
const outputLine = (line, source) => {
  const message = stripAnsi(line).trim();
  if (!message) return;

  if (isBackend && message.startsWith("[PostgreSQL] Connected successfully")) {
    log("OK", "PostgreSQL connected");
    return;
  }
  if (isBackend && message.startsWith("Server run at ")) {
    log("READY", `API listening at ${message.slice("Server run at ".length)}`);
    return;
  }
  if (!isBackend && /VITE v\S+\s+ready in/.test(message)) {
    log("READY", message);
    return;
  }
  if (!isBackend && message.startsWith("➜ Local:")) {
    log("OK", message.replace(/^➜ Local:\s*/, "Open "));
    return;
  }
  if (!isBackend && message.startsWith("➜ press h + enter")) return;

  const level = /\b(error|failed|exception|fatal|eaddrinuse)\b/i.test(message)
    ? "ERROR"
    : /\b(warn(?:ing)?|deprecated|outdated|old)\b/i.test(message)
      ? "WARN"
      : source === "stderr" ? stderrLevel : "INFO";
  if (source === "stderr") stderrLevel = level;
  log(level, message);
};

for (const [stream, source] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
  readline.createInterface({ input: stream, crlfDelay: Infinity }).on("line", (line) => outputLine(line, source));
}

child.on("error", (error) => {
  log("ERROR", error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  log(stopping ? "INFO" : "ERROR", stopping ? "Server stopped." : `Server exited (${signal || code}).`);
  process.exitCode = stopping ? 0 : (code || 1);
});
