import { useState } from "react";
import type { Config } from "./types";

export function explorerURL(chainId?: string): string | null {
  return chainId === "11155111" ? "https://sepolia.etherscan.io" : null;
}

export function Transactions({
  config,
  account,
}: {
  config: Config;
  account: string;
}) {
  const [hash, setHash] = useState("");
  const explorer = explorerURL(config.chainId);
  if (!explorer) return null;
  return (
    <section id="transactions" className="panel transactions">
      <div className="panel-top">
        <div>
          <span className="eyebrow">VERIFY ON SEPOLIA</span>
          <h2>Check transactions</h2>
        </div>
      </div>
      <p>
        Open Etherscan to inspect transaction status, sender, fees and token
        transfers. No wallet connection is needed to look up a hash.
      </p>
      <div className="explorer-links">
        <a
          href={`${explorer}/address/${config.lotteryAddress}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lottery contract activity ↗
        </a>
        <a
          href={`${explorer}/token/${config.tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          USD8 token transfers ↗
        </a>
        {account && (
          <a
            href={`${explorer}/address/${account}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            My wallet activity ↗
          </a>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          window.open(
            `${explorer}/tx/${hash.trim()}`,
            "_blank",
            "noopener,noreferrer",
          );
        }}
      >
        <label htmlFor="transaction-hash">Sepolia transaction hash</label>
        <div className="transaction-lookup">
          <input
            id="transaction-hash"
            value={hash}
            onChange={(event) => setHash(event.target.value.trim())}
            placeholder="0x… (64 hexadecimal characters)"
            required
            pattern="0x[0-9a-fA-F]{64}"
            title="Enter 0x followed by 64 hexadecimal characters."
            autoComplete="off"
            spellCheck={false}
            aria-describedby="transaction-help"
          />
          <button type="submit" className="secondary">
            Open transaction ↗
          </button>
        </div>
        <p id="transaction-help">
          Approval and ticket purchase are separate transactions. A successful
          approval alone does not buy a ticket. Newly submitted transactions may
          take a moment to appear on Etherscan.
        </p>
      </form>
    </section>
  );
}
