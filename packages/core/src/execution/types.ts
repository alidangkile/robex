import type { Hex } from 'viem';

export interface V4PoolKey {
  currency0: string;
  currency1: string;
  feePips: number;
  tickSpacing: number;
  hooks: string;
}

export interface SlippageToleranceInput {
  slippageBps?: number;
  slippageTolerancePercent?: number;
}

export interface BuildSwapCalldataParams {
  amountIn: bigint;
  amountOut?: bigint;
  amountOutMinimum?: bigint;
  slippage?: SlippageToleranceInput;
  poolKey?: V4PoolKey;
  chainId?: number;
  deadline?: bigint;
  currentTimestamp?: bigint;
  routerAddress?: string;
}

export interface BuildSwapCalldataResult {
  to: `0x${string}`;
  value: bigint;
  data: Hex;
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
  poolKey: V4PoolKey;
}

export interface DecodedSwapCalldata {
  commands: Hex;
  actions: Hex;
  deadline: bigint;
  poolKey: V4PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  hookData: Hex;
  settleCurrency: string;
  settleMaxAmount: bigint;
  takeCurrency: string;
  takeMinAmount: bigint;
}

export type RpcCallFunction = (method: string, params: unknown[]) => Promise<unknown>;

export interface PreSendCheckParams {
  userAddress: string;
  amountIn: bigint;
  calldata: Hex | string;
  routerAddress?: string;
  rpcCall: RpcCallFunction;
  gasPrice?: bigint;
  userBalance?: bigint;
}

export interface PreSendCheckResult {
  simulated: true;
  estimatedGas: bigint;
  gasPrice: bigint;
  estimatedGasFee: bigint;
  requiredEth: bigint;
  userBalance: bigint;
}

export interface DecodedRevertReason {
  errorName: string;
  args?: Record<string, unknown> | unknown[];
  message: string;
  rawData: string;
}
