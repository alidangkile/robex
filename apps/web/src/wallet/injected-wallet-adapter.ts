import type {
  InvalidationReason,
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';
import { getActiveNetworkConfig, getNetworkConfig, isSupportedChain } from '@robex/config';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isRabby?: boolean;
}

export class InjectedWalletAdapter implements WalletAdapter {
  public readonly id = 'injected-wallet';
  public readonly isMock = false;

  private state: WalletState = 'DISCONNECTED';
  private account: WalletAccount | null = null;
  private listeners: Set<(state: WalletState, account: WalletAccount | null) => void> = new Set();
  private invalidationListeners: Set<(reason: InvalidationReason) => void> = new Set();

  private boundAccountsChanged: ((accounts: unknown) => void) | null = null;
  private boundChainChanged: ((chainIdHex: unknown) => void) | null = null;
  private boundDisconnect: ((error: unknown) => void) | null = null;

  private getProvider(): EthereumProvider | null {
    if (typeof window !== 'undefined' && 'ethereum' in window && Boolean(window.ethereum)) {
      return (window as unknown as { ethereum: EthereumProvider }).ethereum;
    }
    return null;
  }

  public hasProvider(): boolean {
    return Boolean(this.getProvider());
  }

  public get type(): WalletType {
    const provider = this.getProvider();
    if (provider?.isRabby) return 'RABBY';
    if (provider?.isMetaMask) return 'METAMASK';
    return 'INJECTED';
  }

  public get name(): string {
    const provider = this.getProvider();
    if (provider?.isRabby) return 'Rabby Wallet';
    if (provider?.isMetaMask) return 'MetaMask';
    return 'Browser Injected Wallet';
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
    const provider = this.getProvider();
    if (!provider) {
      throw new Error('No browser wallet extension detected (e.g. MetaMask, Rabby). Please install MetaMask to connect.');
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
      const chainId = typeof chainIdHex === 'string' && chainIdHex.startsWith('0x')
        ? parseInt(chainIdHex, 16)
        : Number(chainIdHex);

      this.account = {
        address: accounts[0],
        chainId,
      };

      this.state = this.determineState(chainId);
      this.setupEventListeners(provider);
      this.notify();
      return this.account;
    } catch (err: unknown) {
      this.state = 'DISCONNECTED';
      this.account = null;
      this.notify();

      const error = err as { code?: number; message?: string };
      if (error?.code === 4001) {
        throw new Error('Connection request was rejected by user');
      }
      if (error?.code === -32002) {
        throw new Error('Connection request already pending in wallet extension. Please open MetaMask to approve.');
      }
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    this.removeEventListeners();
    this.state = 'DISCONNECTED';
    this.account = null;
    this.notify();
    this.emitInvalidation('disconnect');
  }

  public async switchChain(chainId: number): Promise<void> {
    const provider = this.getProvider();
    if (!provider) throw new Error('No browser wallet extension detected');

    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (err: unknown) {
      const switchError = err as { code?: number; message?: string };

      // Code 4902 or unrecognized chain: chain not added to wallet
      if (
        switchError?.code === 4902 ||
        (switchError?.message && switchError.message.toLowerCase().includes('unrecognized chain'))
      ) {
        const targetConfig = getNetworkConfig(chainId);
        if (!targetConfig) {
          throw new Error(`Cannot add unrecognized network with Chain ID ${chainId}`);
        }

        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: chainIdHex,
                chainName: targetConfig.chainName,
                rpcUrls: [targetConfig.providers.rpcUrl],
                nativeCurrency: {
                  name: targetConfig.nativeCurrency.name,
                  symbol: targetConfig.nativeCurrency.symbol,
                  decimals: targetConfig.nativeCurrency.decimals,
                },
                blockExplorerUrls: [targetConfig.providers.explorerUrl],
              },
            ],
          });
        } catch (addErr: unknown) {
          const addError = addErr as { code?: number; message?: string };
          if (addError?.code === 4001) {
            throw new Error('Adding network was rejected by user');
          }
          throw addErr;
        }
        return;
      }

      if (switchError?.code === 4001) {
        throw new Error('Network switch was rejected by user');
      }

      throw err;
    }
  }

  /**
   * INVARIANT: Real transaction execution is strictly disabled in Plan 002.
   * Under no circumstances is eth_sendTransaction invoked in Plan 002.
   */
  public async sendTransaction(_tx: SendTransactionRequest): Promise<string> {
    throw new Error('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
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

  private setupEventListeners(provider: EthereumProvider): void {
    this.removeEventListeners();

    this.boundAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list || list.length === 0) {
        this.account = null;
        this.state = 'DISCONNECTED';
        this.notify();
        this.emitInvalidation('disconnect');
      } else {
        const prevAddress = this.account?.address;
        const newAddress = list[0];
        if (!prevAddress || prevAddress.toLowerCase() !== newAddress.toLowerCase()) {
          const currentChainId = this.account?.chainId ?? 0;
          this.account = {
            address: newAddress,
            chainId: currentChainId,
          };
          this.state = this.determineState(currentChainId);
          this.notify();
          this.emitInvalidation('account');
        }
      }
    };

    this.boundChainChanged = (chainIdHex: unknown) => {
      const hex = chainIdHex as string;
      const chainId = typeof hex === 'string' && hex.startsWith('0x')
        ? parseInt(hex, 16)
        : Number(hex);

      if (this.account) {
        this.account = {
          ...this.account,
          chainId,
        };
      }
      this.state = this.determineState(chainId);
      this.notify();
      this.emitInvalidation('chain');
    };

    this.boundDisconnect = () => {
      this.account = null;
      this.state = 'DISCONNECTED';
      this.notify();
      this.emitInvalidation('disconnect');
    };

    if (typeof provider.on === 'function') {
      provider.on('accountsChanged', this.boundAccountsChanged);
      provider.on('chainChanged', this.boundChainChanged);
      provider.on('disconnect', this.boundDisconnect);
    }
  }

  private removeEventListeners(): void {
    const provider = this.getProvider();
    if (provider && typeof provider.removeListener === 'function') {
      if (this.boundAccountsChanged) provider.removeListener('accountsChanged', this.boundAccountsChanged);
      if (this.boundChainChanged) provider.removeListener('chainChanged', this.boundChainChanged);
      if (this.boundDisconnect) provider.removeListener('disconnect', this.boundDisconnect);
    }
    this.boundAccountsChanged = null;
    this.boundChainChanged = null;
    this.boundDisconnect = null;
  }
}
