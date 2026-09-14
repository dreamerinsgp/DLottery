import path from "node:path";
import fs from "node:fs";
import {
  root,
  postgres,
  run,
  child,
  stop,
  waitFor,
  freePort,
} from "./processes.mjs";
export async function startStack({ isolated = false } = {}) {
  const base = path.join(root, ".local", isolated ? "verify" : "demo");
  fs.mkdirSync(base, { recursive: true });
  const ports = isolated
    ? { rpc: 18545, api: 18081, web: 15173, db: 55435 }
    : {
        rpc: 8545,
        api: 8081,
        web: Number(process.env.DEMO_WEB_PORT || 5173),
        db: 55432,
      };
  if (!Number.isInteger(ports.web) || ports.web < 1 || ports.web > 65535)
    throw new Error("DEMO_WEB_PORT must be an integer between 1 and 65535.");
  const children = [];
  const shutdown = async () => {
    for (const proc of [...children].reverse()) await stop(proc);
  };
  try {
    for (const port of [ports.rpc, ports.api, ports.web]) await freePort(port);
    const db = await postgres(path.join(base, "postgres"), ports.db);
    children.push(db.proc);
    const rpc = `http://127.0.0.1:${ports.rpc}`,
      api = `http://127.0.0.1:${ports.api}`,
      web = `http://127.0.0.1:${ports.web}`;
    const env = {
      ...process.env,
      RPC_HTTP_URL: rpc,
      DATABASE_URL: db.url,
      CONFIRMATIONS: "0",
      POLL_INTERVAL_MS: "200",
      PORT: String(ports.api),
      DEPLOYMENT_FILE: path.join(base, "deployment.json"),
      CORS_ORIGINS: `${web},http://localhost:${ports.web}`,
      VITE_RPC_URL: rpc,
      API_PROXY_TARGET: api,
    };
    const hardhat = path.join(root, "node_modules/hardhat/internal/cli/cli.js");
    children.push(
      child(
        process.execPath,
        [
          hardhat,
          "node",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(ports.rpc),
        ],
        path.join(base, "chain.log"),
        { cwd: path.join(root, "contracts"), env },
      ),
    );
    await waitFor(rpc, async () => {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      return (await r.json()).result === "0x7a69";
    });
    run(
      process.execPath,
      [
        hardhat,
        "run",
        "--no-compile",
        "scripts/deploy.cjs",
        "--network",
        "localhost",
      ],
      { cwd: path.join(root, "contracts"), env },
    );
    if (!isolated)
      fs.copyFileSync(
        env.DEPLOYMENT_FILE,
        path.join(root, "shared/deployment.json"),
      );
    const server = path.join(base, "server");
    run("go", ["build", "-o", server, "./cmd/server"], {
      cwd: path.join(root, "backend"),
    });
    const backend = child(server, [], path.join(base, "backend.log"), {
      cwd: path.join(root, "backend"),
      env,
    });
    children.push(backend);
    await waitFor(`${api}/readyz`);
    children.push(
      child(
        process.execPath,
        [
          path.join(root, "node_modules/vite/bin/vite.js"),
          "--host",
          "127.0.0.1",
          "--port",
          String(ports.web),
          "--strictPort",
        ],
        path.join(base, "frontend.log"),
        { cwd: path.join(root, "frontend"), env },
      ),
    );
    await waitFor(web);
    return {
      rpc,
      api,
      web,
      env,
      base,
      shutdown,
      backend,
      restartBackend: async () => {
        await stop(backend);
        const p = child(server, [], path.join(base, "backend.log"), {
          cwd: path.join(root, "backend"),
          env,
        });
        children.push(p);
        await waitFor(`${api}/readyz`);
        return p;
      },
    };
  } catch (error) {
    await shutdown();
    throw error;
  }
}
