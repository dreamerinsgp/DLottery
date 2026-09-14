# API guide

[English](api-guide.md) | [简体中文](api-guide.zh-CN.md) | [Documentation](README.md)

The Go API is read-only. Wallet transactions call the contracts directly. The complete schema is [openapi.json](openapi.json); identifiers and field names are the same in both documentation languages.

## Addresses and requests

Use `https://frontend-production-216bb.up.railway.app` for `/api/` requests through nginx, or `https://backend-production-7bb6.up.railway.app` for the API and health endpoints. Locally, the backend defaults to `http://127.0.0.1:8081`. The schema's server example is the local address.

| Method/path                                     | Meaning                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/config`                            | Chain, lottery, token, decimals, DAO, VRF adapter, deployment block and confirmation depth checked against the contract |
| `GET /api/v1/draws/current`                     | Latest started round and its indexed snapshot; `draw: null` before any round starts                                     |
| `GET /api/v1/draws/history?limit=20`            | Settled history, newest first; `limit` is 1–100 and defaults to 20                                                      |
| `GET /api/v1/draws/history?limit=20&cursor=...` | Next page using the previous response's `nextCursor`; stop when it is null                                              |
| `GET /api/v1/draws/{id}`                        | Round details including ticket allocation and refunds; positive uint256 decimal ID                                      |
| `GET /healthz`                                  | HTTP process is alive; does not prove indexing is current                                                               |
| `GET /readyz`                                   | Database and recent synchronized indexer readiness; HTTP 200 or 503                                                     |
| `GET /metrics`                                  | Prometheus text with observed/indexed heights, indexer lag, failures and reorgs                                         |

Health/metrics routes must use the backend domain. The frontend only proxies `/api/`; its fallback HTML is not a health result.

```bash
curl --fail --silent --show-error \
  https://frontend-production-216bb.up.railway.app/api/v1/config
curl --fail --silent --show-error \
  'https://frontend-production-216bb.up.railway.app/api/v1/draws/history?limit=2'
curl --fail --silent --show-error \
  https://backend-production-7bb6.up.railway.app/readyz
```

## Reading the response

- Monetary values and uint256 IDs are **decimal strings**, not floating-point numbers. This token has eight decimals: `"1000000000"` means **10 USD8**; `"10000000000"` means **100 USD8**. Use integer/BigInt arithmetic and `tokenDecimals`.
- Timestamps (`startTime`, `deadline`, `finalizedAt`, `chainTime`) use **Unix seconds**. `finalizedAt` may be null. `remainingSeconds` describes indexed chain time rather than the local computer's clock.
- `indexedBlock` and `indexedBlockHash` identify the projection snapshot. `observedHead` is the observed chain head; `synced` reports whether the projection is current to the configured confirmation depth. A response with `synced: false` can contain older data; a reorg recovery may return 503.
- To compare API and contract, call the contract at `blockTag: indexedBlock`; a latest-block read can legitimately be ahead of the API. The browser uses contract reads for action eligibility and the API for history.
- `winnerPrize` and `daoFee` are amounts owed. `prizeClaimed` and `daoFeePaid` distinguish payment from an unclaimed obligation. A no-winner round has a null winner and a rollover, not a claimable prize.
- API status strings: `ACTIVE`, `DRAWING`, `WINNER_DECLARED`, `COMPLETED`, `NO_WINNER`, `CANCELLED`. Contract numeric values correspond to 0–5 in that order. The PRD's “ready to draw” is derived eligibility, not an additional stored status.

## Errors

Invalid IDs, cursors or limits return 400; a nonexistent valid round ID returns 404. A disallowed browser origin returns 403. Database/recovery failures return 503. Error responses include an `error.message`, an `error.requestId`, and an `X-Request-ID` header. Readiness uses its own `ready`/`sync` response shape. The API does not accept purchase, mint, draw or claim POST requests.

The dated [review snapshot](review-snapshot.json) is evidence of a read-only check, not a fixture that guarantees today's pool or participant count.
