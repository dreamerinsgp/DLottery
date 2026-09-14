// Stage only application inputs; deployment keys and test-wallet keys are excluded.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "dlottery-railway-"));
const exclude = new Set([
  "node_modules",
  "dist",
  "artifacts",
  "cache",
  ".git",
  ".local",
]);
const filter = (source) => {
  const name = path.basename(source);
  return (
    !exclude.has(name) &&
    name !== ".env" &&
    !name.startsWith(".env.") &&
    !name.endsWith(".tsbuildinfo") &&
    source !== path.join(root, "shared/deployment.json") &&
    source !== path.join(root, "backend/server")
  );
};
for (const service of ["backend", "frontend"]) {
  const dest = path.join(stage, service);
  fs.mkdirSync(path.join(dest, "contracts"), { recursive: true });
  for (const name of [
    "backend",
    "frontend",
    "shared",
    "deploy",
    "contracts/package.json",
    "package.json",
    "package-lock.json",
    ".dockerignore",
  ]) {
    fs.cpSync(path.join(root, name), path.join(dest, name), {
      recursive: true,
      filter,
    });
  }
  fs.copyFileSync(
    path.join(root, `deploy/railway.${service}.json`),
    path.join(dest, "railway.json"),
  );
}
fs.mkdirSync(path.join(root, ".local"), { recursive: true });
fs.writeFileSync(path.join(root, ".local/railway-staging-path"), stage + "\n");
console.log(stage);
