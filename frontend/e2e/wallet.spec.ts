import { test, expect } from "@playwright/test";
import { Contract, JsonRpcProvider, MaxUint256 } from "ethers";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const config = JSON.parse(
  fs.readFileSync(
    process.env.DEPLOYMENT_FILE || path.join(root, "shared/deployment.json"),
    "utf8",
  ),
);
const readABI = (name: string) =>
  JSON.parse(
    fs.readFileSync(path.join(root, "shared", `${name}.json`), "utf8"),
  );
const rpcURL = process.env.RPC_HTTP_URL || "http://127.0.0.1:8545";
test("wallet purchase, random draw, winner claim, account changes, historical refund and mobile layout", async ({
  page,
}) => {
  const rpc = new JsonRpcProvider(rpcURL, undefined, {
    cacheTimeout: -1,
    pollingInterval: 50,
  });
  try {
    expect((await rpc.getNetwork()).chainId).toBe(31337n);
    const users = await Promise.all(
      Array.from({ length: 5 }, (_, i) => rpc.getSigner(i)),
    );
    const lottery = new Contract(
      config.lotteryAddress,
      readABI("DLottery"),
      users[0],
    );
    const token = new Contract(
      config.tokenAddress,
      readABI("MockUSD8"),
      users[0],
    );
    const mock = new Contract(
      config.randomnessProvider,
      readABI("MockRandomnessProvider"),
      users[0],
    );
    const id = await lottery.currentDrawId();
    expect((await lottery.getDraw(id)).status).toBe(0n);
    await (await token.approve(lottery.target, 0)).wait();
    // Wallet fixture uses the local node's unlocked accounts. Every write is a real EVM transaction.
    await page.exposeFunction(
      "localWalletRPC",
      async (method: string, params: unknown[]) => rpc.send(method, params),
    );
    let replacementHash = "";
    let replacementError: unknown = null;
    await page.exposeFunction(
      "localWalletReplacement",
      async (params: unknown[]) => {
        await rpc.send("evm_setAutomine", [false]);
        const originalHash = await rpc.send("eth_sendTransaction", params);
        setTimeout(async () => {
          try {
            const original = await rpc.send("eth_getTransactionByHash", [
              originalHash,
            ]);
            const replacement = {
              ...(params[0] as Record<string, unknown>),
              nonce: original.nonce,
            } as Record<string, unknown>;
            delete replacement.gasPrice;
            replacement.maxFeePerGas =
              "0x" + (BigInt(original.maxFeePerGas) * 2n + 1n).toString(16);
            replacement.maxPriorityFeePerGas =
              "0x" +
              (BigInt(original.maxPriorityFeePerGas) * 2n + 1n).toString(16);
            replacementHash = await rpc.send("eth_sendTransaction", [
              replacement,
            ]);
            await rpc.send("evm_mine", []);
          } catch (e) {
            replacementError = e;
          } finally {
            await rpc.send("evm_setAutomine", [true]);
          }
        }, 750);
        return originalHash;
      },
    );
    await page.addInitScript(
      ({ accounts }) => {
        const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const state = {
          account: accounts[0],
          connected: false,
          chain: "0x1",
          reject: false,
          replace: false,
          allAccounts: false,
          rejectPermissions: false,
        };
        const w = window as any;
        w.walletFixture = {
          rejectPermissions: () => {
            state.rejectPermissions = true;
          },
          replaceNext: () => {
            state.replace = true;
          },
          rejectNext: () => {
            state.reject = true;
          },
          select: (i: number) => {
            state.account = accounts[i];
            (listeners.accountsChanged || []).forEach((fn) =>
              fn([state.account]),
            );
          },
        };
        w.ethereum = {
          on: (name: string, fn: (...args: unknown[]) => void) =>
            (listeners[name] ||= []).push(fn),
          removeListener: (name: string, fn: (...args: unknown[]) => void) => {
            listeners[name] = (listeners[name] || []).filter((f) => f !== fn);
          },
          request: async ({
            method,
            params = [],
          }: {
            method: string;
            params?: unknown[];
          }) => {
            if (method === "eth_requestAccounts") {
              state.connected = true;
              return state.allAccounts
                ? [
                    state.account,
                    ...accounts.filter((a) => a !== state.account),
                  ]
                : [state.account];
            }
            if (method === "eth_accounts")
              return state.connected
                ? state.allAccounts
                  ? [
                      state.account,
                      ...accounts.filter((a) => a !== state.account),
                    ]
                  : [state.account]
                : [];
            if (method === "wallet_requestPermissions") {
              if (state.rejectPermissions) {
                state.rejectPermissions = false;
                throw Object.assign(new Error("Rejected by user"), {
                  code: 4001,
                });
              }
              state.allAccounts = true;
              return [{ parentCapability: "eth_accounts" }];
            }
            if (method === "eth_chainId") return state.chain;
            if (method === "wallet_switchEthereumChain") {
              state.chain = (params[0] as any).chainId;
              (listeners.chainChanged || []).forEach((fn) => fn(state.chain));
              return null;
            }
            if (method === "eth_sendTransaction" && state.reject) {
              state.reject = false;
              const e = new Error("Rejected by user") as any;
              e.code = 4001;
              throw e;
            }
            if (method === "eth_sendTransaction" && state.replace) {
              state.replace = false;
              return w.localWalletReplacement(params);
            }
            return w.localWalletRPC(method, params);
          },
        };
      },
      { accounts: users.map((u) => u.address) },
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your number." }),
    ).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Connect wallet ↗", exact: true })
      .click();
    await expect(
      page.getByText("Your wallet is on another network."),
    ).toBeVisible();
    await page.evaluate(() => (window as any).walletFixture.rejectNext());
    await page.getByRole("button", { name: "Buy one ticket" }).click();
    await expect(page.getByRole("alert")).toContainText("declined");
    expect(await lottery.ticketOf(id, users[0].address)).toBe(0n);
    await page.evaluate(() => (window as any).walletFixture.replaceNext());
    await page.getByRole("button", { name: "Buy one ticket" }).click();
    await expect(page.getByText("Ticket 1 is yours. Good luck!")).toBeVisible();
    expect(await token.allowance(users[0].address, lottery.target)).toBe(0n);
    expect(replacementError).toBeNull();
    expect((await rpc.getTransactionReceipt(replacementHash))?.status).toBe(1);
    await expect(
      page.getByRole("button", { name: "Ticket secured" }),
    ).toBeDisabled();
    // Request more wallet accounts, then select an account that is NOT eth_accounts[0].
    // Its real purchase verifies that the UI selection also controls the transaction signer.
    await page.getByRole("button", { name: "Switch wallet" }).click();
    await page.evaluate(() =>
      (window as any).walletFixture.rejectPermissions(),
    );
    await page.getByRole("button", { name: "Connect another account" }).click();
    await expect(
      page.getByRole("region", { name: "Wallet accounts" }).getByRole("alert"),
    ).toContainText("declined");
    await page.getByRole("button", { name: "Connect another account" }).click();
    await page
      .getByRole("button", { name: users[1].address, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Buy one ticket" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Buy one ticket" }).click();
    await expect(page.getByText("Ticket 2 is yours. Good luck!")).toBeVisible();
    expect(await lottery.ticketOf(id, users[1].address)).toBe(2n);
    expect(await lottery.ticketOf(id, users[0].address)).toBe(1n);
    for (const u of users.slice(2)) {
      await (await token.connect(u).approve(lottery.target, MaxUint256)).wait();
      await (await lottery.connect(u).buyTicket(id)).wait();
    }
    await expect(
      page.getByRole("button", { name: "Perform lottery draw" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Perform lottery draw" }).click();
    await expect(
      page.getByText("Waiting for the random result."),
    ).toBeVisible();
    const d = await lottery.getDraw(id);
    await (await mock.fulfill(d.requestId, 0)).wait();
    // Switch back to the winner through the frontend, without changing the provider's first account.
    await page.getByRole("button", { name: "Switch wallet" }).click();
    await page
      .getByRole("button", { name: users[0].address, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Claim your prize" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Claim your prize" }).click();
    await expect(page.getByText("Prize sent to your wallet.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Prize claimed" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Start next draw" }).click();
    await expect(page.getByText("A new round is open.")).toBeVisible();
    const refundID = await lottery.currentDrawId();
    await page.evaluate(() => (window as any).walletFixture.select(1));
    await expect(
      page.getByRole("button", { name: "Buy one ticket" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Buy one ticket" }).click();
    await expect
      .poll(async () =>
        (await lottery.ticketOf(refundID, users[1].address)).toString(),
      )
      .toBe("1");
    const cancelled = await lottery.getDraw(refundID);
    await rpc.send("evm_setNextBlockTimestamp", [Number(cancelled.deadline)]);
    await (await lottery.performDraw(refundID)).wait();
    await expect(
      page.getByRole("button", { name: "Claim refund" }),
    ).toBeVisible();
    // Start another round first; exercise the history detail claim rather than just the current card.
    await (await lottery.startDraw(refundID)).wait();
    await page.getByRole("button", { name: "Refresh ↻" }).click();
    const row = page.locator("tr").filter({
      has: page.getByText(`#${refundID.toString().padStart(3, "0")}`, {
        exact: true,
      }),
    });
    await row.getByRole("button", { name: "View" }).click();
    await expect(
      page.getByRole("button", { name: "Claim refund" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Claim refund" }).click();
    await expect(
      page.getByText("Your 10 USD8 ticket payment has been returned."),
    ).toBeVisible();
    expect(await lottery.refunded(refundID, users[1].address)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Refund claimed" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Back to current draw" }).click();
    await expect(
      page.getByRole("heading", {
        name: `Draw #${(refundID + 1n).toString().padStart(3, "0")}`,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(root, "docs/desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Switch wallet" }).click();
    await expect(
      page.getByRole("region", { name: "Wallet accounts" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "The number board" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "Close wallet accounts" }).click();
    await page.screenshot({
      path: path.join(root, "docs/mobile.png"),
      fullPage: true,
    });
  } finally {
    await rpc.send("evm_setAutomine", [true]);
    rpc.destroy();
  }
});
