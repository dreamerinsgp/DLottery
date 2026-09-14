# Examiner guide

[English](examiner-guide.md) | [简体中文](examiner-guide.zh-CN.md) | [Documentation](README.md)

## What to review

DLottery demonstrates a Solidity lottery, real Chainlink VRF, a passive Go/PostgreSQL event indexer, and a React wallet interface. Source: [dreamerinsgp/DLottery](https://github.com/dreamerinsgp/DLottery). Live application: [Open DLottery](https://frontend-production-216bb.up.railway.app).

The ticket asset is a mintable test token. Sepolia ETH pays transaction gas; test USD8 buys tickets. No application login, backend credentials or deployer key is needed.

## Review without a wallet

1. Open the application. Inspect the current round, pool, participant count and ticket allocation.
2. Open **Past draws**. Select a historical round to inspect its result and allocations.
3. Compare the result with the [current API](https://frontend-production-216bb.up.railway.app/api/v1/draws/current) and [history API](https://frontend-production-216bb.up.railway.app/api/v1/draws/history).
4. Use the [deployment report](sepolia-assessment.md) for contract addresses, source verification and transaction links. Use [validation](validation.md) for the distinction between local tests and live testnet evidence.

Live state changes. The original four-player round 2 was only a dated snapshot; do not assume a pre-filled round remains available. The [later review snapshot](review-snapshot.json) records round 3 with no new participants and 100 USD8 rollover. The website and contract determine the current state.

## Join a round

| Wallet setting | Value                                              |
| -------------- | -------------------------------------------------- |
| Network        | Ethereum Sepolia                                   |
| Chain ID       | `11155111`                                         |
| Gas currency   | Sepolia ETH                                        |
| Public RPC     | `https://ethereum-sepolia-rpc.publicnode.com`      |
| Explorer       | [Sepolia Etherscan](https://sepolia.etherscan.io/) |

1. Use a test wallet with Sepolia ETH. The in-app USD8 faucet does not supply ETH. If necessary, obtain ETH through a [Sepolia faucet](https://faucets.chain.link/sepolia); availability and eligibility are controlled by that provider.
2. Select Sepolia, then click **Connect wallet**. **Switch wallet** lets you choose another connected account.
3. Click **Get 1,000 test USD8** and confirm the mint transaction. Wait for the success message and balance update.
4. During an active, unexpired round with an available ticket, click **Buy one ticket**. Confirm the **10 USD8 approval** if needed; after it confirms, confirm the **ticket purchase**. Approval alone does not enter the draw.
5. Wait for **“Ticket … is yours”** and verify the wallet appears in the allocation table. Only one ticket is allowed per wallet in each round. Tickets are assigned sequentially; the examiner does not choose a number.

The deployment wallet `0x63d5…62FB` participated in the initial demonstration. If using that wallet, inspect its participation in the current round before attempting another purchase. Participation restrictions reset for each new round.

## Check transactions

- After submitting an action, click **View on Etherscan** beside its transaction hash. This link appears while confirmation is pending and updates if the wallet speeds up the transaction successfully.
- Open **Transactions / Check transactions** near the bottom of the page. Paste a Sepolia transaction hash (0x followed by 64 hexadecimal characters) and click **Open transaction** to inspect it on Etherscan without connecting a wallet.
- **Lottery contract activity** shows transactions involving the lottery; **USD8 token transfers** shows token activity. Connect a wallet to use **My wallet activity**, which includes that wallet's activity beyond DLottery.
- Check Etherscan for status, sender, gas fees and token transfers. Approval and ticket purchase have different hashes. The app displays the latest submitted hash; use wallet activity to find earlier transactions. A VRF request and its later fulfillment are also separate transactions. Very recent transactions may not appear immediately.
- Explorer links are available for the Sepolia deployment only; the local demo has no public explorer.

## Draw, prize and refund

- At **five participants**, anyone with a connected wallet and gas can click **Perform lottery draw** immediately. Otherwise wait until the round's **24-hour deadline**. The minimum quorum is **two**; two buyers alone do not enable an early draw.
- The button submits a transaction. A successful randomness request is followed by asynchronous Chainlink fulfillment; it is not yet a final result. Wait for the draw card to update.
- The lucky number ranges from **1–10**. In a full round only **1–5** are assigned. A match declares a winner; **Claim your prize** is available to that wallet. The DAO receives 5% of the winner's net profit, excluding the winning ticket's 10 USD8 principal.
- An unassigned lucky number gives **NO_WINNER** and rolls the entire pool forward. No prize or ticket refund is available for that outcome.
- After timeout, fewer than two buyers causes cancellation when someone performs settlement. Each participant can use **Claim refund — 10 USD8**. Inherited rollover remains available to a later round.
- After a settled outcome, **Start next draw** opens another round. Old eligible prizes/refunds can still be claimed through historical details.

Public chain time cannot be advanced by the demo tools, and randomness cannot be selected. For quick, repeatable demonstrations of winner/refund branches, use the separate local setup in [README](../README.md).

## Troubleshooting

| Symptom                               | Check                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Buy button unavailable                | Wallet connected, active round, remaining time, fewer than five buyers, and no ticket already owned by that wallet                          |
| Insufficient gas                      | Supply Sepolia ETH; test USD8 cannot pay gas                                                                                                |
| Approval succeeded but no ticket      | Confirm the subsequent purchase transaction                                                                                                 |
| USD8 balance missing                  | Ensure the mint confirmed and the selected wallet/network matches; refresh                                                                  |
| Wrong network prompt                  | Select Ethereum Sepolia; other EVM networks use different balances and contracts                                                            |
| Fewer than five participants          | Wait for the displayed deadline or arrange distinct participating wallets; no early draw at quorum alone                                    |
| Drawing in progress                   | Wait for VRF. If prolonged, provide the round ID and request transaction hash to the operator to check subscription funding/provider status |
| Result received but delivery failed   | **Retry delivery of a ready result** retries the stored word; it does not request new randomness                                            |
| Transaction confirmed, history behind | Check the receipt, allow three block confirmations and indexing, then refresh; do not repeat a completed purchase                           |
| RPC/API temporarily unavailable       | Retry and inspect [readiness](https://backend-production-7bb6.up.railway.app/readyz); shared public RPCs may time out or limit requests     |

## Scope and evidence

The recorded deployment walkthrough demonstrated purchases, VRF fulfillment, rollover and the faucet. Prize claims and cancellation/refunds were validated locally, not as part of that recorded public walkthrough. This MVP has no external security audit, automatic draw scheduler, or administrator randomness override. A permanently unfulfilled VRF request leaves its round pending. [Architecture](architecture.md) and [operations](operations.md) explain these choices.

For reproducible testing, follow [README](../README.md) and [validation](validation.md). No private key or `.env` should be included in an examiner submission. See the [submission message](submission-template.md) and optional [video script](demo-recording.md).
