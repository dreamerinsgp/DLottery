# Examiner submission message

[English](submission-template.md) | [简体中文](submission-template.zh-CN.md) | [Documentation](README.md)

Copy the message below into your submission. No message has been sent automatically. Add your own name, assessment reference, and a video link only if you have recorded one.

---

**Subject: DLottery assessment submission — source, live Sepolia demo and verification evidence**

Hello,

Please find my DLottery assessment submission:

- **Source code:** https://github.com/dreamerinsgp/DLottery
- **Live application:** https://frontend-production-216bb.up.railway.app
- **English examiner guide:** https://github.com/dreamerinsgp/DLottery/blob/main/docs/examiner-guide.md
- **Chinese examiner guide:** https://github.com/dreamerinsgp/DLottery/blob/main/docs/examiner-guide.zh-CN.md
- **Contracts and deployment report:** https://github.com/dreamerinsgp/DLottery/blob/main/docs/sepolia-assessment.md
- **Transaction/source-verification evidence:** https://github.com/dreamerinsgp/DLottery/blob/main/docs/sepolia-evidence.json
- **Architecture and tests:** https://github.com/dreamerinsgp/DLottery/blob/main/docs/README.md

The project includes Solidity lottery contracts, real Chainlink VRF v2.5 randomness on Ethereum Sepolia, a Go/PostgreSQL indexer and REST API, and a React wallet application hosted on Railway.

You can inspect current and historical results without connecting a wallet. To participate, use Ethereum Sepolia (chain ID 11155111) with Sepolia ETH for gas, connect a wallet, click **Get 1,000 test USD8**, and approve/buy a 10 USD8 ticket. The in-app faucet supplies test USD8, not ETH. Each wallet may buy one ticket per round. A draw can be requested at five participants or after the 24-hour deadline; a minimum quorum of two alone does not enable an early draw.

The recorded public walkthrough completed a real VRF request and fulfillment: lucky number 9 rolled the pool forward. Contract tests, PostgreSQL-backed Go tests, production builds, desktop/mobile checks and a live browser faucet transaction passed. The deployment report distinguishes these checks from local-only prize/refund coverage. Three contract sources were verified with exact matches on Sourcify; Etherscan's automatic source submission encountered a daily quota.

This is a testnet MVP using mintable test tokens. Public state changes, so please follow the current round rather than assuming a pre-filled demo round remains available. Randomness is asynchronous and depends on the VRF service and subscription funding. No private keys, secret configuration or administrative access are required for review.

Thank you for reviewing my submission.

---

## Before sending

- Open the source and documentation links as the examiner would; grant repository access if needed.
- Confirm the website and backend readiness are reachable and the subscription has a sufficient reserve.
- Share a wallet address only if arranging test ETH funding; never send private keys, seed phrases, `.env` or generated wallet files.
- If attaching a video, use the [recording script](demo-recording.md). No finished recording is included in this repository.
