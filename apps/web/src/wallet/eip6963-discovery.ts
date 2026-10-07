/**
 * EIP-6963 provider discovery.
 * UI components listen through this registry; they do not attach announce events themselves.
 * `window.ethereum` is not part of this list. It stays a legacy fallback for callers.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isOkxWallet?: boolean;
}

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface DiscoveredEip6963Provider {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

const ANNOUNCE_EVENT = 'eip6963:announceProvider';
const REQUEST_EVENT = 'eip6963:requestProvider';

const providers = new Map<string, DiscoveredEip6963Provider>();
const subscribers = new Set<() => void>();
let listening = false;

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

function onAnnounce(event: Event): void {
  const detail = (event as CustomEvent<{ info?: Partial<Eip6963ProviderInfo>; provider?: Eip1193Provider }>).detail;
  const info = detail?.info;
  const provider = detail?.provider;
  if (!info || typeof info.uuid !== 'string' || info.uuid.length === 0) return;
  if (typeof info.name !== 'string' || info.name.trim().length === 0) return;
  if (!provider || typeof provider.request !== 'function') return;

  const next: DiscoveredEip6963Provider = {
    info: {
      uuid: info.uuid,
      name: info.name.trim(),
      icon: typeof info.icon === 'string' ? info.icon : '',
      rdns: typeof info.rdns === 'string' ? info.rdns : '',
    },
    provider,
  };
  const previous = providers.get(next.info.uuid);
  if (
    previous &&
    previous.provider === next.provider &&
    previous.info.name === next.info.name &&
    previous.info.rdns === next.info.rdns &&
    previous.info.icon === next.info.icon
  ) {
    return;
  }
  providers.set(next.info.uuid, next);
  notify();
}

export function startEip6963Discovery(): void {
  if (typeof window === 'undefined') return;
  if (!listening) {
    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    listening = true;
  }
  window.dispatchEvent(new Event(REQUEST_EVENT));
}

export function getDiscoveredProviders(): DiscoveredEip6963Provider[] {
  return [...providers.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
}

export function subscribeEip6963Providers(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Legacy injected provider. Callers may use this only when EIP-6963 discovery is empty.
 * The returned object is the current `window.ethereum` value, captured by the caller.
 */
export function readLegacyInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined' || !('ethereum' in window)) return null;
  const candidate = (window as unknown as { ethereum?: Eip1193Provider | null }).ethereum;
  if (!candidate || typeof candidate.request !== 'function') return null;
  return candidate;
}

export function resetEip6963DiscoveryForTests(): void {
  providers.clear();
  if (typeof window !== 'undefined' && listening) {
    window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
  }
  listening = false;
  notify();
}
