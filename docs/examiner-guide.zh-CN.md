# 评审指南

[English](examiner-guide.md) | [简体中文](examiner-guide.zh-CN.md) | [文档目录](README.md)

## 评审内容

DLottery 展示 Solidity 抽奖合约、真实 Chainlink VRF 随机数、被动式 Go/PostgreSQL 事件索引服务，以及 React 钱包交互界面。源码：[dreamerinsgp/DLottery](https://github.com/dreamerinsgp/DLottery)。在线应用：[打开 DLottery](https://frontend-production-216bb.up.railway.app)。

购票资产是可铸造的测试代币。Sepolia ETH 用于支付链上交易手续费，测试 USD8 用于购票。评审不需要应用账号、后端凭据或部署者私钥。

## 不连接钱包也能评审

1. 打开应用，查看当前轮次、奖池、参与人数和票号分配。
2. 打开 **Past draws（历史开奖）**，选择历史轮次，查看结果和票号分配。
3. 对照[当前轮次 API](https://frontend-production-216bb.up.railway.app/api/v1/draws/current)和[历史 API](https://frontend-production-216bb.up.railway.app/api/v1/draws/history)检查页面数据。
4. 在[部署记录](sepolia-assessment.zh-CN.md)中查看合约地址、源码验证和交易链接；在[验证记录](validation.zh-CN.md)中区分本地测试与真实测试网证据。

公网状态会变化。最初“第 2 轮已有四人参与”只是一份带时间的快照，不能保证一直保留这个状态。[后续评审快照](review-snapshot.json)记录的是第 3 轮，尚无新参与者，继承了 100 USD8 奖池。实时状态以网页和合约为准。

## 如何参与

| 钱包配置   | 值                                                 |
| ---------- | -------------------------------------------------- |
| 网络       | Ethereum Sepolia                                   |
| Chain ID   | `11155111`                                         |
| 手续费资产 | Sepolia ETH                                        |
| 公共 RPC   | `https://ethereum-sepolia-rpc.publicnode.com`      |
| 区块浏览器 | [Sepolia Etherscan](https://sepolia.etherscan.io/) |

1. 准备一个有 Sepolia ETH 的测试钱包。应用内水龙头只发放 USD8，不发 ETH。如有需要，可通过 [Sepolia 水龙头](https://faucets.chain.link/sepolia)获取 ETH；可用性和领取条件由提供方决定。
2. 选择 Sepolia 网络，点击 **Connect wallet（连接钱包）**。通过 **Switch wallet（切换钱包）**可以选择其他已连接账户。
3. 点击 **Get 1,000 test USD8（领取 1,000 测试 USD8）**，在钱包中确认铸币交易，等待成功提示和余额更新。
4. 当前轮次进行中、尚未到期且仍有名额时，点击 **Buy one ticket（购买一张票）**。如需授权，先确认 **10 USD8 授权交易**；授权确认后，再确认**购票交易**。仅完成授权不代表已经参加抽奖。
5. 等待 **“Ticket … is yours”** 提示，并在分配表中确认自己的钱包地址。每个钱包每轮仅能购买一张票。票号按顺序分配，不能自行选择。

部署钱包 `0x63d5…62FB` 参与过最初的演示。如果使用此钱包，请先查看它在当前轮次是否已经购票。每个新轮次都会重新计算参与资格。

## 开奖、领奖与退款

- 达到 **5 位参与者**后，任何已连接且有手续费的钱包都可以立即点击 **Perform lottery draw（执行开奖）**。否则需要等到该轮的 **24 小时截止时间**。最低参与人数为 **2**，但只有两人并不能提前开奖。
- 点击按钮会提交交易。随机数请求上链后，还需要等待 Chainlink 异步回调；请求确认不等于已经产生最终结果。请等待轮次卡片更新。
- 幸运号码范围为 **1–10**。满员时只有 **1–5** 被分配。若号码匹配，中奖钱包可点击 **Claim your prize（领取奖金）**。DAO 收取中奖者净利润的 5%，不对中奖者原始的 10 USD8 票款收取这笔费用。
- 若抽中未分配号码，结果为 **NO_WINNER（无人中奖）**，整个奖池滚入下一轮。此结果不产生可领取奖金，也不退还票款。
- 到期时少于两位购票者，需要有人执行结算交易，轮次才会取消。参与者可以点击 **Claim refund — 10 USD8（退还 10 USD8）**。继承的滚存资金仍留给后续轮次。
- 轮次结果确定后，点击 **Start next draw（开始下一轮）**。旧轮次尚未领取的奖金或退款，仍可通过历史详情领取。

公网链时间不能用本地演示工具快进，随机结果也不能指定。如果需要快速、可重复地演示中奖或退款分支，请使用 [README](../README.zh-CN.md) 中独立的本地环境。

## 常见问题

| 现象                 | 检查方法                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| 无法点击购票         | 检查钱包是否连接、轮次是否进行中、是否到期、人数是否已满，以及当前钱包是否已有票                         |
| 手续费不足           | 补充 Sepolia ETH；测试 USD8 不能支付 gas                                                                 |
| 授权成功但没有票     | 还需要确认后续的购票交易                                                                                 |
| 看不到 USD8 余额     | 确认铸币交易成功、当前账户和网络正确，然后刷新                                                           |
| 提示网络不匹配       | 切换到 Ethereum Sepolia；其他 EVM 网络的余额和合约不是这里的部署                                         |
| 人数不足五人         | 等待页面显示的截止时间，或由不同钱包参与；仅达到最低人数不能提前开奖                                     |
| 一直显示开奖中       | 等待 VRF；若长时间未完成，把轮次 ID 和请求交易哈希交给维护者检查订阅资金及服务状态                       |
| 已有随机结果但未送达 | **Retry delivery of a ready result（重试发送已有结果）**只重新发送已保存的随机数，不重新抽取             |
| 交易确认但历史未更新 | 查看交易回执，等待三个区块确认及索引同步后刷新，不要重复已完成的购票                                     |
| RPC/API 暂时不可用   | 稍后重试并检查[就绪状态](https://backend-production-7bb6.up.railway.app/readyz)；公共 RPC 可能超时或限流 |

## 范围与证据

已记录的部署演示验证了购票、VRF 回调、滚存和水龙头。领奖及取消退款在本地验证，未纳入该次公网演示。该 MVP 没有外部安全审计、自动开奖调度器或管理员指定随机结果的功能。若 VRF 永久不返回结果，该轮会保持等待状态。[架构说明](architecture.zh-CN.md)和[运维指南](operations.zh-CN.md)解释了相关设计。

可重复测试方法见 [README](../README.zh-CN.md) 和[验证记录](validation.zh-CN.md)。提交材料不要包含私钥或 `.env`。另附[提交说明模板](submission-template.zh-CN.md)和可选的[录屏脚本](demo-recording.zh-CN.md)。
