# Validation evidence

Implementation validated locally on 2026-09-08 with Node.js 22.22.3, Go 1.26.7, Solidity 0.8.24/Hardhat, PostgreSQL 18.4 test tooling and Chromium through Playwright. Local fixtures use chain ID 31337 and an eight-decimal USD8 token.

## Completed checks

| Check | Result |
| --- | --- |
| Contract compile and ABI export | Passed; the browser and embedded Go ABI come from the same artifacts |
| Contract suite | 17 tests passed |
| Go/PostgreSQL suite | 9 tests passed with the race detector, against a real database |
| Go static analysis | `go vet ./...` passed |
| Backend container-style build | `CGO_ENABLED=0 go build` passed |
| Frontend production build | TypeScript and Vite build passed |
| Full-stack integration | Real ERC20 purchases, all outcome branches, canonical reorg recovery, history pagination and backend restart passed |
| Browser integration | Wallet connection, network switching, rejection, real fee-replaced approval/purchase, draw/claim, account changes, historical refunds and responsive layout passed |
| Compose configuration | `docker compose config --quiet` passed using the available Docker CLI |
| Formatting | Prettier checks and Go formatting applied |
| Documented local startup | `npm run demo` built, deployed, and reported ready on the default ports |

The full `npm run verify` pipeline starts its own isolated chain/database/backend/frontend and stops them afterward. Browser tests inject an EIP-1193 wallet fixture backed by actual unlocked local EVM accounts; they do not mock the lottery contract or REST responses. Screenshots are [desktop.png](desktop.png) and [mobile.png](mobile.png).

## Roadmap acceptance coverage

| Cases | Evidence |
| --- | --- |
| A01–A05: configuration, purchase, uniqueness, capacity and deadlines | Contract tests cover invalid configuration/IDs, failed balance or allowance, exact token receipt, duplicate wallets, sixth participant and exact deadline boundaries |
| A06–A07: cancellation and quorum | Empty and one-participant cancellation/refund tests; two-participant timeout settlement |
| A08–A09: winner fees and PRD example | Full pool 50 / fee 2 / winner 48; real rollover generates pool 70 / fee 3 / winner 67 |
| A10–A12: rollover and old liabilities | No-winner, rollover through cancellation, new rounds before old claims, historical refunds and conservation checks |
| A13: randomness | Foreign/duplicate callback rejection or idempotence, locked inputs, pending state, stored-word delivery after a failed callback without reroll |
| A14: arithmetic and transfer attacks | Low-decimal rounding, donations, taxed inbound transfers, failed DAO transfer rollback, reentrant token fixture and multi-round accounting |
| A15–A16: event correctness and idempotence | All six required events plus request event decode/project; duplicate event and block delivery do not change totals; uint256 precision reaches the maximum value |
| A17: durable progress | A deliberately invalid event rolls back all block effects and the cursor; retry succeeds; RPC outage preserves progress; reopening the store and restarting the live backend retain state |
| A18: reorgs | Synthetic fork/head-decrease cases and a live `evm_snapshot`/`evm_revert` that orphans a prize claim, restores claimability, and converges to the replacement chain |
| A19: query service | Current/detail/history, empty state, pagination, null results, invalid parameters, CORS and readiness tests |
| A20–A21: wallet and synchronization | Browser transaction flow, a mined replacement approval, and network/account handling; asynchronous randomness is shown separately from its request receipt; history freshness is identified by indexed block |
| A22: packaging | Native fresh-stack setup and restart passed; container build instructions and Compose configuration provided; daemon/testnet execution limitations below |

## Practical limits of this validation

- Docker's Linux daemon is not available in this WSL session. Compose was parsed/validated, and the backend was built with the container's CGO setting, but Docker images and `docker compose up` were not executed here.
- A funded public testnet deployer, deployed USD8 address, DAO address and VRF subscription settings were not supplied. Public deployment scripts and the production adapter are implemented; live provider fulfillment on Sepolia/BSC testnet has not been exercised. The VRF request/callback ABI and delivery recovery were exercised with a local coordinator fixture.
- Browser automation uses a controlled injected wallet, not a separately installed wallet extension. A public testnet walkthrough should verify the chosen wallet extension, RPC and subscription together.
- This is implementation and test evidence, not an external smart-contract audit. The permanent-provider-outage behavior is documented in [operations.md](operations.md): the original randomness request remains pending, and no privileged reroll exists.
