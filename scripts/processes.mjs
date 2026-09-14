import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw result.error || new Error(`${command} exited with ${result.status}`);
}
export async function waitFor(url, predicate = (r) => r.ok, timeout = 45000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (await predicate(r)) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
export async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop the existing service or choose another port.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
export function child(command, args, log, options = {}) {
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, "a");
  const proc = spawn(command, args, {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", fd, fd],
    env: process.env,
    ...options,
  });
  fs.closeSync(fd);
  proc.on("error", (e) => console.error(`${command}: ${e.message}`));
  return proc;
}
export async function stop(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    if (process.platform !== "win32") process.kill(-proc.pid, "SIGTERM");
    else proc.kill("SIGTERM");
  } catch {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 7000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (proc.exitCode === null && proc.signalCode === null) {
    try {
      if (process.platform !== "win32") process.kill(-proc.pid, "SIGKILL");
      else proc.kill("SIGKILL");
    } catch {}
  }
}
export async function postgres(directory, port) {
  const native = path.join(
    root,
    "node_modules/@embedded-postgres/linux-x64/native",
  );
  if (!fs.existsSync(native))
    throw new Error(
      "The local PostgreSQL helper needs Linux x64. Use Docker Compose or provide TEST_DATABASE_URL for backend tests on other platforms.",
    );
  await freePort(port);
  fs.mkdirSync(directory, { recursive: true });
  const data = path.join(directory, "data"),
    socket = path.join(directory, "socket");
  fs.mkdirSync(socket, { recursive: true });
  const env = {
    ...process.env,
    LD_LIBRARY_PATH:
      path.join(native, "lib") +
      (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : ""),
  };
  // Also support installations made with npm --ignore-scripts.
  run(process.execPath, ["scripts/hydrate-symlinks.js"], {
    cwd: path.dirname(native),
    stdio: "ignore",
  });
  if (!fs.existsSync(path.join(data, "PG_VERSION")))
    run(
      path.join(native, "bin/initdb"),
      [
        "-D",
        data,
        "-U",
        "dlottery",
        "--auth=trust",
        "--no-locale",
        "-E",
        "UTF8",
      ],
      { env, stdio: "ignore" },
    );
  const proc = child(
    path.join(native, "bin/postgres"),
    ["-D", data, "-p", String(port), "-h", "127.0.0.1", "-k", socket],
    path.join(directory, "postgres.log"),
    { env },
  );
  try {
    await new Promise((resolve, reject) => {
      const until = Date.now() + 10000;
      const check = () => {
        const s = net.createConnection({ host: "127.0.0.1", port });
        s.once("connect", () => {
          s.destroy();
          resolve();
        });
        s.once("error", () => {
          s.destroy();
          if (Date.now() > until)
            reject(new Error("PostgreSQL did not start; see its log"));
          else setTimeout(check, 100);
        });
      };
      check();
    });
  } catch (e) {
    await stop(proc);
    throw e;
  }
  return {
    proc,
    url: `postgres://dlottery@127.0.0.1:${port}/postgres?sslmode=disable`,
  };
}
