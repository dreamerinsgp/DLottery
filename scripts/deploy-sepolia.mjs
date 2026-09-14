// Assessment deployment: real Sepolia VRF, mintable test USD8, resumable receipts.
// Run after npm run build. Secrets stay in the local .env file.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import {
  Contract,
  ContractFactory,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  id,
  parseEther,
} from "ethers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...parseEnv(fs.readFileSync(path.join(root, ".env"), "utf8")),
  ...process.env,
};
const rpcURL =
  env.RPC_HTTP_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const request = new FetchRequest(rpcURL);
request.timeout = 30000;
const rpc = new JsonRpcProvider(request, 11155111, { staticNetwork: true });
rpc.pollingInterval = 4000;
const wallet = new Wallet(env.DEPLOYER_PRIVATE_KEY || env.PRIVATE_KEY, rpc);
const dir = path.join(root, ".local/sepolia");
fs.mkdirSync(dir, { recursive: true });
const stateFile = path.join(dir, "deployment-state.json");
const state = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : { deployer: wallet.address, transactions: {} };
function save() {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
}
function artifact(name) {
  const source = name === "MockUSD8" ? "mocks/MockUSD8" : name;
  return JSON.parse(
    fs.readFileSync(
      path.join(root, `contracts/artifacts/src/${source}.sol/${name}.json`),
      "utf8",
    ),
  );
}
async function transact(label, send) {
  if (!state.transactions[label]) {
    const tx = await send();
    state.transactions[label] = { hash: tx.hash };
    save();
    console.log(label, tx.hash);
  }
  const entry = state.transactions[label];
  const receipt = await rpc.waitForTransaction(entry.hash, 1, 180000);
  if (!receipt || receipt.status !== 1)
    throw new Error(`Transaction failed or pending: ${label}`);
  entry.blockNumber = receipt.blockNumber;
  save();
  return receipt;
}
async function deploy(name, args) {
  const a = artifact(name);
  const receipt = await transact(`deploy${name}`, async () =>
    wallet.sendTransaction(
      await new ContractFactory(a.abi, a.bytecode, wallet).getDeployTransaction(
        ...args,
      ),
    ),
  );
  return new Contract(receipt.contractAddress, a.abi, wallet);
}
async function main() {
  if (BigInt(await rpc.send("eth_chainId", [])) !== 11155111n)
    throw new Error("Sepolia required");
  if (state.deployer !== wallet.address)
    throw new Error("Checkpoint belongs to another deployer");
  const coordinatorAddress = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
  const keyHash =
    "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
  const coordinator = new Contract(
    coordinatorAddress,
    [
      "function createSubscription() returns (uint256)",
      "function fundSubscriptionWithNative(uint256) payable",
      "function addConsumer(uint256,address)",
      "function getSubscription(uint256) view returns (uint96,uint96,uint64,address,address[])",
    ],
    wallet,
  );
  if (!state.subscriptionId) {
    if (env.VRF_SUBSCRIPTION_ID) state.subscriptionId = env.VRF_SUBSCRIPTION_ID;
    else {
      const receipt = await transact("createSubscription", () =>
        coordinator.createSubscription(),
      );
      const event = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === coordinatorAddress.toLowerCase() &&
          log.topics[0] === id("SubscriptionCreated(uint256,address)"),
      );
      if (!event) throw new Error("SubscriptionCreated event missing");
      state.subscriptionId = BigInt(event.topics[1]).toString();
    }
    save();
  }
  const subscription = await coordinator.getSubscription(state.subscriptionId);
  if (subscription[3].toLowerCase() !== wallet.address.toLowerCase())
    throw new Error("Deployer must own subscription");
  if (
    !state.transactions.fundSubscription &&
    subscription[1] < parseEther("0.5")
  ) {
    await transact("fundSubscription", () =>
      coordinator.fundSubscriptionWithNative(state.subscriptionId, {
        value: parseEther("0.5") - subscription[1],
      }),
    );
  }
  const token = env.USD8_ADDRESS
    ? new Contract(env.USD8_ADDRESS, artifact("MockUSD8").abi, wallet)
    : await deploy("MockUSD8", [8]);
  const provider = await deploy("VRFProvider", [
    coordinatorAddress,
    BigInt(state.subscriptionId),
    keyHash,
    3,
    500000,
    true,
  ]);
  const dao = env.DAO_ADDRESS || wallet.address;
  const lottery = await deploy("DLottery", [
    token.target,
    dao,
    2,
    provider.target,
  ]);
  await transact("bindLottery", () => provider.setLottery(lottery.target));
  await transact("addConsumer", () =>
    coordinator.addConsumer(state.subscriptionId, provider.target),
  );
  await transact("startDraw", () => lottery.startDraw(0));
  if (!env.USD8_ADDRESS)
    await transact("mintDeployer", async () =>
      token.mint(wallet.address, 1000n * 10n ** BigInt(await token.decimals())),
    );
  const manifest = {
    chainId: "11155111",
    lotteryAddress: lottery.target,
    tokenAddress: token.target,
    tokenDecimals: Number(await token.decimals()),
    daoAddress: dao,
    randomnessProvider: provider.target,
    deploymentBlock: state.transactions.deployDLottery.blockNumber,
    minimumParticipants: 2,
    localMock: false,
    testToken: !env.USD8_ADDRESS,
    vrfSubscriptionId: state.subscriptionId,
    vrfNativePayment: true,
  };
  fs.writeFileSync(
    path.join(dir, "deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(root, "shared/deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify(manifest, null, 2));
}
main()
  .catch((error) => {
    // Error objects from RPC libraries may contain request details; only report safe codes.
    const detail = String(
      error.error?.message || error.shortMessage || error.message,
    )
      .replace(/0x[0-9a-fA-F]{64,}/g, "[redacted hex]")
      .replace(/https?:\/\/\S+/g, "[RPC URL]");
    console.error("Deployment stopped:", error.code || "CHECK_FAILED", detail);
    process.exitCode = 1;
  })
  .finally(() => rpc.destroy());
