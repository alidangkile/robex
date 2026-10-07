# UI Refresh (v2) — Visual QA Verification

Branch: `feat/ui-refresh-v2` (based on `origin/main` @ 0526269, includes Plan 002).

## 1. Scope
- Theme A tokens (lime + cyan), Space Grotesk display / JetBrains Mono numeric fonts.
- Glass pill header + SVG icons (`icons.tsx`) + refreshed MobileNav, built on top of Plan 002 `Header.tsx`
  (CONNECTING state, EIP-6963 picker, legacy + mock options, Wrong Net / Unsupported badges, NetworkBanner untouched).
- Home: static hero "Trade on-chain. Keep your keys." + Launch Swap CTA, markets strip labeled
  `EXAMPLE DATA · TESTNET · NOT LIVE`, feature blocks, trust section, connect CTA, footer.
- Connected Home (Plan 002 scope): wallet address, wallet type, network status + chain, quick actions only.
  No balances, assets, portfolio value, positions or activity.
- **Excluded:** 3D/WebGL hero (no `three` / `gsap` dependencies) — deferred to a separate PR.

## 2. Checks
- `npm run typecheck` ✅  · `npm run lint` ✅  · `npm test` ✅ (64/64, incl. unchanged `wallet-lifecycle-ui`, `eip6963-selection`, `wallet-adapter`) · `npm run build` ✅

## 3. Responsive Viewport Screenshots & Overflow Measurements

Captured with Playwright (Chromium) against `vite` dev server with `VITE_ENABLE_MOCK_WALLET=true`, same flow as
`scripts/capture-screenshots.mjs`: header Connect Wallet → Dev Mock Wallet; `window.__robexWallet.switchChain(46600)`;
`switchChain(1)`. Each viewport measured `document.documentElement.scrollWidth <= window.innerWidth`.

| Viewport | State | Resolution | innerWidth | scrollWidth | Overflow |
|---|---|---|---|---|---|
| Desktop Wide | Disconnected | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Disconnected | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Disconnected | 768x1024 | 768px | 768px | **0px** |
| Mobile | Disconnected | 375x812 | 375px | 375px | **0px** |
| Desktop Wide | Connected (DEV MOCK) | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Connected (DEV MOCK) | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Connected (DEV MOCK) | 768x1024 | 768px | 768px | **0px** |
| Mobile | Connected (DEV MOCK) | 375x812 | 375px | 375px | **0px** |
| Desktop Wide | Wrong Network (46600) | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Wrong Network (46600) | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Wrong Network (46600) | 768x1024 | 768px | 768px | **0px** |
| Mobile | Wrong Network (46600) | 375x812 | 375px | 375px | **0px** |
| Desktop Wide | Unsupported Network (1) | 1440x900 | 1440px | 1440px | **0px** |
| Desktop Narrow | Unsupported Network (1) | 1024x768 | 1024px | 1024px | **0px** |
| Tablet | Unsupported Network (1) | 768x1024 | 768px | 768px | **0px** |
| Mobile | Unsupported Network (1) | 375x812 | 375px | 375px | **0px** |

Regression spot-check at 1440x900 (connected, after recovery via `.network-banner-btn`): Swap, Pool, Portfolio — 0px overflow.

### Saved Artifacts
- `docs/qa/evidence/ui-refresh-desktop-wide.png`
- `docs/qa/evidence/ui-refresh-desktop-narrow.png`
- `docs/qa/evidence/ui-refresh-tablet.png`
- `docs/qa/evidence/ui-refresh-mobile.png`
- `docs/qa/evidence/ui-refresh-desktop-wide-connected.png`
- `docs/qa/evidence/ui-refresh-desktop-narrow-connected.png`
- `docs/qa/evidence/ui-refresh-tablet-connected.png`
- `docs/qa/evidence/ui-refresh-mobile-connected.png`
- `docs/qa/evidence/ui-refresh-desktop-wide-wrong-network.png`
- `docs/qa/evidence/ui-refresh-desktop-narrow-wrong-network.png`
- `docs/qa/evidence/ui-refresh-tablet-wrong-network.png`
- `docs/qa/evidence/ui-refresh-mobile-wrong-network.png`
- `docs/qa/evidence/ui-refresh-desktop-wide-unsupported-network.png`
- `docs/qa/evidence/ui-refresh-desktop-narrow-unsupported-network.png`
- `docs/qa/evidence/ui-refresh-tablet-unsupported-network.png`
- `docs/qa/evidence/ui-refresh-mobile-unsupported-network.png`
- `docs/qa/evidence/ui-refresh-swap-desktop.png`
- `docs/qa/evidence/ui-refresh-pool-desktop.png`
- `docs/qa/evidence/ui-refresh-portfolio-desktop.png`

## 4. Notes
- Files are prefixed `ui-refresh-` so Plan 002 evidence is not overwritten.
- At 375px on wrong/unsupported network the header hides the ROBEX wordmark (logo mark stays) to avoid a 15–25px overflow.
- Market prices in the strip are static example data, clearly labeled; not live.
