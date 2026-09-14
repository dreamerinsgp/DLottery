import {
  BrowserProvider,
  Contract,
  FetchRequest,
  JsonRpcProvider,
  ZeroAddress,
  type ContractTransactionResponse,
  type TransactionReceipt,
} from "ethers";
import abi from "../../shared/DLottery.json";
import tokenABI from "../../shared/MockUSD8.json";
import type { Config, Draw } from "./types";
export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
export const API_URL = import.meta.env.VITE_API_URL || "";
export const statusNames = [
  "ACTIVE",
  "DRAWING",
  "WINNER_DECLARED",
  "COMPLETED",
  "NO_WINNER",
  "CANCELLED",
];
const request = new FetchRequest(RPC_URL);
request.timeout = 12000;
export const rpc = new JsonRpcProvider(request);
export function readLottery(c: Config) {
  return new Contract(c.lotteryAddress, abi, rpc);
}
export function readToken(c: Config) {
  return new Contract(c.tokenAddress, tokenABI, rpc);
}
export async function api<T>(path: string): Promise<T> {
  const result = await fetch(API_URL + path, {
    signal: AbortSignal.timeout(12000),
  });
  if (!result.ok)
    throw new Error(
      (await result.json().catch(() => null))?.error?.message ||
        `History service returned ${result.status}`,
    );
  return result.json();
}
export async function chainDraw(
  c: Config,
  id: string,
): Promise<{ draw: Draw; time: number; block: number }> {
  if ((await rpc.getNetwork()).chainId.toString() !== c.chainId)
    throw new Error(
      "The read RPC is on a different network from this lottery.",
    );
  const l = readLottery(c);
  const block = await rpc.getBlock("latest");
  if (!block) throw new Error("Cannot read latest block");
  const opts = { blockTag: block.number };
  const [d, owners, price, min] = await Promise.all([
    l.getDraw(id, opts),
    l.ticketOwners(id, opts),
    l.ticketPrice(opts),
    l.minimumParticipants(opts),
  ]);
  const refunds = await Promise.all(
    owners.map((a: string) =>
      a !== ZeroAddress && Number(d.status) === 5
        ? l.refunded(id, a, opts)
        : false,
    ),
  );
  const status = statusNames[Number(d.status)];
  return {
    time: block.timestamp,
    block: block.number,
    draw: {
      id: d.id.toString(),
      status,
      startTime: Number(d.startTime),
      deadline: Number(d.deadline),
      finalizedAt: Number(d.finalizedAt) || null,
      ticketPrice: price.toString(),
      minimumParticipants: Number(min),
      participantCount: Number(d.participantCount),
      luckyNumber: Number(d.luckyNumber) || null,
      winner: d.winner === ZeroAddress ? null : d.winner,
      pool: d.pool.toString(),
      inheritedRollover: d.inheritedRollover.toString(),
      rollover:
        status === "NO_WINNER"
          ? d.pool.toString()
          : status === "CANCELLED"
            ? d.inheritedRollover.toString()
            : "0",
      daoFee: d.daoFee.toString(),
      winnerPrize: d.winnerPrize.toString(),
      prizeClaimed: status === "COMPLETED",
      daoFeePaid: status === "COMPLETED" ? d.daoFee.toString() : "0",
      requestId: d.requestId === 0n ? null : d.requestId.toString(),
      tickets: owners.map((a: string, i: number) => ({
        number: i + 1,
        wallet: a === ZeroAddress ? null : a,
        refunded: Boolean(refunds[i]),
      })),
      remainingSeconds: Math.max(0, Number(d.deadline) - block.timestamp),
      canPerformDraw:
        status === "ACTIVE" &&
        (Number(d.participantCount) === 5 ||
          block.timestamp >= Number(d.deadline)),
    },
  };
}
export async function walletContracts(c: Config, address: string) {
  const injected = window.ethereum;
  if (!injected) throw new Error("Install an EVM wallet to participate.");
  let chain = await injected.request({ method: "eth_chainId" });
  if (BigInt(String(chain)).toString() !== c.chainId) {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + BigInt(c.chainId).toString(16) }],
    });
    chain = await injected.request({ method: "eth_chainId" });
    if (BigInt(String(chain)).toString() !== c.chainId)
      throw new Error("Switch your wallet to the lottery network.");
  }
  const browser = new BrowserProvider(injected);
  const accounts = (await injected.request({
    method: "eth_accounts",
  })) as string[];
  if (
    !address ||
    !accounts.some((a) => a.toLowerCase() === address.toLowerCase())
  )
    throw new Error(
      "Connect the selected account using Switch wallet before continuing.",
    );
  const signer = await browser.getSigner(address);
  return {
    lottery: new Contract(c.lotteryAddress, abi, signer),
    token: new Contract(c.tokenAddress, tokenABI, signer),
    address: await signer.getAddress(),
  };
}
export async function confirmed(
  tx: ContractTransactionResponse,
  startBlock: number,
): Promise<TransactionReceipt> {
  try {
    // ContractTransactionResponse does not preserve the signer response
    // replacement scan boundary. Restore it before waiting for the receipt.
    const receipt = await tx.replaceableTransaction(startBlock).wait();
    if (!receipt || receipt.status !== 1)
      throw new Error("Transaction reverted.");
    return receipt;
  } catch (error: unknown) {
    const e = error as {
      code?: string;
      cancelled?: boolean;
      receipt?: TransactionReceipt;
    };
    if (
      e.code === "TRANSACTION_REPLACED" &&
      !e.cancelled &&
      e.receipt?.status === 1
    )
      return e.receipt;
    throw error;
  }
}
export function message(error: unknown): string {
  const e = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
  };
  if (e.code === "ACTION_REJECTED" || e.code === 4001)
    return "Request declined in your wallet. You can try again.";
  if (e.code === "TRANSACTION_REPLACED")
    return "The transaction was cancelled or replaced in your wallet.";
  return (
    e.shortMessage || e.message || "Something went wrong. Please try again."
  );
}
