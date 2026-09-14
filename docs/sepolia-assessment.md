# Sepolia assessment deployment

Deployed on 2026-09-14. This assessment uses mintable test USD8 and actual Chainlink VRF v2.5, paid in Sepolia ETH.

## Examiner links

- Application: https://frontend-production-216bb.up.railway.app
- Current draw API: https://frontend-production-216bb.up.railway.app/api/v1/draws/current
- History API: https://frontend-production-216bb.up.railway.app/api/v1/draws/history
- Backend readiness: https://backend-production-7bb6.up.railway.app/readyz
- Railway project: https://railway.com/project/39761d0b-53a6-4ce3-b032-086699e2e8df (owner access)

Viewing results requires no wallet. To participate, connect MetaMask on **Ethereum Sepolia, chain ID 11155111**, with Sepolia ETH for gas. Use **Get 1,000 test USD8**, approve the 10 USD8 ticket price, then buy a ticket. The faucet requires a wallet transaction. Each wallet can buy one ticket per round.

At five participants, anyone can perform the draw immediately. Otherwise it becomes eligible after the 24-hour deadline. Chainlink fulfillment is asynchronous; wait for the result. A lucky number from 1–5 has a ticket owner in a full round, and 6–10 rolls the pool forward. A winner can claim their prize. Results remain visible in Past draws.

At handoff, round **2** has **four participants**, a **90 USD8 pool** (50 rollover + 40 new tickets), and one ticket available. Its deadline is **2026-09-15 08:21 UTC / 16:21 China time**. Use a wallet that has not already entered this round to buy the fifth ticket and trigger an immediate draw. This is live public state and can change before the examiner visits. After the deadline, settle the existing round and start another.

## Confirmed validation

- Production build and all 17 Solidity tests passed.
- PostgreSQL-backed Go tests passed with the race detector.
- Railway readiness returned HTTP 200 with the indexer synchronized and zero recorded failures at validation.
- Five separate wallets approved tokens and purchased tickets in round 1.
- [Real VRF request](https://sepolia.etherscan.io/tx/0x5d82c1a5506107c8e521cc5ae7cdd118b455c8b2f83d0830b2aaf85aea6fec0d) and [fulfillment](https://sepolia.etherscan.io/tx/0xde9587613b44ff2904aaeb4d33dab70c8189d832c399efc72cbf93190cf036da) completed. Lucky number **9** had no ticket owner, so 50 USD8 rolled forward. A public-testnet prize claim was not exercised because this draw had no winner; the local contract suite covers prize claims.
- API round data matched contract reads at the API's indexed block. History shows round 1's result.
- Desktop and mobile browser checks passed with no page errors or horizontal mobile overflow.
- The deployed faucet was exercised through the browser using a restricted wallet bridge. [Its transaction](https://sepolia.etherscan.io/tx/0x2110713a156990e955ae53f5b795c5afa5d7986130130dcb07941e96490e53af) increased the test wallet balance by exactly 1,000 USD8.

See [public deployment and transaction evidence](sepolia-evidence.json). Railway was deployed through CLI uploads. This repository contains the application source, deployment scripts, and examiner documentation; GitHub pushes do not automatically redeploy the current Railway services.

## Contracts

| Contract | Sepolia address |
| --- | --- |
| DLottery | `0x670A8C7D4844D23960fFf8F3841a47AAD559dC7d` |
| USD8 test token | `0x5A3580AC7b927554AA5Ff38B61C91A9078ee496e` |
| VRF adapter | `0x497602A403815dE3415D410170Fd35e58fD64db5` |
| DAO recipient | `0x63d50331c568cE20eecA55fc5AA3E33c0bEC62FB` |

Deployment block: **11701601**. Token decimals: **8**. All three deployed contracts have exact creation/runtime matches on Sourcify:

- [Lottery source](https://sourcify.dev/#/lookup/11155111/0x670A8C7D4844D23960fFf8F3841a47AAD559dC7d)
- [Token source](https://sourcify.dev/#/lookup/11155111/0x5A3580AC7b927554AA5Ff38B61C91A9078ee496e)
- [VRF adapter source](https://sourcify.dev/#/lookup/11155111/0x497602A403815dE3415D410170Fd35e58fD64db5)
- [Lottery transactions on Etherscan](https://sepolia.etherscan.io/address/0x670A8C7D4844D23960fFf8F3841a47AAD559dC7d)

Etherscan's automatic source submission hit its daily quota; Sourcify verification succeeded.

VRF subscription ID: `34892855678778204017201078970598779801487082021592630858904837758082757744851`. The registered consumer is the VRF adapter. Coordinator: `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`. Configuration: 3 request confirmations, 500,000 callback gas, native payment, 500 gwei gas lane. The subscription was funded with a total of 0.5 Sepolia ETH. Maintain enough reserve for future draws; [Chainlink's billing documentation](https://docs.chain.link/vrf/v2-5/billing) explains the maximum-cost reserve.

## Railway configuration

Three services: `Postgres`, `backend`, `frontend`. The backend uses PostgreSQL over private networking and indexes Sepolia with three confirmations, polling every five seconds. One backend replica owns the database indexer lock. The frontend proxies `/api/` to `http://backend.railway.internal:8081`. Public browser reads use `https://ethereum-sepolia-rpc.publicnode.com`.

The deployment key stays in the local `.env`; it is never passed to Railway. The upload staging script excludes `.env`, local generated wallets, build outputs and generated manifests. Backend identity is supplied through `CHAIN_ID`, `LOTTERY_ADDRESS`, and `DEPLOYMENT_BLOCK` variables. PostgreSQL credentials use Railway's reference variable `${{Postgres.DATABASE_URL}}`.

Frontend build variables: `VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com` and `VITE_TEST_TOKEN_ADDRESS=0x5A3580AC7b927554AA5Ff38B61C91A9078ee496e`. Runtime frontend variables: `PORT=8080` and `API_PROXY_TARGET=http://backend.railway.internal:8081`.

To stage a future release, run `node scripts/stage-railway.mjs` from the repository root. It prints a temporary directory containing separate backend/frontend upload roots, each with its `railway.json`. Deploy the desired directory with:

```bash
railway up /printed/staging/path/frontend --path-as-root \
  --project 39761d0b-53a6-4ce3-b032-086699e2e8df \
  --environment production --service frontend --detach
```

Use the backend directory and `--service backend` for backend releases. The backend's exclusive indexer lock means a replacement must start after the previous writer stops; plan a brief maintenance window for backend replacement. Frontend startup requires the private backend hostname to resolve.

## Local deployment records

- `.local/sepolia/deployment.json`: public contract manifest.
- `.local/sepolia/deployment-state.json`: deployment transaction checkpoints.
- `.local/sepolia/demo-evidence.json`: testnet activity and receipt checkpoints.
- `.local/sepolia/source-verification.json`: source verification results.
- `.local/sepolia/test-wallets.json`: private generated test wallets, owner-readable only; never publish.

`node scripts/deploy-sepolia.mjs` deploys/resumes the assessment contracts using the local `.env` (`PRIVATE_KEY` or `DEPLOYER_PRIVATE_KEY`). Preserve its checkpoints to avoid an unintended new deployment. `node scripts/check-sepolia.mjs` resumes real testnet validation and prepares round 2 with four participants. These commands spend Sepolia ETH and are distinct from local-only `npm run verify`.
