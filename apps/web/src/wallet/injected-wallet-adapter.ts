import type {
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export class InjectedWalletAdapter implements WalletAdapter {
  public readonly id = 'injected-wallet';
  public readonly name = 'Browser Injected Wallet';
  public readonly type: WalletType = 'INJECTED';

  private state: WalletState = 'DISCONNECTED';
  private account: WalletAccount | null = null;
  private listeners: Set<(state: WalletState, account: WalletAccount | null) => void> = new Set();

  private getProvider(): EthereumProvider | null {
    if (typeof window !== 'undefined' && 'ethereum' in window) {
      return (window as unknown as { ethereum: EthereumProvider }).ethereum;
    }
    return null;
  }

  public getState(): WalletState {
    return this.state;
  }

  public getAccount(): WalletAccount | null {
    return this.account;
  }

  public async connect(): Promise<WalletAccount> {
    const provider = this.getProvider();
    if (!provider) {
      throw new Error('No browser wallet extension detected');
    }

    this.state = 'CONNECTING';
    this.notify();

    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      const chainIdHex = (await provider.request({
        method: 'eth_chainId',
      })) as string;
      const chainId = parseInt(chainIdHex, 16);

      this.account = {
        address: accounts[0],
        chainId,
      };
      this.state = chainId === 46630 ? 'CONNECTED' : 'WRONG_NETWORK';
      this.notify();
      return this.account;
    } catch (err) {
      this.state = 'DISCONNECTED';
      this.notify();
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    this.state = 'DISCONNECTED';
    this.account = null;
    this.notify();
  }

  public async switchChain(chainId: number): Promise<void> {
    const provider = this.getProvider();
    if (!provider) throw new Error('No provider available');

    const chainIdHex = `0x${chainId.toString(16)}`;
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  }

  public async sendTransaction(tx: SendTransactionRequest): Promise<string> {
    const provider = this.getProvider();
    if (!provider || !this.account) throw new Error('Wallet not connected');

    const txHash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: this.account.address,
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      ],
    })) as string;

    return txHash;
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
