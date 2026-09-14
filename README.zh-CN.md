# DLottery

[English](README.md) | [简体中文](README.zh-CN.md) | [文档目录](docs/README.md)

基于 EVM 的抽奖 MVP，包含 Solidity 合约、被动式 Go/PostgreSQL 索引与 REST API 服务，以及 React 钱包应用。实现[考核 PRD](docs/PRD.zh-CN.md)：每张票 10 USD8、每轮最多五人、每个钱包每轮一张票、十个可能的幸运号码、24 小时轮次、最低人数不足时取消、退款、奖池滚存，以及按中奖者净利润收取 5% DAO 费用。

**Sepolia 在线演示：**[打开 DLottery](https://frontend-production-216bb.up.railway.app)。操作与部署信息见[评审指南](docs/examiner-guide.zh-CN.md)及[部署记录](docs/sepolia-assessment.zh-CN.md)。该演示使用可铸造测试 USD8 和真实 Chainlink VRF。

**评审入口：**[英文指南](docs/examiner-guide.md) / [中文指南](docs/examiner-guide.zh-CN.md)。[文档目录](docs/README.md)包含双语技术说明、验证证据、提交模板和录屏脚本。

## 本地运行

前提：Node.js 22+、npm、Go 1.24+。内置 PostgreSQL 辅助程序需要 Linux x64；其他平台可以使用 Docker Compose。

```bash
npm ci
npm run demo
```

若 5173 端口被占用，运行 `DEMO_WEB_PORT=5174 npm run demo` 并打开 **http://127.0.0.1:5174**。

默认打开 **http://127.0.0.1:5173**。该命令会构建应用，启动独立的本地 PostgreSQL 和 Hardhat 链，部署测试合约，为前六个本地测试账户各发放 1,000 USD8，并启动后端和前端。日志和数据库文件位于 `.local/demo/`；Ctrl+C 停止服务。工具不会接管已占用的端口。

将 EVM 钱包连接至链 **31337**，RPC 为 **http://127.0.0.1:8545**，手续费币种为 **ETH**。可从 `.local/demo/chain.log` 导入标准 Hardhat 测试账户到独立测试钱包。这些公开账户只用于本地链。本地 `USD8` 是精度为 8 的模拟代币；部署到其他网络时，合约会读取所选代币的真实精度。

1. 连接钱包并购票。按提示授权 10 USD8，再确认购票交易。
2. 运行 `npm run demo:fill`，让本地测试账户购买剩余票，或手动连接更多钱包。
3. 点击 **Perform lottery draw**。本地随机数有意采用手动模拟：运行 `npm run demo:draw -- 1` 选择幸运号码 1，或 `npm run demo:draw -- 10` 演示未分配号码。
4. 如果钱包中奖，领取奖金；否则可以开始下一轮并继承滚存奖池。
5. 演示取消时，启动空轮次，只购买不足两张票，然后运行 `npm run demo:draw`。辅助程序会把本地链时间推进到截止时间并结算，再从当前卡片或历史详情申请退款。

本地演示工具会拒绝公网链。公网部署使用可验证随机数，用户不能指定开奖结果。后端不签署交易，也不转移资金。

## Docker Compose

```bash
docker compose up --build
```

打开 **http://127.0.0.1:8080**。该命令启动 PostgreSQL、本地链、一次性部署程序、Go 服务和 nginx/前端。API 为 `http://127.0.0.1:8081`，钱包 RPC 为 `http://127.0.0.1:8545`。Compose 内的凭据仅用于本地演示，公开端口只绑定回环地址。

要在宿主机上使用演示辅助程序，先导出公开部署清单：

```bash
docker compose cp deployer:/runtime/deployment.json shared/deployment.json
npm run demo:fill
npm run demo:draw -- 1
```

要重建本地链和合约，先执行 `docker compose down`，再执行 `docker compose up`。索引器会按照新的规范链校正保留的数据库。仅重启内存链会丢失合约，需重启完整服务栈以重新部署。详见[运维指南](docs/operations.zh-CN.md)。

## 完整验证

```bash
npx playwright install chromium
npm run verify
```

`verify` 会构建应用，运行合约测试和带竞态检测的真实 PostgreSQL Go 测试，在独立端口启动隔离服务栈，执行真实交易与索引集成测试，重启后端，并运行 Chromium 钱包流程测试；完成后停止隔离服务。它不会连接公网链。

在精简 Linux 环境中，可用 `npx playwright install --with-deps chromium` 安装系统依赖。浏览器执行器支持 `PLAYWRIGHT_LIBRARY_PATH`，也会识别已有的 `~/.local/lib/chrome` 依赖目录。

| 命令                         | 检查内容                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| `npm run build`              | 合约编译、共享 ABI 导出、TypeScript 和前端生产构建               |
| `npm test`                   | 合约测试和真实 PostgreSQL 支持的 Go 测试                         |
| `npm run test:backend`       | 启动隔离数据库并执行 `-race` 测试，支持 `TEST_DATABASE_URL`      |
| `npm run test:e2e`           | 基于运行中的全新本地演示，验证真实交易、结果分支、重组回滚和分页 |
| `npm run test:browser`       | 基于空活动轮次的本地演示，验证钱包界面流程                       |
| `cd backend && go vet ./...` | Go 静态检查                                                      |

非 Linux 主机可通过 `TEST_DATABASE_URL` 指定可丢弃的 PostgreSQL 测试库。完整自动 `verify`/`demo` 辅助程序目前面向 Linux x64，应用服务本身提供容器化配置。不要让测试程序连接生产数据库。

## 项目结构

| 目录         | 职责                                                          |
| ------------ | ------------------------------------------------------------- |
| `contracts/` | 抽奖合约、协调器不可变的 VRF 适配器、本地测试合约、测试与部署 |
| `backend/`   | Go RPC 扫描、SQL 事件投影、回滚重放与 REST 服务               |
| `frontend/`  | React/TypeScript 钱包界面和浏览器测试                         |
| `shared/`    | 导出的 ABI；自动生成的部署清单不纳入 Git                      |
| `deploy/`    | Dockerfile、nginx、环境变量模板与 Railway 配置                |
| `scripts/`   | 本地环境、确定性演示、测试网部署及全栈验证工具                |
| `docs/`      | PRD、架构、API、运维、双语评审说明与证据                      |

## API

- `GET /api/v1/config`：已核对的部署与代币配置。
- `GET /api/v1/draws/current`：当前或最近轮次、十个票号、结果及同步信息。
- `GET /api/v1/draws/history?limit=20&cursor=...`：从新到旧的已确定结果，支持游标分页。
- `GET /api/v1/draws/{id}`：历史详情、票号和退款状态。
- `GET /healthz`、`GET /readyz`、`GET /metrics`：进程存活、数据库与索引就绪状态、运行指标。

金额和轮次/请求 ID 使用以最小单位表示的十进制字符串。API 数据标识对应的索引区块、哈希和链上时间。浏览器通过合约判断当前操作资格，因此索引延迟不会撤销已上链的交易。详见 [API 指南](docs/api-guide.zh-CN.md)和 [OpenAPI](docs/openapi.json)。

## 测试网部署

通用部署脚本支持 Sepolia（11155111）和 BSC 测试网（97）。本地环境需要有资金的部署钱包、已存在且行为兼容的常规 ERC20、DAO 地址，以及已充值的 VRF v2.5 订阅配置；见[环境模板](deploy/testnet.env.example)。

```bash
npm run build
# 先在本地 shell 中导出私密部署配置。
npm run deploy:testnet -w contracts
```

脚本会部署适配器和抽奖合约，执行一次性绑定，启动轮次，并生成 `shared/deployment.json`。**开奖前，必须把适配器地址加入已充值 VRF 订阅的消费者列表。**后端和浏览器 RPC 应使用同一条链，并配置适当确认深度。[运维指南](docs/operations.zh-CN.md)提供完整步骤。

新部署需要自行准备以上外部账户和配置。现有在线考核实例和验证记录见 [Sepolia 部署记录](docs/sepolia-assessment.zh-CN.md)，本地验证情况见[验证记录](docs/validation.zh-CN.md)。

## 设计选择

票号从 1 开始顺序分配，幸运号码范围为 1–10。最低人数可在部署时配置，默认为 2。轮次结果确定后，即使旧奖金或退款尚未领取，也能开始下一轮。取消仅退还本轮票款，继承的滚存资金继续保留。这些选择补充了 PRD 的未明确之处，并有测试覆盖。

合约不可升级。系统没有后端签名者、任意取消、管理员指定结果、重新抽取随机数或提走抽奖负债资金的功能。预言机失败会使轮次保持等待；已收到的随机数可以重试发送，不需要请求新随机数。资金记账与恢复细节见[架构说明](docs/architecture.zh-CN.md)。
