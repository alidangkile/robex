import type {
  InvalidationReason,
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';
import { getActiveNetworkConfig, isSupportedChain } from '@robex/config';

export class MockWalletAdapter implements WalletAdapter {
  public readonly id = 'mock-wallet';
  public readonly name = 'Robex Dev Mock Wallet';
  public readonly type: WalletType = 'MOCK';
  public readonly isMock = true;

  private state: WalletState = 'DISCONNECTED';
  private account: WalletAccount | null = null;
  private listeners: Set<(state: WalletState, account: WalletAccount | null) => void> = new Set();
  private invalidationListeners: Set<(reason: InvalidationReason) => void> = new Set();

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

  /**
   * INVARIANT: Real transaction execution is strictly disabled in Plan 002.
   */
  public async sendTransaction(_tx: SendTransactionRequest): Promise<string> {
    throw new Error('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
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
