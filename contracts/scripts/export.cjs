const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
for (const [name, file] of [
  ["DLottery", "DLottery.sol"],
  ["MockUSD8", "mocks/MockUSD8.sol"],
  ["MockRandomnessProvider", "mocks/MockRandomnessProvider.sol"],
  ["VRFProvider", "VRFProvider.sol"],
]) {
  const { abi } = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts/artifacts/src", file, `${name}.json`),
    ),
  );
  fs.mkdirSync(path.join(root, "shared"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "shared", `${name}.json`),
    JSON.stringify(abi, null, 2) + "\n",
  );
  if (name === "DLottery")
    fs.writeFileSync(
      path.join(root, "backend/internal/lottery/abi.json"),
      JSON.stringify(abi),
    );
}
console.log("Exported canonical ABI for frontend and Go indexer");
