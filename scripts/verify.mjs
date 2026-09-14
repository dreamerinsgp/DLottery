import { startStack } from "./stack.mjs";
import { e2e } from "./e2e.mjs";
import { run } from "./processes.mjs";
run("npm", ["run", "check"]);
const stack = await startStack({ isolated: true });
try {
  await e2e({
    rpc: stack.rpc,
    api: stack.api,
    manifest: stack.env.DEPLOYMENT_FILE,
    restartBackend: stack.restartBackend,
  });
  run("npm", ["run", "test:browser"], {
    env: {
      ...process.env,
      RPC_HTTP_URL: stack.rpc,
      API_URL: stack.api,
      PLAYWRIGHT_BASE_URL: stack.web,
      DEPLOYMENT_FILE: stack.env.DEPLOYMENT_FILE,
    },
  });
} finally {
  await stack.shutdown();
}
