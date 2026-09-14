const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("DLottery PRD and accounting", function () {
  let lottery, token, provider, users, dao, price;
  async function setup(decimals = 8, adversarial = false, minimum = 2) {
    users = await ethers.getSigners();
    dao = users[9];
    token = await (
      await ethers.getContractFactory(
        adversarial ? "AdversarialToken" : "MockUSD8",
      )
    ).deploy(...(adversarial ? [] : [decimals]));
    provider = await (
      await ethers.getContractFactory("MockRandomnessProvider")
    ).deploy();
    lottery = await (
      await ethers.getContractFactory("DLottery")
    ).deploy(token.target, dao.address, minimum, provider.target);
    price = await lottery.ticketPrice();
    for (const u of users.slice(0, 6)) {
      await token.mint(u.address, price * 100n);
      await token.connect(u).approve(lottery.target, ethers.MaxUint256);
    }
    await lottery.startDraw(0);
  }
  async function buy(n, id) {
    id ??= await lottery.currentDrawId();
    for (const u of users.slice(0, n)) await lottery.connect(u).buyTicket(id);
  }
  async function expire(id) {
    id ??= await lottery.currentDrawId();
    const d = await lottery.getDraw(id);
    await network.provider.send("evm_setNextBlockTimestamp", [
      Number(d.deadline),
    ]);
  }
  async function draw(word, id) {
    id ??= await lottery.currentDrawId();
    await lottery.performDraw(id);
    const d = await lottery.getDraw(id);
    if (Number(d.status) === 1) await provider.fulfill(d.requestId, word);
  }
  async function solvent(surplus = 0n) {
    expect(await token.balanceOf(lottery.target)).to.equal(
      (await lottery.liabilities()) + surplus,
    );
  }
  beforeEach(async () => setup());
  it("validates configuration, IDs and round start guards", async () => {
    const factory = await ethers.getContractFactory("DLottery");
    for (const n of [0, 6])
      await expect(
        factory.deploy(token.target, dao.address, n, provider.target),
      ).to.be.revertedWithCustomError(lottery, "InvalidConfiguration");
    await expect(
      factory.deploy(token.target, ethers.ZeroAddress, 2, provider.target),
    ).to.be.reverted;
    await expect(lottery.getDraw(0)).to.be.revertedWithCustomError(
      lottery,
      "InvalidDraw",
    );
    const d = await lottery.getDraw(1);
    expect(d.deadline - d.startTime).to.equal(86400);
    await expect(lottery.startDraw(0)).to.be.revertedWithCustomError(
      lottery,
      "InvalidDraw",
    );
    await expect(lottery.startDraw(1)).to.be.revertedWithCustomError(
      lottery,
      "InvalidState",
    );
  });
  it("buys one unique ticket per wallet, exact price, caps at five", async () => {
    await expect(lottery.buyTicket(1))
      .to.emit(lottery, "TicketBought")
      .withArgs(1, users[0].address, 1, price, 1, price);
    await expect(lottery.buyTicket(1)).to.be.revertedWithCustomError(
      lottery,
      "AlreadyParticipated",
    );
    for (const u of users.slice(1, 5)) await lottery.connect(u).buyTicket(1);
    await expect(
      lottery.connect(users[5]).buyTicket(1),
    ).to.be.revertedWithCustomError(lottery, "TicketsClosed");
    await expect(lottery.buyTicket(2)).to.be.revertedWithCustomError(
      lottery,
      "InvalidDraw",
    );
    const owners = await lottery.ticketOwners(1);
    expect(owners.slice(0, 5)).to.deep.equal(
      users.slice(0, 5).map((u) => u.address),
    );
    expect(owners.slice(5)).to.deep.equal(Array(5).fill(ethers.ZeroAddress));
    await solvent();
  });
  it("rejects missing allowance and balance without state changes", async () => {
    await token.approve(lottery.target, 0);
    await expect(lottery.buyTicket(1)).to.be.reverted;
    await token.connect(users[7]).approve(lottery.target, price);
    await expect(lottery.connect(users[7]).buyTicket(1)).to.be.reverted;
    expect((await lottery.getDraw(1)).participantCount).to.equal(0);
    await solvent();
  });
  it("enforces exact deadline and early draw boundary", async () => {
    await expect(lottery.performDraw(1)).to.be.revertedWithCustomError(
      lottery,
      "NotEligible",
    );
    const d = await lottery.getDraw(1);
    await network.provider.send("evm_setNextBlockTimestamp", [
      Number(d.deadline) - 1,
    ]);
    await lottery.buyTicket(1);
    await network.provider.send("evm_setNextBlockTimestamp", [
      Number(d.deadline),
    ]);
    await expect(
      lottery.connect(users[1]).buyTicket(1),
    ).to.be.revertedWithCustomError(lottery, "TicketsClosed");
    await lottery.performDraw(1);
    expect((await lottery.getDraw(1)).status).to.equal(5);
  });
  it("cancels an empty round and advances without liabilities", async () => {
    await expire();
    await expect(lottery.performDraw(1))
      .to.emit(lottery, "DrawCancelled")
      .withArgs(1, 0, 0, 0);
    await expect(lottery.claimRefund(1)).to.be.revertedWithCustomError(
      lottery,
      "NotClaimable",
    );
    await lottery.startDraw(1);
    expect(await lottery.currentDrawId()).to.equal(2);
    await solvent();
  });
  it("refunds a cancelled participant once, including after another draw starts", async () => {
    await buy(1);
    await expire();
    await lottery.performDraw(1);
    await lottery.startDraw(1);
    await buy(2, 2);
    const pool = (await lottery.getDraw(2)).pool;
    await expect(lottery.claimRefund(1)).to.changeTokenBalances(
      token,
      [lottery, users[0]],
      [-price, price],
    );
    await expect(lottery.claimRefund(1)).to.be.revertedWithCustomError(
      lottery,
      "NotClaimable",
    );
    await expect(
      lottery.connect(users[1]).claimRefund(1),
    ).to.be.revertedWithCustomError(lottery, "NotClaimable");
    expect((await lottery.getDraw(2)).pool).to.equal(pool);
    await solvent();
  });
  it("settles at quorum after timeout and rejects post-request inputs", async () => {
    await buy(2);
    await expire();
    await lottery.performDraw(1);
    await expect(
      lottery.connect(users[2]).buyTicket(1),
    ).to.be.revertedWithCustomError(lottery, "TicketsClosed");
    await expect(lottery.performDraw(1)).to.be.revertedWithCustomError(
      lottery,
      "NotEligible",
    );
    await expect(lottery.startDraw(1)).to.be.revertedWithCustomError(
      lottery,
      "InvalidState",
    );
    await expect(lottery.fulfillRandomness(1, 0)).to.be.revertedWithCustomError(
      lottery,
      "Unauthorized",
    );
    await expect(lottery.finalizeDraw(1)).to.be.revertedWith(
      "Randomness pending",
    );
    await provider.fulfill((await lottery.getDraw(1)).requestId, 0);
    expect((await lottery.getDraw(1)).winner).to.equal(users[0].address);
    await solvent();
  });
  it("pays a full winner 48 USD8 and DAO 2, exactly once", async () => {
    await buy(5);
    await draw(0);
    const d = await lottery.getDraw(1);
    expect(d.pool).to.equal(5n * price);
    expect(d.daoFee).to.equal(price / 5n);
    await expect(
      lottery.connect(users[1]).claimPrize(1),
    ).to.be.revertedWithCustomError(lottery, "NotClaimable");
    await expect(lottery.claimPrize(1)).to.changeTokenBalances(
      token,
      [lottery, users[0], dao],
      [-d.pool, d.winnerPrize, d.daoFee],
    );
    await expect(lottery.claimPrize(1)).to.be.revertedWithCustomError(
      lottery,
      "NotClaimable",
    );
    await solvent();
  });
  it("reproduces the PRD 70/3/67 example from real rollover", async () => {
    await buy(2);
    await expire();
    await draw(9);
    expect(await lottery.pendingRollover()).to.equal(price * 2n);
    await lottery.startDraw(1);
    await buy(5, 2);
    await draw(0, 2);
    const d = await lottery.getDraw(2);
    const unit = price / 10n;
    expect([d.pool, d.daoFee, d.winnerPrize]).to.deep.equal([
      70n * unit,
      3n * unit,
      67n * unit,
    ]);
    await lottery.claimPrize(2);
    await solvent();
  });
  it("preserves rollover through cancellation and old refunds", async () => {
    await buy(5);
    await draw(9);
    await lottery.startDraw(1);
    await buy(1, 2);
    await expire(2);
    await draw(0, 2);
    expect(await lottery.pendingRollover()).to.equal(5n * price);
    await lottery.startDraw(2);
    expect((await lottery.getDraw(3)).pool).to.equal(5n * price);
    await lottery.claimRefund(2);
    expect(await lottery.pendingRollover()).to.equal(0);
    await solvent();
  });
  it("isolates unclaimed prize from new pool and ignores duplicate fulfillment", async () => {
    await buy(5);
    await draw(0);
    const old = await lottery.getDraw(1);
    await lottery.startDraw(1);
    await buy(2, 2);
    await provider.fulfill(old.requestId, 9);
    expect((await lottery.getDraw(1)).winner).to.equal(old.winner);
    await lottery.claimPrize(1);
    expect(await lottery.activePool()).to.equal(price * 2n);
    await solvent();
  });
  it("excludes donations from round pools", async () => {
    await token.transfer(lottery.target, 123);
    await buy(5);
    await draw(9);
    expect(await lottery.pendingRollover()).to.equal(price * 5n);
    await solvent(123n);
  });
  it("rounds fractional fees toward winner with low decimal tokens", async () => {
    await setup(0);
    await buy(2);
    await expire();
    await draw(0);
    const d = await lottery.getDraw(1);
    expect(d.daoFee).to.equal(0);
    expect(d.winnerPrize).to.equal(20);
    await solvent();
  });
  it("rolls back fee-on-transfer purchases and failed DAO payouts; prevents reentrancy", async () => {
    await setup(0, true);
    await token.configure(ethers.ZeroAddress, true, ethers.ZeroAddress, "0x");
    await expect(lottery.buyTicket(1)).to.be.revertedWithCustomError(
      lottery,
      "WrongPaymentAmount",
    );
    expect((await lottery.getDraw(1)).participantCount).to.equal(0);
    await token.configure(
      ethers.ZeroAddress,
      false,
      lottery.target,
      lottery.interface.encodeFunctionData("buyTicket", [1]),
    );
    await buy(5);
    expect(await token.reentrySucceeded()).to.equal(false);
    await draw(0);
    await token.configure(dao.address, false, ethers.ZeroAddress, "0x");
    await expect(lottery.claimPrize(1)).to.be.revertedWith("Blocked recipient");
    expect((await lottery.getDraw(1)).status).to.equal(2);
    await solvent();
    await token.configure(ethers.ZeroAddress, false, ethers.ZeroAddress, "0x");
    await lottery.claimPrize(1);
    await solvent();
  });
  it("maintains conservation across a sequence of winner/no-winner/cancelled rounds", async () => {
    for (let i = 1; i <= 12; i++) {
      const n = i % 3 === 0 ? 1 : i % 3 === 1 ? 5 : 2;
      await buy(n, i);
      if (n < 5) await expire(i);
      await draw(i % 2 ? 0 : 9, i);
      const d = await lottery.getDraw(i);
      if (Number(d.status) === 2) await lottery.claimPrize(i);
      if (Number(d.status) === 5) await lottery.claimRefund(i);
      await solvent();
      if (i < 12) await lottery.startDraw(i);
    }
  });
  it("retains a fulfilled VRF word when delivery fails, without allowing a reroll", async () => {
    const coordinator = await (
      await ethers.getContractFactory("MockCoordinator")
    ).deploy();
    const vrf = await (
      await ethers.getContractFactory("VRFProvider")
    ).deploy(coordinator.target, 1, ethers.id("key"), 3, 500000, false);
    const consumer = await (
      await ethers.getContractFactory("FailingConsumer")
    ).deploy();
    await expect(
      vrf.connect(users[1]).setLottery(consumer.target),
    ).to.be.revertedWith("Only configurator");
    await vrf.setLottery(consumer.target);
    await expect(vrf.setLottery(lottery.target)).to.be.revertedWith(
      "Lottery already set or invalid",
    );
    await expect(vrf.requestRandomness()).to.be.revertedWithCustomError(
      vrf,
      "InvalidRequest",
    );
    await consumer.request(vrf.target);
    await coordinator.fulfill(1, 42);
    expect(await vrf.ready(1)).to.equal(true);
    expect(await vrf.delivered(1)).to.equal(false);
    await coordinator.fulfill(1, 99);
    expect(await vrf.words(1)).to.equal(42);
    await consumer.setFail(false);
    await vrf.connect(users[2]).deliver(1);
    expect(await consumer.received()).to.equal(42);
    expect(await vrf.delivered(1)).to.equal(true);
  });
  it("integrates the real VRF adapter ABI and rejects foreign callbacks", async () => {
    const coordinator = await (
      await ethers.getContractFactory("MockCoordinator")
    ).deploy();
    const vrf = await (
      await ethers.getContractFactory("VRFProvider")
    ).deploy(coordinator.target, 1, ethers.id("key"), 3, 500000, false);
    const l = await (
      await ethers.getContractFactory("DLottery")
    ).deploy(token.target, dao.address, 2, vrf.target);
    await vrf.setLottery(l.target);
    await l.startDraw(0);
    for (const u of users.slice(0, 5)) {
      await token.connect(u).approve(l.target, price);
      await l.connect(u).buyTicket(1);
    }
    await l.performDraw(1);
    await expect(
      vrf.rawFulfillRandomWords(1, [0]),
    ).to.be.revertedWithCustomError(vrf, "OnlyCoordinatorCanFulfill");
    await coordinator.fulfill(1, 0);
    expect((await l.getDraw(1)).status).to.equal(2);
    expect(await vrf.ready(1)).to.equal(true);
    expect(await vrf.delivered(1)).to.equal(true);
    await coordinator.fulfill(1, 9);
    expect((await l.getDraw(1)).luckyNumber).to.equal(1);
  });
});
