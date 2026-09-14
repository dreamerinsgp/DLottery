import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { formatUnits } from "ethers";
import {
  api,
  chainDraw,
  confirmed,
  message,
  readLottery,
  readToken,
  rpc,
  walletContracts,
} from "./chain";
import type { APIResponse, Config, Draw, HistoryResponse } from "./types";
import "./style.css";
const short = (s: string | null) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—";
const friendly = (s: string) =>
  ({
    ACTIVE: "Tickets open",
    DRAWING: "Drawing in progress",
    WINNER_DECLARED: "Winner declared",
    COMPLETED: "Prize claimed",
    NO_WINNER: "Pool rolled over",
    CANCELLED: "Draw cancelled",
  })[s] || s;
const time = (n: number) =>
  `${Math.floor(n / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((n % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [account, setAccount] = useState(""),
    [walletChain, setWalletChain] = useState("");
  const [walletAccounts, setWalletAccounts] = useState<string[]>([]),
    [walletOpen, setWalletOpen] = useState(false),
    [walletBusy, setWalletBusy] = useState(false),
    [walletError, setWalletError] = useState("");
  const [draw, setDraw] = useState<Draw | null>(null),
    [currentID, setCurrentID] = useState("0"),
    [selectedID, setSelectedID] = useState<string | null>(null);
  const [balance, setBalance] = useState("0"),
    [history, setHistory] = useState<Draw[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [sync, setSync] = useState<APIResponse | null>(null),
    [now, setNow] = useState(0),
    [txHash, setTxHash] = useState(""),
    [receiptBlock, setReceiptBlock] = useState(0);
  const [loading, setLoading] = useState(true),
    [historyBusy, setHistoryBusy] = useState(false);
  const clock = useRef({ time: 0, at: Date.now() }),
    pending = useRef(false),
    generation = useRef(0),
    refreshBusy = useRef(false),
    historyPages = useRef(1);
  const selectedAccount = useRef("");
  const selectAccount = useCallback((address: string) => {
    generation.current++;
    selectedAccount.current = address;
    setAccount(address);
    setBalance("0");
    setNotice("");
    setError("");
    setTxHash("");
  }, []);
  const amount = (value: string) =>
    formatUnits(value || "0", config?.tokenDecimals ?? 8).replace(/\.0$/, "");
  const testTokenAvailable =
    config?.chainId === "11155111" &&
    !!import.meta.env.VITE_TEST_TOKEN_ADDRESS &&
    config.tokenAddress.toLowerCase() ===
      import.meta.env.VITE_TEST_TOKEN_ADDRESS.toLowerCase();
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Config>("/api/v1/config")
        .then((c) => {
          if (active) {
            setConfig(c);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setError(message(e));
            setLoading(false);
          }
        });
    void load();
    const retry = setInterval(() => {
      if (active) void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(retry);
    };
  }, []);
  useEffect(() => {
    const p = window.ethereum;
    if (!p) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) || [];
      setWalletAccounts(accounts);
      selectAccount(accounts[0] || "");
    };
    const chainChanged = (...args: unknown[]) => {
      generation.current++;
      setWalletChain(BigInt(String(args[0])).toString());
    };
    p.request({ method: "eth_accounts" })
      .then((a) => accountsChanged(a))
      .catch(() => {});
    p.request({ method: "eth_chainId" })
      .then((c) => chainChanged(c))
      .catch(() => {});
    p.on?.("accountsChanged", accountsChanged);
    p.on?.("chainChanged", chainChanged);
    return () => {
      p.removeListener?.("accountsChanged", accountsChanged);
      p.removeListener?.("chainChanged", chainChanged);
    };
  }, [selectAccount]);
  const loadHistory = useCallback(
    async (next?: string) => {
      if (!config) return;
      setHistoryBusy(true);
      try {
        const data = await api<HistoryResponse>(
          `/api/v1/draws/history?limit=10${next ? `&cursor=${next}` : ""}`,
        );
        setHistory((old) =>
          next
            ? [
                ...old,
                ...data.draws.filter((d) => !old.some((o) => o.id === d.id)),
              ]
            : data.draws,
        );
        setCursor(data.nextCursor);
        historyPages.current = next ? historyPages.current + 1 : 1;
        setHistoryError("");
      } catch (e) {
        setHistoryError(message(e));
      } finally {
        setHistoryBusy(false);
      }
    },
    [config],
  );
  const refresh = useCallback(async () => {
    if (!config || refreshBusy.current) return;
    refreshBusy.current = true;
    const gen = generation.current;
    try {
      const l = readLottery(config);
      const id = (await l.currentDrawId()).toString();
      const selected = selectedID || id;
      const result =
        selected !== "0" ? await chainDraw(config, selected) : null;
      const bal = account
        ? (await readToken(config).balanceOf(account)).toString()
        : "0";
      if (gen !== generation.current) return;
      setCurrentID(id);
      setDraw(result?.draw || null);
      setBalance(bal);
      if (result) {
        clock.current = { time: result.time, at: Date.now() };
        setNow(result.time);
      }
      setError("");
      try {
        setSync(await api<APIResponse>("/api/v1/draws/current"));
      } catch {
        setSync(null);
      }
    } catch (e) {
      if (gen === generation.current) setError(message(e));
    } finally {
      setLoading(false);
      refreshBusy.current = false;
    }
  }, [config, account, selectedID]);
  useEffect(() => {
    generation.current++;
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    void loadHistory();
    const timer = setInterval(() => {
      if (historyPages.current === 1) void loadHistory();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadHistory]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setNow(
          clock.current.time +
            Math.floor((Date.now() - clock.current.at) / 1000),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  function selectDraw(id: string | null) {
    setSelectedID(id);
    setDraw(null);
    setLoading(true);
  }
  async function connect(requestMore = false) {
    if (pending.current) return;
    if (!window.ethereum) {
      setError("Install an EVM wallet such as MetaMask to participate.");
      return;
    }
    pending.current = true;
    setWalletBusy(true);
    setWalletError("");
    try {
      if (requestMore)
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      setWalletAccounts(accounts);
      selectAccount(accounts[0] || "");
      setWalletOpen(requestMore || accounts.length > 1);
    } catch (e) {
      const code = (e as { code?: number }).code;
      const detail =
        code === 4200 || code === -32601
          ? "Open your wallet's site permissions to connect another account, then reopen Switch wallet."
          : message(e);
      setWalletError(detail);
      setWalletOpen(true);
    } finally {
      pending.current = false;
      setWalletBusy(false);
    }
  }
  async function openWallet() {
    if (pending.current) return;
    if (!account) return connect();
    setWalletOpen(!walletOpen);
    setWalletError("");
    if (!walletOpen && window.ethereum) {
      try {
        const accounts = (await window.ethereum.request({
          method: "eth_accounts",
        })) as string[];
        setWalletAccounts(accounts);
        if (
          !accounts.some(
            (a) => a.toLowerCase() === selectedAccount.current.toLowerCase(),
          )
        )
          selectAccount(accounts[0] || "");
      } catch (e) {
        setWalletError(message(e));
      }
    }
  }
  async function action(
    kind: "buy" | "draw" | "prize" | "refund" | "start" | "finalize" | "mint",
  ) {
    if (!config || pending.current) return;
    pending.current = true;
    setError("");
    setNotice("");
    setTxHash("");
    setBusy("Check your wallet");
    try {
      const { lottery, token, address } = await walletContracts(
        config,
        account,
      );
      const id = draw?.id || "0";
      const send = async (
        submit: () => Promise<import("ethers").ContractTransactionResponse>,
        label: string,
      ) => {
        setBusy(label);
        const startBlock = await rpc.getBlockNumber();
        const tx = await submit();
        setTxHash(tx.hash);
        setBusy("Waiting for blockchain confirmation");
        const receipt = await confirmed(tx, startBlock);
        setTxHash(receipt.hash);
        setReceiptBlock(receipt.blockNumber);
        return receipt;
      };
      if (kind === "mint") {
        if (!testTokenAvailable)
          throw new Error("Test token faucet is unavailable.");
        await send(
          () =>
            token.mint(address, 1000n * 10n ** BigInt(config.tokenDecimals)),
          "Confirm your test USD8 request",
        );
        setNotice("1,000 test USD8 sent to your wallet.");
      } else if (kind === "buy") {
        const fresh = await chainDraw(config, id);
        const d = fresh.draw;
        if (
          d.status !== "ACTIVE" ||
          d.participantCount >= 5 ||
          fresh.time >= d.deadline ||
          d.tickets.some(
            (t) => t.wallet?.toLowerCase() === address.toLowerCase(),
          )
        )
          throw new Error(
            "Tickets are closed or this wallet already has a ticket.",
          );
        const price = BigInt(d.ticketPrice);
        if ((await token.balanceOf(address)) < price)
          throw new Error("You need at least 10 USD8 to buy a ticket.");
        if ((await token.allowance(address, config.lotteryAddress)) < price)
          await send(
            () => token.approve(config.lotteryAddress, price),
            "Approve 10 USD8 in your wallet",
          );
        const active = (await window.ethereum!.request({
          method: "eth_accounts",
        })) as string[];
        const chain = await window.ethereum!.request({ method: "eth_chainId" });
        if (
          selectedAccount.current.toLowerCase() !== address.toLowerCase() ||
          !active.some((a) => a.toLowerCase() === address.toLowerCase()) ||
          BigInt(String(chain)).toString() !== config.chainId
        )
          throw new Error("Wallet changed. Please review and buy again.");
        await send(() => lottery.buyTicket(id), "Confirm your ticket purchase");
        const assigned = await lottery.ticketOf(id, address);
        setNotice(`Ticket ${assigned} is yours. Good luck!`);
      } else if (kind === "draw") {
        if (!(await lottery.canPerformDraw(id)))
          throw new Error("This round is not eligible for settlement yet.");
        await send(() => lottery.performDraw(id), "Confirm the lottery draw");
        setNotice(
          "Transaction confirmed. The round is cancelled or awaiting its random result.",
        );
      } else if (kind === "prize") {
        await send(() => lottery.claimPrize(id), "Confirm your prize claim");
        setNotice("Prize sent to your wallet.");
      } else if (kind === "refund") {
        await send(() => lottery.claimRefund(id), "Confirm your refund");
        setNotice("Your 10 USD8 ticket payment has been returned.");
      } else if (kind === "finalize") {
        await send(
          () => lottery.finalizeDraw(id),
          "Deliver the existing random result",
        );
        setNotice("Result delivered.");
      } else {
        await send(() => lottery.startDraw(currentID), "Start the next round");
        selectDraw(null);
        setNotice("A new round is open.");
      }
      await refresh();
      await loadHistory();
    } catch (e) {
      setError(message(e));
    } finally {
      pending.current = false;
      setBusy("");
    }
  }
  const mine = draw?.tickets.find(
    (t) => t.wallet?.toLowerCase() === account.toLowerCase(),
  );
  const isWinner =
    !!account && draw?.winner?.toLowerCase() === account.toLowerCase();
  const remaining = draw ? Math.max(0, draw.deadline - now) : 0;
  const eligible =
    draw?.status === "ACTIVE" &&
    (draw.participantCount === 5 || remaining === 0);
  const canBuy =
    !!account &&
    draw?.status === "ACTIVE" &&
    !mine &&
    draw.participantCount < 5 &&
    remaining > 0;
  const canStart =
    currentID === "0" ||
    (draw?.id === currentID &&
      ["WINNER_DECLARED", "COMPLETED", "NO_WINNER", "CANCELLED"].includes(
        draw.status,
      ));
  const wrongChain = !!account && !!config && walletChain !== config.chainId;
  const syncing = !sync?.synced || receiptBlock > (sync?.indexedBlock ?? -1);
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DLottery home">
          <span className="brand-mark">
            D<span>✦</span>
          </span>
          DLottery<span className="beta">MVP</span>
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#history">Past draws</a>
        </nav>
        <div className="wallet-control">
          <button
            className="wallet-button"
            onClick={() => void openWallet()}
            disabled={!!busy || walletBusy}
            aria-expanded={walletOpen}
            aria-controls="wallet-accounts"
            aria-label={
              account ? `Switch wallet (${short(account)})` : "Connect wallet ↗"
            }
          >
            {account ? (
              <>
                <i className="live-dot" />
                {short(account)}
                <span>Switch wallet</span>
              </>
            ) : (
              "Connect wallet ↗"
            )}
          </button>
          {walletOpen && (
            <section
              id="wallet-accounts"
              className="wallet-menu"
              aria-label="Wallet accounts"
            >
              <div className="wallet-menu-heading">
                <strong>Choose an account</strong>
                <button
                  className="text-button"
                  onClick={() => setWalletOpen(false)}
                  aria-label="Close wallet accounts"
                >
                  ✕
                </button>
              </div>
              <p>Select the account to use in DLottery.</p>
              <div className="wallet-account-list">
                {walletAccounts.map((address) => (
                  <button
                    key={address}
                    className="wallet-account"
                    disabled={!!busy || walletBusy}
                    aria-pressed={
                      address.toLowerCase() === account.toLowerCase()
                    }
                    onClick={() => {
                      selectAccount(address);
                      setWalletOpen(false);
                    }}
                  >
                    <span>{address}</span>
                    {address.toLowerCase() === account.toLowerCase() && (
                      <small>Selected</small>
                    )}
                  </button>
                ))}
              </div>
              <button
                className="secondary"
                disabled={!!busy || walletBusy}
                onClick={() => void connect(true)}
              >
                {walletBusy ? "Check MetaMask…" : "Connect another account"}
              </button>
              <p>
                Missing a player? Connect another account and select it in
                MetaMask.
              </p>
              {walletError && <p role="alert">{walletError}</p>}
            </section>
          )}
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="live-dot" /> ON-CHAIN. OPEN TO EVERYONE.
            </div>
            <h1>
              Your number.
              <br />
              <span>Your next possibility.</span>
            </h1>
            <p>
              Five players. Ten numbers. One transparent draw.
              <br />
              Enter with 10 USD8 and let chance do the rest.
            </p>
          </div>
          <div className="intro-stamp">
            <span>EVERY TICKET</span>
            <strong>10</strong>
            <span>USD8 / ROUND</span>
          </div>
        </section>
        <div aria-live="polite" className="messages">
          {testTokenAvailable && (
            <div className="message">
              Sepolia demo. Connect a wallet with Sepolia ETH, then get test
              USD8 to play.
              <button
                disabled={!account || !!busy || walletBusy}
                onClick={() => void action("mint")}
              >
                Get 1,000 test USD8
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="message error">
              {error}
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {wrongChain && (
            <div className="message">
              Your wallet is on another network. The next action will request a
              switch to chain {config?.chainId}.
            </div>
          )}
          {notice && <div className="message success">{notice}</div>}
          {busy && (
            <div className="message">
              <span className="spinner" />
              {busy}
            </div>
          )}
          {txHash && (
            <div className="tx-line">
              Transaction <code title={txHash}>{txHash}</code>
              {syncing && !busy ? " · Confirmed; history is synchronizing" : ""}
            </div>
          )}
        </div>
        <section className="draw-grid">
          <article className="panel main-panel">
            <div className="panel-top">
              <div>
                <span className="eyebrow">
                  {selectedID ? "DRAW DETAILS" : "THE CURRENT ROUND"}
                </span>
                <h2>
                  {draw
                    ? `Draw #${draw.id.padStart(3, "0")}`
                    : loading
                      ? "Loading draw…"
                      : "Ready for a new round"}
                </h2>
              </div>
              <span className={`status ${draw?.status.toLowerCase() || ""}`}>
                {draw ? friendly(draw.status) : "Getting started"}
              </span>
            </div>
            {selectedID && (
              <button className="text-button" onClick={() => selectDraw(null)}>
                ← Back to current draw
              </button>
            )}
            <div className="pool">
              <span>Total prize pool</span>
              <div>
                {draw ? amount(draw.pool) : "0"}
                <small>USD8</small>
              </div>
              <p>
                {draw && BigInt(draw.inheritedRollover) > 0n
                  ? `Includes ${amount(draw.inheritedRollover)} USD8 from the previous round`
                  : "The prize grows with every participant"}
              </p>
            </div>
            <div className="round-stats">
              <div>
                <span>Players joined</span>
                <strong>
                  {draw?.participantCount || 0}
                  <small> / 5</small>
                </strong>
                <div className="player-bars">
                  {Array.from({ length: 5 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        i < (draw?.participantCount || 0) ? "filled" : ""
                      }
                    />
                  ))}
                </div>
              </div>
              <div>
                <span>
                  {draw?.status === "ACTIVE"
                    ? "Time remaining"
                    : "Round closed"}
                </span>
                <strong className="countdown">
                  {draw?.status === "ACTIVE" ? time(remaining) : "— : — : —"}
                </strong>
                <small>
                  {draw?.status === "ACTIVE"
                    ? "Draws at 5 players or when time runs out"
                    : draw?.finalizedAt
                      ? new Date(draw.finalizedAt * 1000).toLocaleString()
                      : "Waiting for verifiable randomness"}
                </small>
              </div>
            </div>
            <div className="allocation-heading">
              <h3>The number board</h3>
              <span>10 possible numbers · 5 available tickets</span>
            </div>
            <div className="numbers">
              {(
                draw?.tickets ||
                Array.from({ length: 10 }, (_, i) => ({
                  number: i + 1,
                  wallet: null,
                  refunded: false,
                }))
              ).map((t) => (
                <div
                  key={t.number}
                  className={`number ${t.wallet ? "taken" : ""} ${t.wallet?.toLowerCase() === account.toLowerCase() ? "mine" : ""} ${draw?.luckyNumber === t.number ? "winning" : ""}`}
                  title={t.wallet || "Unassigned"}
                >
                  <strong>{String(t.number).padStart(2, "0")}</strong>
                  <span>
                    {draw?.luckyNumber === t.number
                      ? "✦ LUCKY NUMBER"
                      : t.wallet
                        ? t.wallet.toLowerCase() === account.toLowerCase()
                          ? "YOUR TICKET"
                          : short(t.wallet)
                        : "Unassigned"}
                  </span>
                </div>
              ))}
            </div>
            <details className="allocation-table">
              <summary>View full ticket allocation</summary>
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Wallet</th>
                    <th>Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {draw?.tickets.map((t) => (
                    <tr key={t.number}>
                      <td>{t.number}</td>
                      <td className="address">{t.wallet || "Unassigned"}</td>
                      <td>{t.refunded ? "Claimed" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </article>
          <aside className="side-stack">
            <article className="panel entry-panel">
              <span className="eyebrow">
                A LITTLE CHANCE, A BIG POSSIBILITY
              </span>
              <h2>
                {mine ? `You're in. No. ${mine.number}` : "Make it your round."}
              </h2>
              <p>
                {mine
                  ? "Your ticket is recorded on-chain. Come back for the result."
                  : "One ticket per wallet. A unique number assigned when you enter."}
              </p>
              <div className="price-row">
                <span>Your ticket</span>
                <strong>
                  10 <small>USD8</small>
                </strong>
              </div>
              <div className="balance-row">
                <span>Wallet balance</span>
                <span>
                  {account ? `${amount(balance)} USD8` : "Connect to view"}
                </span>
              </div>
              {!account ? (
                <button
                  className="primary"
                  disabled={walletBusy}
                  onClick={() => void connect()}
                >
                  Connect wallet <span>↗</span>
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!canBuy || !!busy}
                  onClick={() => void action("buy")}
                >
                  {mine
                    ? "Ticket secured ✓"
                    : eligible
                      ? "Entry has closed"
                      : "Buy one ticket"}
                  <span>↗</span>
                </button>
              )}
              <p className="fine-print">
                Only an allowance of 10 USD8 is requested.
                <br />
                Your wallet confirms every transaction.
              </p>
              {eligible && (
                <button
                  className="secondary"
                  disabled={!account || !!busy}
                  onClick={() => void action("draw")}
                >
                  Perform lottery draw →
                </button>
              )}
              {draw?.status === "DRAWING" && (
                <div className="drawing">
                  <span className="spinner" />
                  <p>
                    Waiting for the random result. This can take a few minutes.
                  </p>
                  <button
                    className="text-button"
                    disabled={!account || !!busy}
                    onClick={() => void action("finalize")}
                  >
                    Retry delivery of a ready result
                  </button>
                </div>
              )}
              {canStart && (
                <button
                  className="secondary"
                  disabled={!account || !!busy}
                  onClick={() => void action("start")}
                >
                  Start next draw →
                </button>
              )}
            </article>
            <article className="panel result-panel">
              <span className="eyebrow">
                {draw?.luckyNumber
                  ? "THE RESULT IS IN"
                  : "THE RULES ARE SIMPLE"}
              </span>
              {draw?.winner ? (
                <>
                  <h3>Lucky number {draw.luckyNumber} ✦</h3>
                  <p title={draw.winner}>
                    Winner: <span className="address">{draw.winner}</span>
                  </p>
                  <dl>
                    <div>
                      <dt>Total pool</dt>
                      <dd>{amount(draw.pool)} USD8</dd>
                    </div>
                    <div>
                      <dt>DAO fee</dt>
                      <dd>{amount(draw.daoFee)} USD8</dd>
                    </div>
                    <div>
                      <dt>Winner receives</dt>
                      <dd>{amount(draw.winnerPrize)} USD8</dd>
                    </div>
                  </dl>
                  {isWinner && (
                    <button
                      className="primary"
                      disabled={draw.prizeClaimed || !!busy}
                      onClick={() => void action("prize")}
                    >
                      {draw.prizeClaimed
                        ? "Prize claimed ✓"
                        : "Claim your prize ↗"}
                    </button>
                  )}
                </>
              ) : draw?.status === "NO_WINNER" ? (
                <>
                  <h3>No match this time.</h3>
                  <p>
                    Lucky number {draw.luckyNumber} was unassigned. All{" "}
                    {amount(draw.rollover)} USD8 carries forward to the next
                    draw.
                  </p>
                  {draw.id !== currentID && (
                    <button
                      className="text-button"
                      onClick={() => selectDraw(null)}
                    >
                      View the next/current draw →
                    </button>
                  )}
                </>
              ) : draw?.status === "CANCELLED" ? (
                <>
                  <h3>Everyone gets their ticket back.</h3>
                  <p>
                    The round ended below its minimum of{" "}
                    {draw.minimumParticipants} participants. Inherited rollover:{" "}
                    {amount(draw.rollover)} USD8.
                  </p>
                  {mine && (
                    <button
                      className="primary"
                      disabled={mine.refunded || !!busy}
                      onClick={() => void action("refund")}
                    >
                      {mine.refunded
                        ? "Refund claimed ✓"
                        : "Claim refund — 10 USD8"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h3>A fair shot. Every round.</h3>
                  <p>
                    The lucky number is chosen from 1–10. No match? The entire
                    pool rolls forward. Too few players? Your ticket is
                    refundable.
                  </p>
                  <div className="rule-note">
                    95% of net profit + your principal goes to the winner. 5%
                    supports the DAO.
                  </div>
                </>
              )}
            </article>
          </aside>
        </section>
        <section id="how" className="how">
          <div>
            <span>01 / ENTER</span>
            <h3>Choose to take a chance.</h3>
            <p>Connect your wallet, approve USD8, and buy one unique ticket.</p>
          </div>
          <div>
            <span>02 / DRAW</span>
            <h3>Let the numbers decide.</h3>
            <p>
              At five players or after 24 hours, anyone can trigger settlement.
            </p>
          </div>
          <div>
            <span>03 / CLAIM</span>
            <h3>Your prize. Your wallet.</h3>
            <p>
              Match the lucky number and claim your prize directly from the
              contract.
            </p>
          </div>
        </section>
        <section id="history" className="panel history">
          <div className="panel-top">
            <div>
              <span className="eyebrow">EVERY ROUND LEAVES A RECORD</span>
              <h2>Past draws</h2>
            </div>
            <button
              className="text-button"
              disabled={historyBusy}
              onClick={() => void loadHistory()}
            >
              Refresh ↻
            </button>
          </div>
          {historyError && (
            <p role="alert" className="error-text">
              {historyError}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Draw</th>
                  <th>Result</th>
                  <th>Lucky number</th>
                  <th>Winner</th>
                  <th>Pool</th>
                  <th>DAO fee</th>
                  <th>Winner prize</th>
                  <th>Settled</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr key={d.id}>
                    <td>#{d.id.padStart(3, "0")}</td>
                    <td>
                      <span className="history-status">
                        {friendly(d.status)}
                      </span>
                    </td>
                    <td>{d.luckyNumber ?? "—"}</td>
                    <td title={d.winner || ""}>{short(d.winner)}</td>
                    <td>{amount(d.pool)}</td>
                    <td>{amount(d.daoFee)}</td>
                    <td>{amount(d.winnerPrize)}</td>
                    <td>
                      {d.finalizedAt
                        ? new Date(d.finalizedAt * 1000).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          selectDraw(d.id);
                          window.scrollTo({ top: 300, behavior: "smooth" });
                        }}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && (
              <div className="empty">
                <span>↺</span>
                <h3>The first story is still being written.</h3>
                <p>
                  Completed, cancelled, and rolled-over rounds will appear here.
                </p>
              </div>
            )}
          </div>
          {cursor && (
            <button
              className="secondary load-more"
              disabled={historyBusy}
              onClick={() => void loadHistory(cursor)}
            >
              Load older draws
            </button>
          )}
        </section>
      </main>
      <footer>
        <a className="brand" href="/">
          DLottery<span>✦</span>
        </a>
        <span>Transparent by design. Settled on-chain.</span>
        <span className="sync-state">
          <i className={`live-dot ${syncing ? "amber" : ""}`} />
          {syncing
            ? "History synchronizing"
            : `Indexed through block ${sync?.indexedBlock}`}{" "}
          {config && `· Chain ${config.chainId}`}
        </span>
      </footer>
      {config && (
        <div className="contract-note">
          Lottery <code>{config.lotteryAddress}</code> · USD8{" "}
          <code>{config.tokenAddress}</code>
          {["31337", "1337"].includes(config.chainId) && (
            <strong> · Local demonstration · mock randomness</strong>
          )}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
