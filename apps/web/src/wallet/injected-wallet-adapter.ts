import type {
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';
import { getActiveNetworkConfig } from '@robex/config';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export class InjectedWalletAdapter implements WalletAdapter {
  public readonly id = 'injected-wallet';
  public readonly name = 'Browser Injected Wallet';
  public readonly type: WalletType = 'INJECTED';
  public readonly isMock = false;

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
      throw new Error('No browser wallet extension detected (e.g. MetaMask, Rabby)');
    }

    this.state = 'CONNECTING';
    this.notify();

    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts authorized by user');
      }

      const chainIdHex = (await provider.request({
        method: 'eth_chainId',
      })) as string;
      const chainId = parseInt(chainIdHex, 16);

      const activeNetwork = getActiveNetworkConfig();
      this.account = {
        address: accounts[0],
        chainId,
      };
      // Centralized network config check, NO hardcoding
      this.state = chainId === activeNetwork.chainId ? 'CONNECTED' : 'WRONG_NETWORK';
      this.notify();
      return this.account;
    } catch (err) {
      this.state = 'DISCONNECTED';
      this.account = null;
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

  /**
   * INVARIANT: Real transaction execution is strictly blocked in Plan 001.
   * Under no circumstances is eth_sendTransaction invoked in Plan 001 foundation.
   */
  public async sendTransaction(_tx: SendTransactionRequest): Promise<string> {
    throw new Error('DISABLED_IN_PLAN_001: Transaction execution is strictly disabled in Plan 001 foundation');
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
