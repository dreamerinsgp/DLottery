# 评审提交说明模板

[English](submission-template.md) | [简体中文](submission-template.zh-CN.md) | [文档目录](README.md)

可将下方内容复制到提交邮件或评审系统。本模板不会自动发送消息。请自行补充姓名、考核编号；只有完成录屏后才添加视频链接。

---

**主题：DLottery 考核项目提交——源码、Sepolia 在线演示与验证证据**

您好：

现提交 DLottery 考核项目，材料如下：

- **源码：** https://github.com/dreamerinsgp/DLottery
- **在线应用：** https://frontend-production-216bb.up.railway.app
- **英文评审指南：** https://github.com/dreamerinsgp/DLottery/blob/main/docs/examiner-guide.md
- **中文评审指南：** https://github.com/dreamerinsgp/DLottery/blob/main/docs/examiner-guide.zh-CN.md
- **合约与部署记录：** https://github.com/dreamerinsgp/DLottery/blob/main/docs/sepolia-assessment.zh-CN.md
- **交易与源码验证证据：** https://github.com/dreamerinsgp/DLottery/blob/main/docs/sepolia-evidence.json
- **架构与测试文档目录：** https://github.com/dreamerinsgp/DLottery/blob/main/docs/README.md

项目包含 Solidity 抽奖合约、Ethereum Sepolia 上的真实 Chainlink VRF v2.5 随机数、Go/PostgreSQL 索引与 REST API 服务，以及部署在 Railway 上的 React 钱包交互应用。

不连接钱包即可查看当前和历史结果。如需参与，请使用 Ethereum Sepolia（Chain ID 11155111）并准备 Sepolia ETH 支付 gas；连接钱包后点击 **Get 1,000 test USD8**，再授权并购买一张 10 USD8 的票。应用内水龙头只提供测试 USD8，不提供 ETH。每个钱包每轮只能购买一张票。满五人或达到 24 小时截止时间后可以请求开奖；仅达到两人的最低参与人数不能提前开奖。

已记录的公网演示完成了真实 VRF 请求和回调：幸运号码为 9，奖池滚入下一轮。合约测试、真实 PostgreSQL 支持的 Go 测试、生产构建、桌面及手机浏览器检查，以及在线水龙头交易均通过。部署记录明确区分这些检查与仅在本地验证的领奖、退款覆盖。三个合约均在 Sourcify 完成源码精确匹配验证；Etherscan 自动提交源码时遇到了每日额度限制。

这是使用可铸造测试代币的测试网 MVP。公网状态会变化，请按当前轮次操作，不要假设始终存在预先填好人数的演示轮次。随机数异步返回，依赖 VRF 服务及订阅资金。评审无需获取私钥、秘密配置或管理权限。

感谢您审阅。

---

## 发送前检查

- 以评审者身份测试源码和文档链接，必要时授予仓库访问权限。
- 确认网站及后端就绪检查可以访问，VRF 订阅有足够的资金储备。
- 如需安排测试 ETH，仅交换钱包地址；不要发送私钥、助记词、`.env` 或生成的钱包文件。
- 如要附上视频，可参考[录屏脚本](demo-recording.zh-CN.md)。仓库目前没有成品录屏。
