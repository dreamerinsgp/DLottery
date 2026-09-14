# DLottery 运行与运维指南

[English](operations.md) | [简体中文](operations.zh-CN.md) | [文档目录](README.md)

现有 Railway/Sepolia 实例的配置见[部署记录](sepolia-assessment.zh-CN.md)。下文也介绍独立本地环境和新的公网部署。

## 本地开发

在仓库根目录执行 `npm ci && npm run demo` 即可启动。辅助程序需要 Linux x64 和 Go/Node，使用回环地址，不要求预装系统 PostgreSQL。可选的内置 PostgreSQL 分发包用于测试，不是生产数据库镜像。

默认链端口 8545、数据库端口 55432、后端端口 8081、前端端口 5173。`npm run verify` 分别使用 18545、55435、18081、15173；后端测试使用 55434。工具拒绝占用已有端口，只会停止由自己启动的进程。日志和清单位于 `.local/<stack>/`。

手动启动方式：

```bash
npm run build
npm run chain
# 在另一个终端中：
npm run deploy:local
# 启动 PostgreSQL，然后在 backend/ 中执行：
DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=disable' \
  RPC_HTTP_URL=http://127.0.0.1:8545 CONFIRMATIONS=0 go run ./cmd/server
# 在另一个终端的仓库根目录中：
npm run dev
```

上面的 `DATABASE_URL` 是占位示例，不是附带的账户。本地辅助程序之外，需要自行创建 PostgreSQL 用户和数据库。后端启动时在事务中幂等创建数据库结构，不会执行重置数据库操作。

## Docker

`docker compose up --build` 启动本地测试服务栈。数据库持久化到 `database` 卷，部署清单通过 `deployment` 卷传递给后端。前端 `/api` 请求由 nginx 转发，浏览器直接访问映射到宿主机的 EVM RPC。

本地链只保存在内存中。重新演示时先执行 `docker compose down`，再执行 `docker compose up`；一次性部署程序会重建合约。索引器会用新规范链校正保留的 SQL 数据。仅重启后端则保留并恢复索引游标。

后端以非特权用户运行，提供 `/healthz` 和 `/readyz`。容器的 `healthcheck` 模式只检查就绪状态，不会启动第二个索引器。Compose 端口只绑定回环地址，数据库端口不对外发布。

## 配置

| 变量                                              | 用途                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DEPLOYMENT_FILE`                                 | JSON 部署清单；从 `backend/` 启动时默认 `../shared/deployment.json`                                                      |
| `CHAIN_ID`、`LOTTERY_ADDRESS`、`DEPLOYMENT_BLOCK` | 覆盖清单中的部署身份及起始区块                                                                                           |
| `RPC_HTTP_URL`                                    | 后端/部署 RPC；含密钥的 URL 应保留在服务端                                                                               |
| `DATABASE_URL`                                    | 必需的 PostgreSQL DSN；远程数据库应配置适当 TLS                                                                          |
| `CONFIRMATIONS`                                   | 索引确认深度，默认 2，本地测试为 0，公网按链选择                                                                         |
| `POLL_INTERVAL_MS`                                | 50–30000 毫秒，默认 2000                                                                                                 |
| `PORT`                                            | HTTP 监听端口，后端默认 8081                                                                                             |
| `CORS_ORIGINS`                                    | 逗号分隔的精确浏览器来源                                                                                                 |
| `VITE_RPC_URL`                                    | 浏览器公共 RPC，构建时设置                                                                                               |
| `VITE_API_URL`                                    | 可选的浏览器 API 基地址，留空使用同源代理                                                                                |
| `API_PROXY_TARGET`                                | Vite 开发代理或 nginx 运行时上游；Docker 默认 `http://backend:8081`，Railway 使用 `http://backend.railway.internal:8081` |
| `VITE_TEST_TOKEN_ADDRESS`                         | 构建时可选的水龙头代币地址，仅在 Sepolia 且地址精确匹配时启用                                                            |

后端提供服务前会核对 RPC Chain ID、抽奖合约字节码，以及链上的代币、随机数提供方、DAO 配置。不信任客户端传入的代币精度。部署私钥只由合约部署工具链使用。

## 公网测试网部署

实现使用 VRF v2.5 订阅请求 ABI。协调器、key hash 和网络支持信息应以 [Chainlink 支持网络文档](https://docs.chain.link/vrf/v2-5/supported-networks)为准，并遵循[订阅管理指南](https://docs.chain.link/vrf/v2-5/subscription/create-manage)。

1. 选择 Sepolia（11155111）或 BSC 测试网（97）。通用脚本会拒绝主网和其他公网链。
2. 准备符合要求的常规 ERC20，核对精度和转账行为。本地可铸币测试合约不是生产资产。
3. 创建并充值 VRF 订阅，选择 key hash、确认数和回调 gas。模板以 500,000 gas 为起点，需要结合协调器和实际回调验证。
4. 将 `deploy/testnet.env.example` 中的值导入部署终端，私钥保留在本地秘密存储或环境中。
5. 执行 `npm run build` 和 `npm run deploy:testnet -w contracts`，保存公开清单和交易回执。
6. 将清单中的 `randomnessProvider` 地址注册为已充值订阅的消费者。在适配器中绑定抽奖合约不会自动完成消费者注册。
7. 使用相同链的公开清单、RPC、数据库和适当确认数启动后端，再配置前端公共 RPC 和 API 来源。
8. 检查就绪状态，读取当前轮次，用有测试资产的钱包授权并购票，达到人数或时间条件后请求开奖，检查真实回调。有人中奖则领取；无人中奖则滚存。保存交易哈希及同一区块的 API/合约对比。

订阅所有者负责外部 VRF 服务的充值和配置，但不能改变适配器的不可变协调器或覆盖已接收随机数。资金不足或服务不可用可能停止轮次推进；系统有意不提供特权重抽或提走代币负债的替代通道。

运行本地测试不意味着已经部署公网或完成充值。仓库提供部署所需代码，仍需外部账户与配置；现有在线实例另有明确的部署证据。

## 故障恢复

| 现象                      | 处理与预期行为                                                              |
| ------------------------- | --------------------------------------------------------------------------- |
| RPC 不可用或限流          | 检查连接与日志并恢复端点，扫描器从已提交游标退避重试                        |
| 数据库不可用              | 恢复数据库连接；失败区块事务回滚，就绪检查失败                              |
| 持续出现 ABI/事件处理错误 | 对比链上字节码、ABI、部署清单，修复后再继续；不要手动跳过区块               |
| 索引进程崩溃              | 重启后，从完全提交或完全回滚的最后状态继续；重放幂等                        |
| 检测到重组                | 自动寻找祖先并重建规范链投影，通过 `/readyz`、`/metrics` 和日志观察追赶进度 |
| 写入锁不可用              | 停止同部署的重复后端；每个部署只有一个锁持有者。锁连接失效需要重启该进程    |
| 交易上链但历史滞后        | 先核对回执，等待确认与索引，不要重复领取或购票                              |
| VRF 请求等待中            | 检查原请求、订阅资金和服务状态，不要请求新随机数                            |
| 随机数已保存但未结算      | 使用 `finalizeDraw(drawId)` 或界面的重试发送，复用同一个随机数              |
| 奖金转账失败              | 检查代币行为和 DAO 接收地址；整笔领取交易回滚，仍可再次领取                 |
| 只重启了本地链容器        | 停止并启动完整本地服务栈以重新部署合约，因为内存链已丢失状态                |

`GET /metrics` 提供链头、已索引高度、延迟、失败及重组次数。`GET /readyz` 还检查最近一次成功扫描；恢复中、落后或长期无法扫描时返回未就绪。`/healthz` 只能证明 HTTP 进程存活。

## 备份与变更

按常规数据库方式备份 PostgreSQL 和公开部署清单。只要 RPC 保留从部署区块开始的历史日志，就可以重建数据库。为每份清单保留对应的不可变合约 ABI 和源码。

初始结构定义于 `backend/internal/store/schema.sql`。未来结构变更需要版本化迁移；当前的“表不存在则创建”不是通用迁移系统。事件投影变更应先在隔离数据库重放验证，再切换服务。替换不可变抽奖或随机数合约意味着新的部署，旧部署的负债仍需从原合约领取。
