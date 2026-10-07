import type {
  InvalidationReason,
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';
import { getActiveNetworkConfig, isSupportedChain } from '@robex/config';

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
  private lastValidatedChainId: number | null = null;
  private inFlightConnectPromise: Promise<WalletAccount> | null = null;

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

  /**
   * Determine state based on validated chainId and account existence.
   * INVARIANT: State can NEVER be CONNECTED, WRONG_NETWORK, or UNSUPPORTED_NETWORK
   * if there is no authorized account (account is null).
   */
  private determineState(chainId: number | null): WalletState {
    if (!this.account) {
      return 'DISCONNECTED';
    }
    if (!chainId) {
      return 'UNSUPPORTED_NETWORK';
    }
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
    if (this.inFlightConnectPromise) {
      return this.inFlightConnectPromise;
    }

    const provider = this.getProvider();
    if (!provider) {
      throw new Error('No browser wallet extension detected (e.g. MetaMask, Rabby). Please install MetaMask to connect.');
    }

    this.state = 'CONNECTING';
    this.notify();

    this.inFlightConnectPromise = (async () => {
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

        this.lastValidatedChainId = chainId;
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
    })().finally(() => {
      this.inFlightConnectPromise = null;
    });

    return this.inFlightConnectPromise;
  }

  public async disconnect(): Promise<void> {
    this.removeEventListeners();
    this.state = 'DISCONNECTED';
    this.account = null;
    this.notify();
    this.emitInvalidation('disconnect');
  }

  /**
   * Switches network to active Robinhood Chain Testnet.
   * INVARIANT (MEDIUM 6): Real-wallet switch/add is strictly restricted to active testnet.
   * Switching/adding to mainnet (46600) or arbitrary chains is rejected BEFORE calling provider.
   */
  public async switchChain(chainId: number): Promise<void> {
    const activeNetwork = getActiveNetworkConfig();

    if (chainId !== activeNetwork.chainId) {
      throw new Error(
        `Safety Invariant: Plan 002 strictly restricts network switching to active Robinhood Chain Testnet (Chain ID ${activeNetwork.chainId}). Target Chain ID ${chainId} rejected without provider request.`
      );
    }

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
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: chainIdHex,
                chainName: activeNetwork.chainName,
                rpcUrls: [activeNetwork.providers.rpcUrl],
                nativeCurrency: {
                  name: activeNetwork.nativeCurrency.name,
                  symbol: activeNetwork.nativeCurrency.symbol,
                  decimals: activeNetwork.nativeCurrency.decimals,
                },
                blockExplorerUrls: [activeNetwork.providers.explorerUrl],
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

        // MEDIUM 3 Fix: EIP-3085 add does NOT guarantee auto-selection.
        // Explicitly switch after add to complete the contract.
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } catch (postAddSwitchErr: unknown) {
          const postAddError = postAddSwitchErr as { code?: number; message?: string };
          if (postAddError?.code === 4001) {
            throw new Error('Network switch was rejected by user');
          }
          throw postAddSwitchErr;
        }
      } else if (switchError?.code === 4001) {
        throw new Error('Network switch was rejected by user');
      } else {
        throw err;
      }
    }

    this.lastValidatedChainId = chainId;
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

  /**
   * INVARIANT: Real transaction execution is strictly disabled in Plan 002.
   * Under no circumstances is eth_sendTransaction invoked in Plan 002.
   */
  public async sendTransaction(_tx: SendTransactionRequest): Promise<string> {
    throw new Error('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
  }

  public dispose(): void {
    this.removeEventListeners();
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

  private setupEventListeners(provider: EthereumProvider): void {
    this.removeEventListeners();

    this.boundAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list || list.length === 0) {
        // Wallet locked or user cleared accounts:
        // Clear identity and force DISCONNECTED state.
        this.account = null;
        this.state = 'DISCONNECTED';
        this.notify();
        this.emitInvalidation('disconnect');
      } else {
        const prevAddress = this.account?.address;
        const newAddress = list[0];
        const chainId = this.lastValidatedChainId ?? (this.account?.chainId ?? 0);

        if (!prevAddress || prevAddress.toLowerCase() !== newAddress.toLowerCase() || !this.account) {
          this.account = {
            address: newAddress,
            chainId,
          };
          this.state = this.determineState(chainId);
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

      this.lastValidatedChainId = chainId;

      if (this.account) {
        this.account = {
          ...this.account,
          chainId,
        };
        this.state = this.determineState(chainId);
      } else {
        // HIGH 1 Fix: If account is null, state MUST remain DISCONNECTED
        this.state = 'DISCONNECTED';
      }

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
