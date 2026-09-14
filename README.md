# DLottery

An EVM lottery MVP with Solidity contracts, a passive Go/PostgreSQL indexer and REST API, and a React wallet application. Implements the [assessment PRD](docs/PRD.md): 10 USD8 tickets, five participants, one ticket per wallet, ten possible lucky numbers, 24-hour rounds, quorum cancellation, refunds, rollover, and a 5% DAO fee on winner net profit.

**Live Sepolia assessment:** [Open DLottery](https://frontend-production-216bb.up.railway.app). See [examiner instructions and deployment details](docs/sepolia-assessment.md). The demo uses mintable test USD8 and real Chainlink VRF.

## Run the local application

Prerequisites: Node.js 22+, npm, Go 1.24+, and Linux x64 for the bundled local PostgreSQL helper. Docker Compose is an alternative on other platforms.

```bash
npm ci
npm run demo
```

If port 5173 is occupied, run `DEMO_WEB_PORT=5174 npm run demo` and open **http://127.0.0.1:5174**.

Open **http://127.0.0.1:5173**. The command builds the app, starts a private local PostgreSQL instance and Hardhat chain, deploys fixtures, funds the first six local test accounts with 1,000 USD8 each, and starts the backend/frontend. Logs and database files are under `.local/demo/`. Ctrl+C stops the services. It refuses to take over occupied ports.

Connect an EVM wallet to chain **31337**, RPC **http://127.0.0.1:8545**, currency **ETH**. Import a standard Hardhat test account from `.local/demo/chain.log` into a separate test wallet. These publicly known accounts are for this local chain only. `USD8` is an eight-decimal mock token locally; the deployed contract reads the actual token decimals on other networks.

1. Connect the wallet and buy a ticket. Approve 10 USD8 when requested, then confirm the purchase.
2. Run `npm run demo:fill` to buy the remaining tickets using local fixture accounts, or connect more wallets manually.
3. Click **Perform lottery draw**. Local randomness is deliberately manual: run `npm run demo:draw -- 1` to choose lucky number 1, or `npm run demo:draw -- 10` for an unassigned number.
4. Claim the prize if your wallet won, or start the next round to carry the pool forward.
5. To demonstrate cancellation, start an empty round, buy fewer than two tickets, and run `npm run demo:draw`. The helper advances the local clock to the deadline and settles. Claim refunds from the current card or a historical draw.

The demo helper refuses public chains. Public deployment uses verifiable randomness; users cannot select its result. The backend never signs transactions or moves funds.

## Docker Compose

```bash
docker compose up --build
```

Open **http://127.0.0.1:8080**. This starts PostgreSQL, a local chain, a one-shot deployer, the Go service and nginx/frontend. API: `http://127.0.0.1:8081`; wallet RPC: `http://127.0.0.1:8545`. The local credentials in Compose are demo-only and the published ports bind to loopback.

To use host demo helpers with this stack, first export its public manifest:

```bash
docker compose cp deployer:/runtime/deployment.json shared/deployment.json
npm run demo:fill
npm run demo:draw -- 1
```

Use `docker compose down` and then `docker compose up` for a fresh local chain/deployment. The indexer reconciles the retained database against the new canonical chain. Restarting only the in-memory chain erases its contracts; restart the complete stack to redeploy them. See [operations.md](docs/operations.md).

## Verify everything

```bash
npx playwright install chromium
npm run verify
```

`verify` builds, runs contract tests and PostgreSQL-backed Go tests with the race detector, starts an isolated stack on separate ports, executes real transaction/indexer integration tests, restarts the backend, and runs Chromium wallet-flow tests. It stops the isolated services afterward. It never connects to a public chain.

On minimal Linux systems, `npx playwright install --with-deps chromium` installs the required system libraries. The browser runner also honors `PLAYWRIGHT_LIBRARY_PATH` and recognizes an existing `~/.local/lib/chrome` installation.

Individual checks:

| Command | What it checks |
| --- | --- |
| `npm run build` | Contract compile, shared ABI export, TypeScript and frontend production build |
| `npm test` | Contract suite and real PostgreSQL-backed Go tests |
| `npm run test:backend` | Starts an isolated local database and runs Go tests with `-race`; honors `TEST_DATABASE_URL` |
| `npm run test:e2e` | Real local transactions, all result branches, reorg rollback and pagination against a running fresh demo |
| `npm run test:browser` | Wallet UI flow against a running demo with an empty active round |
| `cd backend && go vet ./...` | Go static checks |

For non-Linux hosts, supply `TEST_DATABASE_URL` to a disposable PostgreSQL database for backend tests. The full automatic `verify`/`demo` stack helper currently targets Linux x64; the app services themselves are containerized. Never point test fixtures at a production database.

## Project layout

| Directory | Responsibility |
| --- | --- |
| `contracts/` | DLottery, immutable-coordinator VRF adapter, local fixtures, tests and deployment |
| `backend/` | Go RPC scanner, SQL projections, rollback/replay and REST service |
| `frontend/` | React/TypeScript wallet UI and browser tests |
| `shared/` | Exported contract ABIs; generated deployment manifest is ignored by Git |
| `deploy/` | Dockerfiles, nginx and environment templates |
| `scripts/` | Local setup, deterministic demos and full-stack verification |
| `docs/` | PRD, architecture, OpenAPI, operational instructions and validation evidence |

## API

- `GET /api/v1/config` — verified deployment/token configuration.
- `GET /api/v1/draws/current` — current/latest draw, all ten ticket positions, result and synchronization metadata.
- `GET /api/v1/draws/history?limit=20&cursor=...` — finalized outcomes, newest first; cursor pagination.
- `GET /api/v1/draws/{id}` — historical details, tickets and refund flags.
- `GET /healthz`, `GET /readyz`, `GET /metrics` — process health, database/indexer readiness and metrics.

Token amounts and draw/request IDs are decimal strings in base units. API state is identified by its indexed block/hash and chain timestamp. The browser reads the contract for current action eligibility, so an indexer delay does not undo a mined transaction. See [OpenAPI](docs/openapi.json).

## Testnet deployment

The scripts support Sepolia (11155111) and BSC testnet (97). Supply a funded deployer, an existing conventional USD8-compatible ERC20, DAO address and funded VRF v2.5 subscription configuration in your local environment; use [the environment template](deploy/testnet.env.example).

```bash
npm run build
# Export the private deployment configuration in your shell first.
npm run deploy:testnet -w contracts
```

The script deploys the adapter and lottery, binds them once, starts a round and exports `shared/deployment.json`. **Add the adapter address as a consumer of the funded VRF subscription before performing a draw.** Configure the backend and browser RPC for that same chain, and choose a suitable confirmation depth. Detailed steps and configuration are in [operations.md](docs/operations.md).

A new public testnet deployment requires those external accounts/configuration. The existing live assessment deployment and its verification records are documented in [sepolia-assessment.md](docs/sepolia-assessment.md). Docker images/Compose are provided; local validation evidence is recorded in [validation.md](docs/validation.md).

## Design decisions

Tickets are assigned sequentially from 1; the lucky number spans all 1–10. The minimum participant count is configurable at deployment (default 2). A settled outcome permits a new round even before old prizes/refunds are claimed. Cancellation refunds only the current round's principal and carries inherited rollover forward. These resolve gaps in the PRD and are covered by tests.

The contracts are non-upgradeable. There is no backend signer, arbitrary cancellation, administrator-selected result, randomness reroll, or withdrawal of lottery liabilities. Oracle failure leaves a draw pending; an already received VRF word can be delivered again without requesting new randomness. See [architecture.md](docs/architecture.md) for accounting and recovery details.
