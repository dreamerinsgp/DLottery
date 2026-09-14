const { ethers, network } = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const local = chainId === 31337n || chainId === 1337n;
  if (!local && ![11155111n, 97n].includes(chainId))
    throw new Error(
      "Public deployment supports Sepolia (11155111) or BSC testnet (97) only",
    );
  const [deployer] = await ethers.getSigners();
  if (!deployer)
    throw new Error(
      "Configure DEPLOYER_PRIVATE_KEY locally for a public testnet deployment",
    );
  const minimum = Number(process.env.MINIMUM_PARTICIPANTS || "2");
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 5)
    throw new Error("Invalid minimum participants");
  let token, provider;
  const dao =
    process.env.DAO_ADDRESS ||
    (local ? (await ethers.getSigners())[9].address : "");
  if (!ethers.isAddress(dao) || dao === ethers.ZeroAddress)
    throw new Error("DAO_ADDRESS is required");
  if (local) {
    token = await (await ethers.getContractFactory("MockUSD8")).deploy(8);
    await token.waitForDeployment();
    provider = await (
      await ethers.getContractFactory("MockRandomnessProvider")
    ).deploy();
    await provider.waitForDeployment();
  } else {
    for (const key of [
      "USD8_ADDRESS",
      "VRF_COORDINATOR",
      "VRF_SUBSCRIPTION_ID",
      "VRF_KEY_HASH",
      "VRF_CONFIRMATIONS",
      "VRF_CALLBACK_GAS_LIMIT",
    ])
      if (!process.env[key]) throw new Error(`${key} is required`);
    token = await ethers.getContractAt("MockUSD8", process.env.USD8_ADDRESS);
    provider = await (
      await ethers.getContractFactory("VRFProvider")
    ).deploy(
      process.env.VRF_COORDINATOR,
      BigInt(process.env.VRF_SUBSCRIPTION_ID),
      process.env.VRF_KEY_HASH,
      Number(process.env.VRF_CONFIRMATIONS),
      Number(process.env.VRF_CALLBACK_GAS_LIMIT),
      process.env.VRF_NATIVE_PAYMENT === "true",
    );
    await provider.waitForDeployment();
  }
  const lottery = await (
    await ethers.getContractFactory("DLottery")
  ).deploy(token.target, dao, minimum, provider.target);
  await lottery.waitForDeployment();
  const receipt = await lottery.deploymentTransaction().wait();
  if (!local) await (await provider.setLottery(lottery.target)).wait();
  if (local) {
    const unit = 10n ** BigInt(await token.decimals());
    for (const user of (await ethers.getSigners()).slice(0, 6))
      await (await token.mint(user.address, 1000n * unit)).wait();
  }
  await (await lottery.startDraw(0)).wait();
  const manifest = {
    chainId: chainId.toString(),
    lotteryAddress: lottery.target,
    tokenAddress: token.target,
    tokenDecimals: Number(await token.decimals()),
    daoAddress: dao,
    randomnessProvider: provider.target,
    deploymentBlock: receipt.blockNumber,
    minimumParticipants: minimum,
    localMock: local,
  };
  const file =
    process.env.DEPLOYMENT_FILE ||
    path.resolve(__dirname, "../../shared/deployment.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
  if (!local)
    console.log(
      "Add randomnessProvider as a consumer of the funded VRF subscription before performing a draw.",
    );
}
main().catch((err) => {
  console.error(err.shortMessage || err.message);
  process.exitCode = 1;
});
