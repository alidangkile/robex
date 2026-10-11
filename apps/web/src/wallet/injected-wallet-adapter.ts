import type {
  InvalidationReason,
  NativeBalanceReading,
  SendTransactionRequest,
  WalletAccount,
  WalletAdapter,
  WalletState,
  WalletType,
} from '@robex/types';
import { getActiveNetworkConfig, isSupportedChain } from '@robex/config';
import { parseHexQuantity } from '@robex/core';
import {
  readLegacyInjectedProvider,
  type Eip1193Provider,
  type Eip6963ProviderInfo,
} from './eip6963-discovery.js';

interface EthereumProvider extends Eip1193Provider {}

/**
 * A connect attempt captured this error when its session was already invalidated
 * by provider disconnect, adapter disconnect, or dispose.
 * Callers must not apply the attempt's account after seeing it.
 */
export class StaleConnectSessionError extends Error {
  constructor() {
    super('Connection session was invalidated before completion');
    this.name = 'StaleConnectSessionError';
  }
}

export class InjectedWalletAdapter implements WalletAdapter {
  public readonly id = 'injected-wallet';
  public readonly isMock = false;

  private state: WalletState = 'DISCONNECTED';
  private account: WalletAccount | null = null;
  private lastValidatedChainId: number | null = null;
  private inFlightConnectPromise: Promise<WalletAccount> | null = null;
  /**
   * Bumped on disconnect/dispose. A connect completion may publish identity
   * only when it still matches the generation captured at attempt start.
   */
  private connectGeneration = 0;

  /** Provider chosen for this adapter. Null only for the legacy unbound constructor. */
  private readonly selectedProvider: EthereumProvider | null;
  private readonly selectedInfo: Eip6963ProviderInfo | null;
  /** Pinned object used for every RPC call and listener cleanup in this session. */
  private sessionProvider: EthereumProvider | null = null;

  private listeners: Set<(state: WalletState, account: WalletAccount | null) => void> = new Set();
  private invalidationListeners: Set<(reason: InvalidationReason) => void> = new Set();

  private boundAccountsChanged: ((accounts: unknown) => void) | null = null;
  private boundChainChanged: ((chainIdHex: unknown) => void) | null = null;
  private boundDisconnect: ((error: unknown) => void) | null = null;

  constructor(provider?: EthereumProvider | null, info?: Eip6963ProviderInfo | null) {
    this.selectedProvider = provider ?? null;
    this.selectedInfo = info ?? null;
    if (provider) this.sessionProvider = provider;
  }

  /** The provider object this adapter is bound to. Does not read `window.ethereum`. */
  public getBoundProvider(): EthereumProvider | null {
    return this.sessionProvider ?? this.selectedProvider;
  }

  /**
   * Session provider, pinned on first use.
   * An explicitly selected provider never falls through to `window.ethereum`.
   * The unbound constructor captures `window.ethereum` once for legacy callers.
   */
  private pinSessionProvider(): EthereumProvider | null {
    if (this.sessionProvider) return this.sessionProvider;
    if (this.selectedProvider) {
      this.sessionProvider = this.selectedProvider;
      return this.sessionProvider;
    }
    const legacy = readLegacyInjectedProvider();
    if (legacy) this.sessionProvider = legacy;
    return this.sessionProvider;
  }

  public hasProvider(): boolean {
    if (this.sessionProvider || this.selectedProvider) return true;
    return Boolean(readLegacyInjectedProvider());
  }

  public get type(): WalletType {
    if (this.selectedInfo) {
      const rdns = this.selectedInfo.rdns.toLowerCase();
      if (rdns === 'io.metamask') return 'METAMASK';
      if (rdns === 'io.rabby') return 'RABBY';
      return 'INJECTED';
    }
    const provider = this.sessionProvider ?? readLegacyInjectedProvider();
    if (provider?.isRabby) return 'RABBY';
    if (provider?.isMetaMask) return 'METAMASK';
    return 'INJECTED';
  }

  public get name(): string {
    if (this.selectedInfo?.name) return this.selectedInfo.name;
    const provider = this.sessionProvider ?? readLegacyInjectedProvider();
    if (provider?.isRabby) return 'Rabby Wallet';
    if (provider?.isMetaMask) return 'MetaMask';
    return 'Browser Wallet';
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

    const provider = this.pinSessionProvider();
    if (!provider) {
      throw new Error('No browser wallet extension detected (e.g. MetaMask, Rabby). Please install MetaMask to connect.');
    }

    const generation = this.connectGeneration;
    this.state = 'CONNECTING';
    this.notify();

    let task!: Promise<WalletAccount>;
    task = (async () => {
      try {
        const accounts = (await provider.request({
          method: 'eth_requestAccounts',
        })) as string[];

        if (generation !== this.connectGeneration) {
          throw new StaleConnectSessionError();
        }

        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts authorized by user');
        }

        const chainIdHex = (await provider.request({
          method: 'eth_chainId',
        })) as string;

        if (generation !== this.connectGeneration) {
          throw new StaleConnectSessionError();
        }

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

        if (generation !== this.connectGeneration) {
          throw new StaleConnectSessionError();
        }

        this.notify();
        return this.account;
      } catch (err: unknown) {
        // A newer disconnect/dispose owns identity. Do not clear or republish it.
        if (generation !== this.connectGeneration) {
          throw err instanceof StaleConnectSessionError ? err : new StaleConnectSessionError();
        }

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
      if (this.inFlightConnectPromise === task) {
        this.inFlightConnectPromise = null;
      }
    });

    this.inFlightConnectPromise = task;
    return task;
  }

  public async disconnect(): Promise<void> {
    this.invalidateConnectSession();
    this.notify();
    this.emitInvalidation('disconnect');
  }

  /**
   * Switches network to active Robinhood Chain Testnet.
   * INVARIANT (MEDIUM 6): Real-wallet switch/add is strictly restricted to active testnet.
   * Switching/adding to mainnet (4663) or arbitrary chains is rejected BEFORE calling provider.
   */
  public async switchChain(chainId: number): Promise<void> {
    const activeNetwork = getActiveNetworkConfig();

    if (chainId !== activeNetwork.chainId) {
      throw new Error(
        `Safety Invariant: Plan 002 strictly restricts network switching to active Robinhood Chain Testnet (Chain ID ${activeNetwork.chainId}). Target Chain ID ${chainId} rejected without provider request.`
      );
    }

    const provider = this.pinSessionProvider();
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
   * Read-only native ETH balance of the connected account through the wallet's
   * own provider (Plan 003B Amendment 1, §6A). Uses only `eth_chainId` and
   * `eth_getBalance`; never signs or sends. Fails closed when the wallet is not
   * CONNECTED on the active chain, when the wallet reports another chain, when
   * the result is not a hex quantity, or when the account/chain changed while
   * the read was in flight.
   */
  public async getNativeBalance(): Promise<NativeBalanceReading> {
    const activeNetwork = getActiveNetworkConfig();
    const provider = this.sessionProvider;
    const account = this.account;
    if (!provider || !account || this.state !== 'CONNECTED' || account.chainId !== activeNetwork.chainId) {
      throw new Error('Connect a wallet on Robinhood Chain Testnet to read the balance.');
    }
    const generation = this.connectGeneration;
    const isCurrent = () => generation === this.connectGeneration
      && this.account?.address === account.address
      && this.account?.chainId === account.chainId
      && this.state === 'CONNECTED';

    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    if (!isCurrent()) throw new Error('The wallet changed while the balance was loading.');
    const chainId = parseHexQuantity(chainIdHex);
    if (chainId !== BigInt(activeNetwork.chainId)) {
      throw new Error(`The wallet is not on chain ${activeNetwork.chainId}. Balance not read.`);
    }
    const raw = await provider.request({ method: 'eth_getBalance', params: [account.address, 'latest'] });
    if (!isCurrent()) throw new Error('The wallet changed while the balance was loading.');
    const balance = parseHexQuantity(raw);
    return {
      address: account.address,
      chainId: activeNetwork.chainId,
      balanceWei: balance.toString(),
      isMock: false,
    };
  }

  /**
   * INVARIANT: Real transaction execution is strictly disabled in Plan 002.
   * Under no circumstances is eth_sendTransaction invoked in Plan 002.
   */
  public async sendTransaction(_tx: SendTransactionRequest): Promise<string> {
    throw new Error('DISABLED_IN_PLAN_002: Real transaction execution is strictly disabled in Plan 002');
  }

  public dispose(): void {
    this.invalidateConnectSession();
    this.listeners.clear();
    this.invalidationListeners.clear();
  }

  /**
   * Drops provider listeners and identity together so an in-flight connect
   * from this generation cannot publish later.
   */
  private invalidateConnectSession(): void {
    this.connectGeneration += 1;
    this.removeEventListeners();
    this.account = null;
    this.state = 'DISCONNECTED';
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
    const installedGeneration = this.connectGeneration;

    this.boundAccountsChanged = (accounts: unknown) => {
      if (installedGeneration !== this.connectGeneration) return;
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
      if (installedGeneration !== this.connectGeneration) return;
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
      if (installedGeneration !== this.connectGeneration) return;
      this.invalidateConnectSession();
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
    const provider = this.pinSessionProvider();
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
