// Creates real testnet activity and leaves four tickets ready for an examiner.
// Uses separate generated test wallets saved locally with owner-only permissions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  parseEther,
} from "ethers";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".local/sepolia");
const env = {
  ...parseEnv(fs.readFileSync(path.join(root, ".env"), "utf8")),
  ...process.env,
};
const manifest = JSON.parse(
  fs.readFileSync(path.join(dir, "deployment.json"), "utf8"),
);
const request = new FetchRequest(
  env.RPC_HTTP_URL || "https://ethereum-sepolia-rpc.publicnode.com",
);
request.timeout = 30000;
const rpc = new JsonRpcProvider(request, 11155111, { staticNetwork: true });
rpc.pollingInterval = 4000;
const owner = new Wallet(env.DEPLOYER_PRIVATE_KEY || env.PRIVATE_KEY, rpc);
const walletFile = path.join(dir, "test-wallets.json");
if (!fs.existsSync(walletFile))
  fs.writeFileSync(
    walletFile,
    JSON.stringify(
      Array.from({ length: 4 }, () => Wallet.createRandom().privateKey),
    ),
    { mode: 0o600 },
  );
const players = [
  owner,
  ...JSON.parse(fs.readFileSync(walletFile, "utf8")).map(
    (key) => new Wallet(key, rpc),
  ),
];
const abi = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, `shared/${name}.json`), "utf8"));
const lottery = new Contract(manifest.lotteryAddress, abi("DLottery"), owner);
const token = new Contract(manifest.tokenAddress, abi("MockUSD8"), owner);
const evidenceFile = path.join(dir, "demo-evidence.json");
const evidence = fs.existsSync(evidenceFile)
  ? JSON.parse(fs.readFileSync(evidenceFile, "utf8"))
  : { players: players.map((p) => p.address), transactions: {} };
function save() {
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + "\n");
}
async function submit(label, send) {
  if (!evidence.transactions[label]) {
    let tx;
    for (let attempt = 0; ; attempt++) {
      try {
        tx = await send();
        break;
      } catch (error) {
        if (
          attempt >= 8 ||
          !/in-flight transaction limit|nonce too low/i.test(
            error.error?.message || error.shortMessage || "",
          )
        )
          throw error;
        console.log(`Waiting for the RPC transaction pool before ${label}...`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }
    evidence.transactions[label] = { hash: tx.hash };
    save();
    console.log(label, tx.hash);
  }
  return evidence.transactions[label].hash;
}
async function confirm(label, send) {
  const hash = await submit(label, send);
  const receipt = await rpc.waitForTransaction(hash, 1, 180000);
  if (!receipt || receipt.status !== 1)
    throw new Error(`Failed or pending: ${label}`);
  evidence.transactions[label].blockNumber = receipt.blockNumber;
  save();
  return receipt;
}
async function tickets(drawId, wallets) {
  const results = await Promise.allSettled(
    wallets.map(async (wallet, index) => {
      const t = token.connect(wallet),
        l = lottery.connect(wallet);
      if (await l.ticketOf(drawId, wallet.address)) return;
      if ((await t.balanceOf(wallet.address)) < 10n ** 9n)
        await confirm(`mint${index}`, () =>
          t.mint(wallet.address, 1000n * 10n ** 8n),
        );
      await confirm(`approve${drawId}-${index}`, () =>
        t.approve(lottery.target, 10n ** 9n),
      );
      await confirm(`buy${drawId}-${index}`, () => l.buyTicket(drawId));
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}
async function main() {
  if (
    manifest.chainId !== "11155111" ||
    BigInt(await rpc.send("eth_chainId", [])) !== 11155111n ||
    !manifest.testToken
  )
    throw new Error("Sepolia test fixture required");
  for (let i = 1; i < players.length; i++) {
    const label = `fund${i}`;
    if (
      !evidence.transactions[label] &&
      (await rpc.getBalance(players[i].address)) < parseEther("0.003")
    ) {
      await confirm(label, () =>
        owner.sendTransaction({
          to: players[i].address,
          value: parseEther("0.003"),
        }),
      );
    }
  }
  let draw = await lottery.getDraw(1);
  if (draw.status === 0n) {
    await tickets(1, players);
    await confirm("performDraw1", () => lottery.performDraw(1));
  }
  const deadline = Date.now() + 15 * 60 * 1000;
  while ((draw = await lottery.getDraw(1)).status === 1n) {
    if (Date.now() > deadline)
      throw new Error("VRF still pending; rerun to resume monitoring");
    console.log("Waiting for real VRF fulfillment...");
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  evidence.firstDraw = {
    status: Number(draw.status),
    luckyNumber: Number(draw.luckyNumber),
    winner: draw.winner,
    requestId: draw.requestId.toString(),
  };
  save();
  if (draw.status === 2n) {
    const winner = players.find(
      (p) => p.address.toLowerCase() === draw.winner.toLowerCase(),
    );
    if (!winner) throw new Error("Winner is outside test wallets");
    await confirm("claimPrize1", () => lottery.connect(winner).claimPrize(1));
  }
  if ((await lottery.currentDrawId()) === 1n)
    await confirm("startDraw2", () => lottery.startDraw(1));
  const current = await lottery.currentDrawId();
  if (current === 2n && (await lottery.getDraw(2)).status === 0n)
    await tickets(2, players.slice(0, 4));
  console.log("Confirmed real VRF result:", JSON.stringify(evidence.firstDraw));
  console.log("Examiner round:", (await lottery.currentDrawId()).toString());
}
main()
  .catch((error) => {
    const detail = String(
      error.error?.message || error.shortMessage || error.message,
    )
      .replace(/0x[0-9a-fA-F]{64,}/g, "[redacted hex]")
      .replace(/https?:\/\/\S+/g, "[RPC URL]");
    console.error("Check stopped:", error.code || "CHECK_FAILED", detail);
    process.exitCode = 1;
  })
  .finally(() => rpc.destroy());
