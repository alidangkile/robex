# Robex — Robinhood Chain DEX

Robex is a non-custodial decentralized exchange application layer built natively for Robinhood Chain Testnet (designed to transition to Mainnet without architectural rewrites).

---

## 1. Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation
```bash
npm install
```

### Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Key environment variables:
- `ROBEX_ENV`: Active network mode (`testnet` by default).
- `API_PORT`: Port for backend API server (default `3001`).
- `VITE_API_URL`: Backend URL for web client (default `http://localhost:3001`).
- `VITE_DEFAULT_CHAIN_ID`: Target chain ID (`46630` for Robinhood Chain Testnet).

### Running in Development
Run both frontend and backend concurrently:
```bash
npm run dev
```

Or run individually:
```bash
npm run dev:api    # Starts API server on http://localhost:3001
npm run dev:web    # Starts Web client on http://localhost:5173
```

---

## 2. Quality & Verification Commands

```bash
npm run build      # Builds all packages and apps
npm run typecheck  # Validates TypeScript compilation across workspace
npm run lint       # Runs workspace linting
npm run test       # Runs Vitest automated test suite across all modules
```

---

## 3. Repository Architecture

```text
/
├── apps/
│   ├── web/        # React + Vite frontend application (Responsive shell, navigation, wallet UI)
│   └── api/        # Node.js/Express API service (Health, quotes, logging, error handling)
│
├── packages/
│   ├── types/      # Shared TypeScript types (Network, Token, Wallet, Quote, Transaction)
│   ├── config/     # Centralized network registry (Robinhood Testnet/Mainnet schemas)
│   └── core/       # Shared business logic (Tx state machine, asset normalizer, errors)
│
├── plans/          # Implementation plans (001-foundation.md)
├── docs/           # Documentation, QA evidence, Architecture Decision Records (ADRs)
├── PRD.md          # Product Requirements Document
├── ARCHITECTURE.md # System Architecture & Module Boundaries
├── DESIGN.md       # Visual Design System & UX Standards
└── AGENTS.md       # Multi-agent roles & governance rules
```

---

## 4. Architectural Boundaries

- **Feature → Service → Adapter → Provider**: Feature code never couples directly to external RPCs or third-party protocols.
- **Wallet Abstraction**: Features interact strictly through `WalletAdapter` interface, never calling window.ethereum directly.
- **Stock Token Normalization**: Multiplier calculations and pricing semantics are centralized in `@robex/core`.
- **Non-custodial**: Backend holds no private keys and never executes transactions on behalf of users.
