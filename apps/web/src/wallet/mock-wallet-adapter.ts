import type {
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';

export class MockWalletAdapter implements WalletAdapter {
  public readonly id = 'mock-wallet';
  public readonly name = 'Robex Testnet Dev Wallet';
  public readonly type: 'MOCK' = 'MOCK';

  private state: WalletState = 'DISCONNECTED';
  private account: WalletAccount | null = null;
  private listeners: Set<(state: WalletState, account: WalletAccount | null) => void> = new Set();

  public getState(): WalletState {
    return this.state;
  }

  public getAccount(): WalletAccount | null {
    return this.account;
  }

  public async connect(): Promise<WalletAccount> {
    this.state = 'CONNECTING';
    this.notify();

    // Micro-delay for realistic connection simulation
    await new Promise((res) => setTimeout(res, 200));

    this.account = {
      address: '0x71C83D43c162818FEEfdf08B9B1Eeb1D6b110B3B',
      chainId: 46630, // Robinhood Chain Testnet
    };
    this.state = 'CONNECTED';
    this.notify();
    return this.account;
  }

  public async disconnect(): Promise<void> {
    this.state = 'DISCONNECTED';
    this.account = null;
    this.notify();
  }

  public async switchChain(chainId: number): Promise<void> {
    if (this.account) {
      this.account = {
        ...this.account,
        chainId,
      };
      this.state = chainId === 46630 ? 'CONNECTED' : 'WRONG_NETWORK';
      this.notify();
    }
  }

  /**
   * INVARIANT: No fake transaction success in Plan 001.
   * Transaction execution is not implemented in Plan 001 foundation.
   */
  public async sendTransaction(_tx: SendTransactionRequest): Promise<string> {
    throw new Error('NOT_IMPLEMENTED: Transaction execution is disabled in Plan 001 foundation');
  }

  public onStateChange(
    listener: (state: WalletState, account: WalletAccount | null) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state, this.account);
    }
  }
}
