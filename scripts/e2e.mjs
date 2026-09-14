import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, MaxUint256 } from "ethers";
import { root, sleep } from "./processes.mjs";
export async function e2e({
  rpc = process.env.RPC_HTTP_URL || "http://127.0.0.1:8545",
  api = process.env.API_URL || "http://127.0.0.1:8081",
  manifest = process.env.DEPLOYMENT_FILE ||
    path.join(root, "shared/deployment.json"),
  restartBackend,
} = {}) {
  const p = new JsonRpcProvider(rpc, undefined, {
    cacheTimeout: -1,
    pollingInterval: 50,
  });
  try {
    assert.equal(
      (await p.getNetwork()).chainId,
      31337n,
      "Integration fixtures are local only",
    );
    const cfg = JSON.parse(fs.readFileSync(manifest));
    const abi = (name) =>
      JSON.parse(fs.readFileSync(path.join(root, "shared", `${name}.json`)));
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) => p.getSigner(i)),
    );
    const lottery = new Contract(cfg.lotteryAddress, abi("DLottery"), users[0]),
      token = new Contract(cfg.tokenAddress, abi("MockUSD8"), users[0]),
      mock = new Contract(
        cfg.randomnessProvider,
        abi("MockRandomnessProvider"),
        users[0],
      );
    const price = await lottery.ticketPrice();
    const unit = price / 10n;
    for (const u of users)
      await (await token.connect(u).approve(lottery.target, MaxUint256)).wait();
    async function get(path) {
      const r = await fetch(api + path);
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    }
    async function indexed(id, predicate) {
      for (let i = 0; i < 100; i++) {
        try {
          const data = await get(`/api/v1/draws/${id}`);
          if (data.synced && predicate(data.draw)) return data.draw;
        } catch {}
        await sleep(100);
      }
      throw new Error(`Index did not converge for draw ${id}`);
    }
    async function buy(n, id) {
      for (const u of users.slice(0, n))
        await (await lottery.connect(u).buyTicket(id)).wait();
    }
    async function expire(id) {
      const d = await lottery.getDraw(id);
      await p.send("evm_setNextBlockTimestamp", [Number(d.deadline)]);
    }
    async function settle(id, lucky) {
      await (await lottery.performDraw(id)).wait();
      const d = await lottery.getDraw(id);
      if (d.status === 1n)
        await (await mock.fulfill(d.requestId, lucky - 1)).wait();
    }
    async function solvent() {
      assert.equal(
        await token.balanceOf(lottery.target),
        await lottery.liabilities(),
      );
    }
    let id = await lottery.currentDrawId();
    let initial = await lottery.getDraw(id);
    assert.equal(initial.status, 0n, "Start from an active round");
    assert.equal(initial.participantCount, 0n, "Start from an empty round");
    // Generate a real 20 USD8 rollover rather than injecting contract storage.
    await buy(2, id);
    await expire(id);
    await settle(id, 10);
    let d = await indexed(id, (d) => d.status === "NO_WINNER");
    assert.equal(d.rollover, String(20n * unit));
    await solvent();
    await (await lottery.startDraw(id)).wait();
    id++;
    await buy(5, id);
    await settle(id, 1);
    d = await indexed(id, (d) => d.status === "WINNER_DECLARED");
    assert.deepEqual(
      [d.pool, d.daoFee, d.winnerPrize],
      [70n, 3n, 67n].map((v) => String(v * unit)),
    );
    const winningID = id;
    // Index a real claim, orphan it, and prove the projection and claim flags recover.
    const snapshot = await p.send("evm_snapshot", []);
    await (await lottery.claimPrize(id)).wait();
    await indexed(id, (d) => d.status === "COMPLETED");
    assert.equal(await p.send("evm_revert", [snapshot]), true);
    await p.send("evm_increaseTime", [9]);
    await p.send("evm_mine", []);
    await indexed(id, (d) => d.status === "WINNER_DECLARED" && !d.prizeClaimed);
    await (await lottery.startDraw(id)).wait();
    id++;
    await buy(1, id);
    const before = await token.balanceOf(users[0].address);
    const daoBefore = await token.balanceOf(cfg.daoAddress);
    await (await lottery.claimPrize(winningID)).wait();
    assert.equal(
      (await token.balanceOf(users[0].address)) - before,
      67n * unit,
    );
    assert.equal(
      (await token.balanceOf(cfg.daoAddress)) - daoBefore,
      3n * unit,
    );
    assert.equal((await lottery.getDraw(id)).pool, price);
    await solvent();
    await expire(id);
    await settle(id, 1);
    await indexed(id, (d) => d.status === "CANCELLED");
    const cancelledID = id;
    await (await lottery.startDraw(id)).wait();
    id++;
    await (await lottery.claimRefund(cancelledID)).wait();
    await indexed(cancelledID, (d) => d.tickets[0].refunded);
    await buy(5, id);
    await settle(id, 10);
    await indexed(id, (d) => d.status === "NO_WINNER");
    await (await lottery.startDraw(id)).wait();
    id++;
    await buy(1, id);
    await expire(id);
    await settle(id, 1);
    d = await indexed(id, (d) => d.status === "CANCELLED");
    assert.equal(d.rollover, String(50n * unit));
    await (await lottery.claimRefund(id)).wait();
    await (await lottery.startDraw(id)).wait();
    id++;
    d = await indexed(id, (d) => d.status === "ACTIVE");
    assert.equal(d.pool, String(50n * unit));
    await solvent();
    const page = await get("/api/v1/draws/history?limit=2");
    assert.equal(page.draws.length, 2);
    assert.ok(page.nextCursor);
    const page2 = await get(
      `/api/v1/draws/history?limit=2&cursor=${page.nextCursor}`,
    );
    assert.equal(
      page2.draws.some((d) => page.draws.some((p) => p.id === d.id)),
      false,
    );
    if (restartBackend) {
      await restartBackend();
      const after = await get("/api/v1/draws/current");
      assert.equal(after.draw.id, id.toString());
      assert.equal(after.draw.pool, String(50n * unit));
    }
    console.log(
      "E2E passed: real ERC20 transactions, all outcome branches, 70/3/67 payout, historical claims, canonical reorg recovery, pagination" +
        (restartBackend ? ", and backend restart." : "."),
    );
  } finally {
    p.destroy();
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) await e2e();
