require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _, runSuper) => {
  if (solcVersion === '0.8.24') return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true, version: solcVersion, longVersion: require('solc').version() };
  return runSuper();
});
module.exports = {
  solidity: { version: '0.8.24', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
  paths: { sources: './src' },
  networks: { localhost: { url: process.env.RPC_HTTP_URL || 'http://127.0.0.1:8545' }, testnet: { url: process.env.RPC_HTTP_URL || 'http://127.0.0.1:8545', accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [] } }
};
