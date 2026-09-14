# API 使用指南

[English](api-guide.md) | [简体中文](api-guide.zh-CN.md) | [文档目录](README.md)

Go API 只提供读取功能，写交易由钱包直接调用合约。完整接口定义见 [openapi.json](openapi.json)。中英文文档使用相同的接口名和字段名。

## 服务地址与请求

通过 `https://frontend-production-216bb.up.railway.app` 访问 nginx 代理的 `/api/` 路径；也可以通过 `https://backend-production-7bb6.up.railway.app` 访问 API 和健康检查接口。本地后端默认地址为 `http://127.0.0.1:8081`，OpenAPI 中的服务器示例使用本地地址。

| 方法与路径                                      | 含义                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/v1/config`                            | 返回与合约核对过的链、抽奖合约、代币、精度、DAO、VRF 适配器、部署区块和确认深度 |
| `GET /api/v1/draws/current`                     | 最近启动的轮次及其索引快照；尚未启动任何轮次时 `draw: null`                     |
| `GET /api/v1/draws/history?limit=20`            | 已确定结果的历史轮次，按新到旧排序；`limit` 默认 20，范围 1–100                 |
| `GET /api/v1/draws/history?limit=20&cursor=...` | 使用上一页返回的 `nextCursor` 获取下一页；为 null 时结束                        |
| `GET /api/v1/draws/{id}`                        | 指定轮次的详情、票号分配和退款状态；ID 为正 uint256 十进制字符串                |
| `GET /healthz`                                  | HTTP 进程存活，不代表索引已经追上链上状态                                       |
| `GET /readyz`                                   | 数据库及近期同步状态是否就绪，返回 HTTP 200 或 503                              |
| `GET /metrics`                                  | Prometheus 文本指标：观察到的区块、已索引区块、索引延迟、失败和重组次数         |

健康检查和指标必须使用后端域名。前端只代理 `/api/`；其他路径返回的前端 HTML 不能当作健康检查结果。

```bash
curl --fail --silent --show-error \
  https://frontend-production-216bb.up.railway.app/api/v1/config
curl --fail --silent --show-error \
  'https://frontend-production-216bb.up.railway.app/api/v1/draws/history?limit=2'
curl --fail --silent --show-error \
  https://backend-production-7bb6.up.railway.app/readyz
```

## 如何理解响应

- 金额和 uint256 ID 均为**十进制字符串**，不要转换为浮点数计算。当前代币精度为 8：`"1000000000"` 表示 **10 USD8**，`"10000000000"` 表示 **100 USD8**。应结合 `tokenDecimals` 使用整数或 BigInt。
- `startTime`、`deadline`、`finalizedAt`、`chainTime` 使用 **Unix 秒级时间戳**；`finalizedAt` 可以为 null。`remainingSeconds` 反映已索引区块的链上时间，不是本机时钟。
- `indexedBlock` 和 `indexedBlockHash` 标识数据快照。`observedHead` 是观察到的链头；`synced` 表示数据是否追上配置确认深度所要求的区块。`synced: false` 的响应可能包含较旧数据；重组恢复期间可能返回 503。
- 比较 API 与合约时，应使用 `blockTag: indexedBlock` 读取合约；直接读取最新区块可能合理地领先于 API。前端使用合约读取判断操作资格，通过 API 获取历史。
- `winnerPrize` 和 `daoFee` 是应付金额；`prizeClaimed` 和 `daoFeePaid` 区分已经支付和仍待领取的款项。无人中奖时，中奖地址为 null，资金滚存，不是待领取奖金。
- API 状态为 `ACTIVE`、`DRAWING`、`WINNER_DECLARED`、`COMPLETED`、`NO_WINNER`、`CANCELLED`，分别对应合约中的数字 0–5。PRD 中的“可开奖”表示计算得到的资格，不是额外存储状态。

## 错误处理

ID、游标或数量参数不合法返回 400；格式正确但不存在的轮次返回 404；浏览器来源不在允许列表中返回 403；数据库或恢复异常返回 503。错误响应包含 `error.message`、`error.requestId`，并带有 `X-Request-ID` 响应头。就绪接口使用独立的 `ready`/`sync` 响应结构。API 不接受购票、铸币、开奖或领奖的 POST 请求。

[评审快照](review-snapshot.json)是一次只读检查的时间记录，不保证今天仍具有相同的奖池或人数。
