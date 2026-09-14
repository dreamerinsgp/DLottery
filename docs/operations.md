# Running and operating DLottery

## Local development

The simplest setup is `npm ci && npm run demo` from the repository root. The helper requires Linux x64 and Go/Node, uses loopback-only services, and does not require a system PostgreSQL installation. The optional bundled PostgreSQL distribution is test tooling, not the production database image.

Default ports are 8545 (chain), 55432 (database), 8081 (backend) and 5173 (frontend). `npm run verify` uses 18545, 55435, 18081 and 15173, respectively. Backend tests use 55434. The helpers refuse occupied ports and stop only processes they start. Logs and deployment manifests live under `.local/<stack>/`.

For manual service startup:

```bash
npm run build
npm run chain
# In another terminal:
npm run deploy:local
# Start a PostgreSQL instance, then from backend/:
DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=disable' \
  RPC_HTTP_URL=http://127.0.0.1:8545 CONFIRMATIONS=0 go run ./cmd/server
# In another terminal, from the repository root:
npm run dev
```

The `DATABASE_URL` above is a placeholder, not a bundled account. Outside the local helper, provision your own PostgreSQL user and database. Schema creation runs transactionally and idempotently at backend startup. No database-reset command is part of service startup.

## Docker

`docker compose up --build` starts the local fixture stack. PostgreSQL is persistent in the `database` volume. The manifest is passed between the deployer and backend through the `deployment` volume. Frontend `/api` requests go through nginx to the backend; the browser connects directly to the host-published EVM RPC for contract reads.

The chain is in-memory. For a clean demonstration, stop the full stack with `docker compose down` and start it again; the one-shot deployer recreates the contracts. The indexer reconciles retained SQL data against the new chain. A simple backend restart preserves and resumes the indexed cursor.

The backend runs as an unprivileged user and exposes built-in `/healthz` and `/readyz` probes. Container `healthcheck` mode queries readiness and exits without starting another indexer. Compose publishes only loopback ports and does not publish the database port.

## Configuration

| Variable | Use |
| --- | --- |
| `DEPLOYMENT_FILE` | JSON manifest; default `../shared/deployment.json` when running from `backend/` |
| `CHAIN_ID`, `LOTTERY_ADDRESS`, `DEPLOYMENT_BLOCK` | Override manifest identity/start block |
| `RPC_HTTP_URL` | Backend/deployment RPC endpoint; keep any API key server-side |
| `DATABASE_URL` | Required PostgreSQL DSN; enable appropriate TLS for a remote database |
| `CONFIRMATIONS` | Backend block buffer; default 2, local fixture 0; public value must be chosen for the chain |
| `POLL_INTERVAL_MS` | 50–30000 milliseconds; default 2000 |
| `PORT` | HTTP listen port; default 8081 |
| `CORS_ORIGINS` | Comma-separated exact browser origins |
| `VITE_RPC_URL` | Public browser RPC URL; build-time setting |
| `VITE_API_URL` | Optional browser API base; empty uses same-origin proxy |
| `API_PROXY_TARGET` | Vite development proxy or nginx runtime upstream; Docker default `http://backend:8081`, Railway `http://backend.railway.internal:8081` |
| `VITE_TEST_TOKEN_ADDRESS` | Optional build-time faucet address; enabled only for that exact mintable token on Sepolia |

The backend checks RPC chain ID, lottery bytecode and token/provider/DAO configuration using the actual contract before serving. It does not trust token decimals supplied by a client. The private key variable is recognized only by the contract deployment toolchain.

## Public testnet checklist and commands

The implementation supports the VRF v2.5 subscription request ABI. Obtain current coordinator/key-hash/support information from [Chainlink's supported networks](https://docs.chain.link/vrf/v2-5/supported-networks) and follow its [subscription setup](https://docs.chain.link/vrf/v2-5/subscription/create-manage).

1. Select Sepolia (chain 11155111) or BSC testnet (chain 97). The deployment script refuses mainnet and other public chains.
2. Provision a conventional USD8-compatible ERC20 and confirm its decimals/transfer behavior. Local mintable fixtures are not a production token.
3. Create and fund a VRF subscription, select the correct key hash/confirmations and allocate callback gas. The template uses 500,000 gas as a starting value; verify that value against the coordinator and actual fulfillment behavior.
4. Export the values in `deploy/testnet.env.example` into the deployment terminal. Keep the funded deployer key in your local secret store/environment.
5. Run `npm run build` and `npm run deploy:testnet -w contracts`. Save the public manifest and deployment transaction receipts.
6. Register the exported `randomnessProvider` address as a consumer of the funded subscription. Binding the lottery in the adapter does not register it in the subscription.
7. Start the backend with the public manifest, RPC, database and a chain-appropriate confirmation setting. Configure the frontend's public RPC and API origin for the same network.
8. Verify readiness, read the current round, approve/buy using a funded test wallet, fill or wait for eligibility, request the draw, and verify actual provider fulfillment. Claim if there is a winner; a no-winner outcome rolls forward. Retain transaction hashes and same-block API/contract comparisons.

The subscription owner funds/configures the external VRF service. It cannot change the adapter's immutable coordinator or overwrite an accepted word. Loss of funding or provider availability can stop round progression; there is intentionally no privileged reroll or token-withdrawal workaround.

No public deployment or funding is implied by running local tests. The repository contains everything required to perform deployment once those external inputs exist.

## Failure recovery

| Symptom | Action and expected behavior |
| --- | --- |
| RPC unavailable/rate limited | Inspect RPC connectivity and logs, restore the endpoint; the scanner retries with backoff from the same committed cursor |
| Database unavailable | Restore connectivity; failed block transactions roll back and readiness reports unavailable |
| A handler/ABI decoding error repeats | Compare deployed bytecode/ABI/manifest to this build; fix the mismatch before resuming. Never manually skip the failing height |
| Indexer process crashes | Restart it; the previous block transaction either committed fully or did not commit, and replay is idempotent |
| Reorg detected | Scanner automatically finds the ancestor and rebuilds canonical projections. Check `/readyz`, `/metrics` and backend logs until caught up |
| Writer lock unavailable | Stop the duplicate backend for that deployment; one process owns the indexer lock. A dead lock connection requires restarting that process |
| Transaction mined but history behind | Check the receipt and UI synchronization message; wait for confirmations/indexing rather than sending the same claim again |
| VRF request pending | Check the original request, subscription funding and provider service; do not request new randomness |
| Word stored but lottery not settled | Use `finalizeDraw(drawId)` / retry delivery in the UI; it delivers the stored word, not a new one |
| Prize transfer fails | Check the supported token and DAO recipient; the entire claim reverted and remains claimable |
| Only chain container restarted | Restart the complete local stack so contracts are redeployed; its chain state is ephemeral |

`GET /metrics` reports observed/indexed heights, lag, retry failures and reorgs. `GET /readyz` also reports the last successful scanner pass; readiness becomes false on recovery, lag or prolonged inability to scan. `/healthz` only proves the HTTP process is alive.

## Backups and changes

Back up the PostgreSQL database and public deployment manifest with your normal database tooling. The database can be reconstructed from deployment-block logs as long as the RPC provider retains that history. Keep the immutable deployed ABI and contract source associated with each manifest.

The initial schema is `backend/internal/store/schema.sql`. Future schema changes need versioned migrations; existing table creation is not a general migration engine. Changes to event projections should be validated by replay into an isolated database before switching the service. Upgrading immutable lottery or randomness contracts means a new deployment; existing liabilities remain claimable from their original deployment.
