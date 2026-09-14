# DLottery documentation / DLottery 文档目录

Start with the examiner guide. Each maintained project guide has an English and a Simplified Chinese version. Commands, identifiers, addresses and shared evidence use the same values in both languages.

建议先阅读评审指南。项目说明文档均提供英文和简体中文版本；命令、接口标识、合约地址和证据文件共用同一套数据。

| Document / 文档                                                      | English                                      | 简体中文                                        |
| -------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Project overview and local setup / 项目概览与本地运行                | [README](../README.md)                       | [README](../README.zh-CN.md)                    |
| Examiner walkthrough and troubleshooting / 评审操作与常见问题        | [Examiner guide](examiner-guide.md)          | [评审指南](examiner-guide.zh-CN.md)             |
| Contract addresses, deployment and evidence / 合约、部署与证据       | [Sepolia assessment](sepolia-assessment.md)  | [Sepolia 部署记录](sepolia-assessment.zh-CN.md) |
| Architecture, accounting and trust boundaries / 架构、记账与权限边界 | [Architecture](architecture.md)              | [架构说明](architecture.zh-CN.md)               |
| Test coverage and limitations / 测试覆盖与限制                       | [Validation](validation.md)                  | [验证记录](validation.zh-CN.md)                 |
| API usage and data meanings / API 使用与字段含义                     | [API guide](api-guide.md)                    | [API 指南](api-guide.zh-CN.md)                  |
| Configuration, deployment and recovery / 配置、部署与故障恢复        | [Operations](operations.md)                  | [运维指南](operations.zh-CN.md)                 |
| Assessment requirements / 考核需求                                   | [Original PRD](PRD.md)                       | [PRD 参考译文](PRD.zh-CN.md)                    |
| Ready-to-copy submission message / 可复制的提交说明                  | [Submission message](submission-template.md) | [提交说明](submission-template.zh-CN.md)        |
| 2–3 minute demonstration plan / 2–3 分钟演示录屏脚本                 | [Recording script](demo-recording.md)        | [录屏脚本](demo-recording.zh-CN.md)             |

## Shared evidence / 共用证据

- [OpenAPI schema](openapi.json): machine-readable API contract / 机器可读的接口定义。
- [Sepolia evidence](sepolia-evidence.json): deployment transactions, source verification and the original validation snapshot / 部署交易、源码验证与初次验证快照。
- [Review snapshot](review-snapshot.json): dated, read-only API and readiness observations; not live state / 带时间的只读 API 和就绪检查记录，不代表实时状态。
- [Desktop screenshot](desktop.png) and [mobile screenshot](mobile.png): earlier local validation images, not a recording of current Sepolia state / 早期本地验证截图，不代表当前 Sepolia 状态。

The video document is a script; a video has not been recorded or attached. English UI labels are preserved in the Chinese instructions so reviewers can find the actual buttons. Documentation translation does not translate the application UI. The supplied English PRD remains the requirements reference. Vendored Chainlink source comments, provenance notice and license remain in their original form; they are not maintained project-guide translations.

录屏文档仅为脚本，尚未录制或附加视频。中文操作说明保留页面上的英文按钮名称，方便对照。文档双语化不改变应用界面的语言。需求以提供的英文 PRD 为参考。Chainlink 第三方源码注释、来源声明及许可证保留原文，不纳入项目指南的翻译范围。

These documents do not require private keys, seed phrases, `.env`, local wallet files, database credentials or Railway access to review. / 评审无需获取私钥、助记词、`.env`、本地钱包文件、数据库凭据或 Railway 管理权限。
