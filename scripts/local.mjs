import { startStack } from "./stack.mjs";
import { run } from "./processes.mjs";
run("npm", ["run", "build"]);
const stack = await startStack();
console.log(
  `\nDLottery is ready: ${stack.web}\nAPI: ${stack.api}\nLocal wallet network: chain 31337, RPC ${stack.rpc}\nThe first six standard Hardhat accounts have 1,000 mock USD8 each.\nLogs: ${stack.base}\nUse npm run demo:fill and npm run demo:draw -- 1 for local draw demonstrations.\nPress Ctrl+C to stop all services.\n`,
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await stack.shutdown();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
