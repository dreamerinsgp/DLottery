import fs from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, MaxUint256 } from "ethers";
import { root } from "./processes.mjs";
const provider = new JsonRpcProvider(
  process.env.RPC_HTTP_URL || "http://127.0.0.1:8545",
  undefined,
  { cacheTimeout: -1, pollingInterval: 100 },
);
if (
  !["31337", "1337"].includes((await provider.getNetwork()).chainId.toString())
)
  throw new Error("Demo helper is restricted to a local chain.");
const config = JSON.parse(
  fs.readFileSync(
    process.env.DEPLOYMENT_FILE || path.join(root, "shared/deployment.json"),
  ),
);
const abi = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, "shared", name + ".json")));
const signer = await provider.getSigner(0);
const lottery = new Contract(config.lotteryAddress, abi("DLottery"), signer),
  token = new Contract(config.tokenAddress, abi("MockUSD8"), signer);
const id = await lottery.currentDrawId();
if (process.argv[2] === "fill") {
  for (let i = 0; i < 5; i++) {
    const user = await provider.getSigner(i);
    if ((await lottery.ticketOf(id, user.address)) !== 0n) continue;
    if ((await lottery.getDraw(id)).participantCount >= 5n) break;
    await (
      await token.connect(user).approve(lottery.target, MaxUint256)
    ).wait();
    await (await lottery.connect(user).buyTicket(id)).wait();
  }
  console.log(`Filled draw ${id} with local test accounts.`);
} else {
  const lucky = Number(process.argv[3] || "1");
  if (!Number.isInteger(lucky) || lucky < 1 || lucky > 10)
    throw new Error("Choose a local lucky number between 1 and 10");
  let d = await lottery.getDraw(id);
  if (d.status === 0n) {
    if (d.participantCount < 5n)
      await provider.send("evm_setNextBlockTimestamp", [Number(d.deadline)]);
    await (await lottery.performDraw(id)).wait();
    d = await lottery.getDraw(id);
  }
  if (d.status === 1n) {
    const mock = new Contract(
      config.randomnessProvider,
      abi("MockRandomnessProvider"),
      signer,
    );
    await (await mock.fulfill(d.requestId, lucky - 1)).wait();
  }
  console.log(`Draw ${id} settled. Refresh the app to view or claim.`);
}
provider.destroy();
