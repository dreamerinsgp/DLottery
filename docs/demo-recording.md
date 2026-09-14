# 2–3 minute demonstration recording script

[English](demo-recording.md) | [简体中文](demo-recording.zh-CN.md) | [Documentation](README.md)

This is a recording plan, not an existing video or a claim that every branch was exercised on Sepolia. Use a screen recorder and the live application. Do not show secret configuration, private keys, seed phrases or local wallet files.

## Suggested sequence

| Time      | Screen/action                                                                        | Suggested narration                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:20 | Repository README and live website                                                   | “DLottery combines Solidity contracts, real Chainlink VRF, a Go/PostgreSQL indexer and a React wallet interface. This deployment runs on Ethereum Sepolia.”                                            |
| 0:20–0:40 | Current round, pool and allocation table                                             | “A ticket costs 10 test USD8. There are at most five participants, one ticket per wallet, and ten possible lucky numbers.”                                                                             |
| 0:40–1:15 | Connect a Sepolia wallet; mint test USD8; approve and buy if an entry is available   | “Sepolia ETH pays gas. This faucet supplies test USD8. Approval allows the token transfer; the following purchase transaction actually records my ticket.”                                             |
| 1:15–1:45 | If eligible, request a draw; otherwise explain eligibility and open recorded round 1 | “A draw is eligible at five buyers or after 24 hours. Chainlink fulfills the request asynchronously. I cannot choose the result.”                                                                      |
| 1:45–2:15 | Past draws and recorded request/fulfillment transaction links                        | “The recorded first draw produced 9, an unassigned number, so 50 USD8 rolled forward. A matching ticket would allow its owner to claim the prize.”                                                     |
| 2:15–2:40 | Architecture diagram, API result, test evidence and source-verification links        | “The backend indexes events and does not sign or move funds. The API exposes its indexed block, and the contract remains authoritative. The documentation separates public evidence from local tests.” |
| 2:40–3:00 | Examiner guide and final links                                                       | “The bilingual guides contain setup steps, addresses, evidence, troubleshooting and known limitations.”                                                                                                |

## Handling timing and different outcomes

Wallet confirmations and VRF can take longer than the video. Record the whole operation first, then trim idle time with an explicit “waiting for confirmation/VRF” transition. Never present a pending request as a completed result or a local mock as public VRF.

If there are fewer than five buyers before the deadline, do not alter the contract or suggest it can draw early at two. Show the existing completed history and its transaction evidence instead. If the current round is full or closed, use its result/history and wait for an eligible new round before recording a purchase.

For a live winner, show **Claim your prize** and its confirmed receipt. For a no-winner outcome, show rollover. For cancellation, show a participant refund only after timeout and settlement. Do not imply the initial public walkthrough tested prize/refund branches: those were validated locally.

Optional deterministic branch demonstrations use `npm run demo`, `npm run demo:fill`, and `npm run demo:draw -- 1` or `-- 10`. Clearly label these as **local chain 31337 with mock randomness**. The local helpers refuse public chains.

## Deliverable

Export a readable MP4 or a viewable link. Keep the URL, network, transaction confirmation and evidence legible. Test the sharing permissions. Add the real recording link to the [submission message](submission-template.md); no recording URL is provided until a recording exists.
