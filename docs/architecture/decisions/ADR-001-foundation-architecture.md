# ADR-001: Foundation Architecture & Layer Boundaries

## Status
Accepted

## Context
Robex requires a clean separation of concerns between web frontend, backend aggregation services, and shared protocol logic, while avoiding tight coupling to specific liquidity protocols or wallet vendors.

## Decision
1. **Monorepo Structure**: Separate `apps/web`, `apps/api`, `packages/types`, `packages/config`, and `packages/core` using native npm workspaces.
2. **Feature → Service → Adapter → Provider Pattern**: Any external interaction (e.g. quote retrieval, RPC queries) must pass through internal services and adapters.
3. **Wallet Abstraction**: Features interact strictly through `WalletAdapter` interface. Injected wallet interactions are wrapped to avoid MetaMask-specific lock-in.
4. **Centralized Network Config**: Chain IDs, RPC endpoints, and contract schemas are centralized in `@robex/config` with safety invariants preventing accidental mainnet activation.

## Consequences
- Clean testability via mocks and simulated providers.
- Future liquidity protocols or wallet providers can be added without modifying core feature components.
