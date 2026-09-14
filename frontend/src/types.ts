export type Config = {
  chainId: string;
  lotteryAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  daoAddress: string;
  randomnessProvider: string;
  deploymentBlock: number;
  confirmations: number;
};
export type Ticket = {
  number: number;
  wallet: string | null;
  refunded: boolean;
};
export type Draw = {
  id: string;
  status: string;
  startTime: number;
  deadline: number;
  finalizedAt: number | null;
  ticketPrice: string;
  minimumParticipants: number;
  participantCount: number;
  luckyNumber: number | null;
  winner: string | null;
  pool: string;
  inheritedRollover: string;
  rollover: string;
  daoFee: string;
  winnerPrize: string;
  prizeClaimed: boolean;
  daoFeePaid: string;
  requestId: string | null;
  tickets: Ticket[];
  remainingSeconds: number;
  canPerformDraw: boolean;
};
export type APIResponse = {
  draw: Draw | null;
  indexedBlock: number;
  indexedBlockHash: string;
  chainTime: number;
  observedHead: number;
  synced: boolean;
};
export type HistoryResponse = {
  draws: Draw[];
  nextCursor: string | null;
  synced: boolean;
  indexedBlock: number;
};
export type EVMProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};
declare global {
  interface Window {
    ethereum?: EVMProvider;
  }
}
