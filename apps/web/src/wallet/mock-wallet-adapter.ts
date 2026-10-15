import type {
  InvalidationReason,
  NativeBalanceReading,
  SendSwapTransactionParams,
  SendSwapTransactionResult,
  SwapStateChangeCallback,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
  WatchAssetResult,
} from '@robex/types';
import { getActiveNetworkConfig, isSupportedChain, UNISWAP_V4_TESTNET_QUOTE } from '@robex/config';
import { checkAndResolvePendingSwap, clearDroppedPendingSwapAfterConfirmation } from '@robex/core';

/**
 * Clearly fake mock transaction hash used ONLY in DEV mock environment.
 */
export const FAKE_MOCK_TX_HASH = '0x000000000000000000000000000000000000000000000000000000000000f4ce';

export function isMockSendExecutionAllowed(isDev: boolean, enableMockFlag?: string): boolean {
  return isDev === true && enableMockFlag === 'true';
}

export class MockWalletAdapter implements WalletAdapter {
  public readonly id = 'mock-wallet';
  public readonly name = 'Robex Dev Mock Wallet';
  public readonly type: WalletType = 'MOCK';
  public readonly isMock = true;

  private state: WalletState = 'DISCONNECTED';
  private account: WalletAccount | null = null;
  private listeners: Set<(state: WalletState, account: WalletAccount | null) => void> = new Set();
  private invalidationListeners: Set<(reason: InvalidationReason) => void> = new Set();

  /**
   * DEV MOCK ONLY: fixture balance returned by getNativeBalance(). Not a real
   * chain read. Tests may replace `balanceSource` to control timing or errors.
   */
  public static readonly MOCK_FIXTURE_BALANCE_WEI = '200000000000000';
  public balanceSource: (address: string) => Promise<string> = async () => MockWalletAdapter.MOCK_FIXTURE_BALANCE_WEI;

  public hasProvider(): boolean {
    return true;
  }

  public getState(): WalletState {
    return this.state;
  }

  public getAccount(): WalletAccount | null {
    return this.account;
  }

  private determineState(chainId: number): WalletState {
    const activeNetwork = getActiveNetworkConfig();
    if (chainId === activeNetwork.chainId) {
      return 'CONNECTED';
    }
    if (isSupportedChain(chainId)) {
      return 'WRONG_NETWORK';
    }
    return 'UNSUPPORTED_NETWORK';
  }

  public async connect(): Promise<WalletAccount> {
    const activeNetwork = getActiveNetworkConfig();
    this.state = 'CONNECTING';
    this.notify();

    // Micro-delay for realistic connection simulation
    await new Promise((res) => setTimeout(res, 100));

    this.account = {
      address: '0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B',
      chainId: activeNetwork.chainId, // Centralized network config
    };
    this.state = 'CONNECTED';
    this.notify();
    return this.account;
  }

  public async disconnect(): Promise<void> {
    this.state = 'DISCONNECTED';
    this.account = null;
    this.notify();
    this.emitInvalidation('disconnect');
  }

  public async switchChain(chainId: number): Promise<void> {
    if (this.account) {
      this.account = {
        ...this.account,
        chainId,
      };
      this.state = this.determineState(chainId);
      this.notify();
      this.emitInvalidation('chain');
    }
  }

  public simulateAccountChange(newAddress: string): void {
    if (this.account) {
      this.account = {
        ...this.account,
        address: newAddress,
      };
      this.notify();
      this.emitInvalidation('account');
    }
  }

  public simulateChainChange(chainId: number): void {
    this.switchChain(chainId);
  }

  /** DEV MOCK ONLY: returns the fixture balance, flagged with isMock = true. */
  public async getNativeBalance(): Promise<NativeBalanceReading> {
    const account = this.account;
    const activeNetwork = getActiveNetworkConfig();
    if (!account || this.state !== 'CONNECTED' || account.chainId !== activeNetwork.chainId) {
      throw new Error('Connect a wallet on Robinhood Chain Testnet to read the balance.');
    }
    const balanceWei = await this.balanceSource(account.address);
    if (!/^(?:0|[1-9]\d*)$/.test(balanceWei)) {
      throw new Error('The mock balance fixture is not a non-negative integer.');
    }
    return { address: account.address, chainId: account.chainId, balanceWei, isMock: true };
  }

  /** DEV MOCK ONLY: returns fixture USDG balance. */
  public async getUsdgBalance(): Promise<NativeBalanceReading> {
    const account = this.account;
    const activeNetwork = getActiveNetworkConfig();
    if (!account || this.state !== 'CONNECTED' || account.chainId !== activeNetwork.chainId) {
      throw new Error('Connect a wallet on Robinhood Chain Testnet to read the balance.');
    }
    return { address: account.address, chainId: account.chainId, balanceWei: '5000000000', isMock: true };
  }

  /** DEV MOCK ONLY: deterministic implementation returning 'added' (dev only, like its other methods). */
  public async watchUsdgAsset(): Promise<WatchAssetResult> {
    const account = this.account;
    const activeNetwork = getActiveNetworkConfig();
    if (!account || this.state !== 'CONNECTED' || account.chainId !== activeNetwork.chainId) {
      throw new Error('Connect a wallet on Robinhood Chain Testnet to add USDG.');
    }
    return 'added';
  }

  /** DEV MOCK ONLY: resolve mined/replaced pending entries (QA-21). */
  public async resolvePendingSwap(): Promise<void> {
    const account = this.account;
    const activeNetwork = getActiveNetworkConfig();
    if (!account) return;
    await checkAndResolvePendingSwap(account.address, activeNetwork.chainId, async (method: string) => {
      if (method === 'eth_getTransactionReceipt') return null;
      if (method === 'eth_getTransactionCount') return '0x0';
      return null;
    });
  }

  /** DEV MOCK ONLY: clears pending swap in mock mode using core confirmation logic. */
  public async clearDroppedPendingSwap(userConfirmed: boolean): Promise<boolean> {
    const account = this.account;
    const activeNetwork = getActiveNetworkConfig();
    if (!account) return true;
    return clearDroppedPendingSwapAfterConfirmation({
      from: account.address,
      chainId: activeNetwork.chainId,
      rpcCall: async (method: string) => {
        if (method === 'eth_getTransactionByHash') return null;
        return null;
      },
      userConfirmed,
    });
  }

  /**
   * DEV MOCK ONLY (C1 PR 2A): Executes swap simulation returning a clearly fake hash.
   * Strictly disabled in production builds.
   */
  public async sendSwapTransaction(
    params: SendSwapTransactionParams,
    onStateChange?: SwapStateChangeCallback
  ): Promise<SendSwapTransactionResult> {
    const globalProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    const isDev = typeof import.meta !== 'undefined' && import.meta.env
      ? Boolean(import.meta.env.DEV)
      : globalProcess?.env?.NODE_ENV !== 'production';

    const enableMock = typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_ENABLE_MOCK_WALLET as string | undefined)
      : globalProcess?.env?.VITE_ENABLE_MOCK_WALLET;

    if (!isMockSendExecutionAllowed(isDev, enableMock)) {
      throw new Error(
        'DISABLED_IN_PRODUCTION: Mock wallet send execution is strictly prohibited in production builds'
      );
    }

    const account = this.account;
    const activeNetwork = getActiveNetworkConfig();
    if (!account || this.state !== 'CONNECTED' || account.chainId !== activeNetwork.chainId) {
      throw new Error('Connect the mock wallet on Robinhood Chain Testnet to execute a swap.');
    }

    onStateChange?.('wallet_confirmation');
    onStateChange?.('submitted', { txHash: FAKE_MOCK_TX_HASH });
    onStateChange?.('pending', { txHash: FAKE_MOCK_TX_HASH });
    onStateChange?.('confirmed', { txHash: FAKE_MOCK_TX_HASH });

    return {
      state: 'confirmed',
      txHash: FAKE_MOCK_TX_HASH,
      receipt: {
        status: '0x1',
        to: UNISWAP_V4_TESTNET_QUOTE.universalRouter,
        from: account.address,
        blockNumber: 133500000n,
        transactionHash: FAKE_MOCK_TX_HASH,
        logs: [],
      },
      actualAmountReceived: params.amountOut,
      amountOutMinimum: params.amountOut,
      slippageExceeded: false,
    };
  }

  public dispose(): void {
    this.listeners.clear();
    this.invalidationListeners.clear();
  }

  public onStateChange(
    listener: (state: WalletState, account: WalletAccount | null) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onInvalidation(listener: (reason: InvalidationReason) => void): () => void {
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state, this.account);
    }
  }

  private emitInvalidation(reason: InvalidationReason): void {
    for (const listener of this.invalidationListeners) {
      listener(reason);
    }
  }
}
