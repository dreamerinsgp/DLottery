# Sepolia 考核部署记录

[English](sepolia-assessment.md) | [简体中文](sepolia-assessment.zh-CN.md) | [文档目录](README.md)

快速操作步骤见[评审指南](examiner-guide.zh-CN.md)。

部署日期为 2026-09-14。本实例使用可铸造的测试 USD8，以及真实 Chainlink VRF v2.5；VRF 使用 Sepolia ETH 支付。

## 评审链接

- 在线应用：https://frontend-production-216bb.up.railway.app
- 当前轮次 API：https://frontend-production-216bb.up.railway.app/api/v1/draws/current
- 历史 API：https://frontend-production-216bb.up.railway.app/api/v1/draws/history
- 后端就绪检查：https://backend-production-7bb6.up.railway.app/readyz
- Railway 项目：https://railway.com/project/39761d0b-53a6-4ce3-b032-086699e2e8df（需要所有者权限）

查看结果无需钱包。参与时，请将 MetaMask 连接到 **Ethereum Sepolia，Chain ID 11155111**，并准备 Sepolia ETH 支付 gas。点击 **Get 1,000 test USD8**，授权 10 USD8 后购买一张票。水龙头也需要确认链上交易。每个钱包每轮只能购买一张票。

满五人即可立即请求开奖，否则需要等到 24 小时截止时间。Chainlink 异步返回随机数，请等待最终结果。满员轮次中，1–5 有票号持有人，6–10 无持有人；无人中奖时奖池滚存。中奖钱包可以领取奖金，历史结果持续显示在 **Past draws**。

初次验证在 **2026-09-14 08:23 UTC** 记录了第 **2** 轮：**四位参与者**、**90 USD8 奖池**（50 滚存 + 40 新票款）。这是历史证据，不保证现在仍有第五张票可买。同日后续检查记录为第 **3** 轮进行中，**0 位参与者**、**100 USD8 继承奖池**；前两轮均为 `NO_WINNER`，幸运号码均为 9。详情见[带时间的 API 快照](review-snapshot.json)。操作时以实时轮次状态和截止时间为准；到期后，执行结算并在允许时开启新轮次。

## 已确认的验证

- 生产构建和全部 17 个 Solidity 测试通过。
- 真实 PostgreSQL 支持的 Go 测试通过竞态检测。
- 验证时 Railway 就绪接口返回 HTTP 200，索引已同步，记录的索引失败次数为零。
- 五个独立钱包在第 1 轮完成代币授权与购票。
- [真实 VRF 请求](https://sepolia.etherscan.io/tx/0x5d82c1a5506107c8e521cc5ae7cdd118b455c8b2f83d0830b2aaf85aea6fec0d)和[回调交易](https://sepolia.etherscan.io/tx/0xde9587613b44ff2904aaeb4d33dab70c8189d832c399efc72cbf93190cf036da)完成。幸运号码 **9** 未分配，50 USD8 滚入后续轮次。由于该轮无人中奖，未在该次公网演示执行领奖；本地合约测试覆盖领奖。
- API 轮次数据与其索引区块上的合约读取一致，历史中可见第 1 轮结果。
- 桌面和手机浏览器检查通过，没有页面错误或手机横向溢出。
- 在线水龙头通过受限钱包桥接进行浏览器验证。[该交易](https://sepolia.etherscan.io/tx/0x2110713a156990e955ae53f5b795c5afa5d7986130130dcb07941e96490e53af)使测试钱包余额准确增加 1,000 USD8。

参见[公开部署和交易证据](sepolia-evidence.json)。Railway 使用 CLI 上传部署。仓库包含应用源码、部署脚本及评审文档；向 GitHub 推送不会自动重新部署现有 Railway 服务。

## 合约

| 合约/角色      | Sepolia 地址                                 |
| -------------- | -------------------------------------------- |
| DLottery       | `0x670A8C7D4844D23960fFf8F3841a47AAD559dC7d` |
| USD8 测试代币  | `0x5A3580AC7b927554AA5Ff38B61C91A9078ee496e` |
| VRF 适配器     | `0x497602A403815dE3415D410170Fd35e58fD64db5` |
| DAO 费用接收者 | `0x63d50331c568cE20eecA55fc5AA3E33c0bEC62FB` |

部署区块：**11701601**。代币精度：**8**。三个合约的创建/运行时字节码均在 Sourcify 获得精确匹配：

- [抽奖合约源码](https://sourcify.dev/#/lookup/11155111/0x670A8C7D4844D23960fFf8F3841a47AAD559dC7d)
- [代币源码](https://sourcify.dev/#/lookup/11155111/0x5A3580AC7b927554AA5Ff38B61C91A9078ee496e)
- [VRF 适配器源码](https://sourcify.dev/#/lookup/11155111/0x497602A403815dE3415D410170Fd35e58fD64db5)
- [Etherscan 抽奖交易](https://sepolia.etherscan.io/address/0x670A8C7D4844D23960fFf8F3841a47AAD559dC7d)

Etherscan 自动源码提交遇到每日额度限制，Sourcify 验证成功。

VRF 订阅 ID：`34892855678778204017201078970598779801487082021592630858904837758082757744851`。注册的消费者为 VRF 适配器。协调器地址为 `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`。配置为 3 个请求确认、500,000 回调 gas、原生代币付款，以及 500 gwei gas lane。累计充值 0.5 Sepolia ETH；这不是当前余额的保证。后续开奖应维持足够储备，最大费用储备计算见 [Chainlink 计费文档](https://docs.chain.link/vrf/v2-5/billing)。

## Railway 配置

三个服务为 `Postgres`、`backend`、`frontend`。后端通过私有网络连接 PostgreSQL，索引 Sepolia 时等待三个确认，每五秒轮询一次。单个后端副本持有数据库索引锁。前端把 `/api/` 转发至 `http://backend.railway.internal:8081`；浏览器读取使用公共 RPC `https://ethereum-sepolia-rpc.publicnode.com`。

部署私钥只保留在本地 `.env`，不会传给 Railway。上传暂存程序排除 `.env`、本地生成的钱包、构建产物和自动部署清单。后端通过 `CHAIN_ID`、`LOTTERY_ADDRESS`、`DEPLOYMENT_BLOCK` 获取部署身份，数据库连接使用 Railway 引用变量 `${{Postgres.DATABASE_URL}}`。

前端构建变量为 `VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com` 和 `VITE_TEST_TOKEN_ADDRESS=0x5A3580AC7b927554AA5Ff38B61C91A9078ee496e`；运行时变量为 `PORT=8080` 和 `API_PROXY_TARGET=http://backend.railway.internal:8081`。

准备后续版本时，在仓库根目录运行 `node scripts/stage-railway.mjs`。它会打印临时目录，其中分别有后端和前端上传根目录，每个目录都有 `railway.json`。上传需要部署的目录：

```bash
railway up /printed/staging/path/frontend --path-as-root \
  --project 39761d0b-53a6-4ce3-b032-086699e2e8df \
  --environment production --service frontend --detach
```

后端发布则改用后端目录和 `--service backend`。后端持有独占索引锁，替代进程必须在旧写入者停止后再启动，应为后端替换安排短暂维护窗口。前端启动要求私有后端域名能够解析。

## 本地部署记录

- `.local/sepolia/deployment.json`：公开合约清单。
- `.local/sepolia/deployment-state.json`：部署交易检查点。
- `.local/sepolia/demo-evidence.json`：测试网操作与回执检查点。
- `.local/sepolia/source-verification.json`：源码验证结果。
- `.local/sepolia/test-wallets.json`：本地生成的私密测试钱包，仅文件所有者可读，不得发布。

`node scripts/deploy-sepolia.mjs` 使用本地 `.env` 中的 `PRIVATE_KEY` 或 `DEPLOYER_PRIVATE_KEY` 部署/恢复考核合约。保留检查点，避免意外产生另一份部署。`node scripts/check-sepolia.mjs` 恢复真实测试网验证，并为第 2 轮准备四位参与者。这不是通用的“补齐当前轮次”工具。这些命令会消耗 Sepolia ETH，与只用于本地的 `npm run verify` 不同。
