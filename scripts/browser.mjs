import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./processes.mjs";
// Optional unprivileged Chromium dependency installation on minimal Linux hosts.
// Standard Playwright --with-deps installations need no override.
const localLibraries =
  process.env.PLAYWRIGHT_LIBRARY_PATH ||
  path.join(os.homedir(), ".local/lib/chrome");
const env = { ...process.env };
if (
  process.platform === "linux" &&
  fs.existsSync(path.join(localLibraries, "libnspr4.so"))
) {
  env.LD_LIBRARY_PATH =
    localLibraries + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
}
run("npx", ["playwright", "test", ...process.argv.slice(2)], { env });
