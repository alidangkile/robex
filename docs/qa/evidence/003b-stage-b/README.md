# Plan 003B Stage B — quote evidence

Captured on 2026-10-08 against the local API at `http://127.0.0.1:3001` and the web app at `http://localhost:5174` (`VITE_ENABLE_MOCK_WALLET=true`). Layout was measured in headless Chrome 154 at device widths 1440, 1100, 768, and 390. The user's already-open Chrome DevTools socket stopped completing a WebSocket handshake, so these shots are from a separate headless Chrome profile. They are not a real wallet extension and they are not Human Acceptance.

Disconnected shots have no wallet connected. Wrong-network shots use only **Dev Mock Wallet [DEVELOPMENT ONLY]** after `switchChain(46600)`. Chain 46600 is the configured mainnet id, so the existing banner says Robinhood Chain Mainnet. That banner is mock-wallet UI, not a real extension on mainnet.

## Freshness

The 20-second lifetime starts at the pinned chain block second. `quotedAt` is that second in milliseconds. `expiresAt` is `quotedAt + 20000`. A slow response does not start a new 20 seconds from arrival. There is no extra clock-skew allowance: a block second later than the clock at read start is `FUTURE_BLOCK`.

One API read of 500000000000 wei (0.0000005 ETH) returned:

- block `130904678`, hash `0x8e64ac1ac3944eadc78078159fd01e8b53f7b091fd0e5cb3db625dcf999815e3`
- `blockTimestamp` `1791435216`
- `quotedAt` `1791435216000` (the block second, not completion time)
- `expiresAt` `1791435236000` (ttl 20000 ms)
- expected `1122` raw USDG, minimum `1116`, impact `0.0000%`, risk `normal`

A later read of 100000000000000 wei (0.0001 ETH) returned HTTP 400 `RANGE_CAP` at block `130905329`. The message cap was `759572282608` wei.

The same cap was still the boundary on two later reads. `759572282608` wei at block `130909101` returned HTTP 200, expected `1704` raw USDG, minimum `1695`, impact `0.0586%`, `quotedAt` `1791435880000` equal to that block second. `759572282609` wei at block `130909121` returned HTTP 400 `RANGE_CAP` with the same cap. These are successive reads, not one pinned block, and they are not a hardcoded price.

## Screenshots

| File | Viewport | State |
| --- | --- | --- |
| `1440-disconnected-live.png` | 1440 | Disconnected live quote |
| `1440-disconnected-blocked.png` | 1440 | 0.0001 ETH blocked by the active-range cap |
| `1440-disconnected-expired.png` | 1440 | Quote shown as Expired after the 20-second block window |
| `1440-disconnected-empty.png` | 1440 | Empty input, receive `--` |
| `1100-disconnected-live.png` | 1100 | Disconnected live quote |
| `768-disconnected-live.png` | 768 | Disconnected live quote |
| `390-disconnected-live.png` | 390 | Disconnected live quote, top of the viewport |
| `390-disconnected-live-details.png` | 390 | Same quote scrolled so the figures sit above the bottom nav |
| `390-disconnected-blocked.png` | 390 | Range-cap block |
| `1440-mock-wallet-wrong-network.png` | 1440 | Mock wallet, Wrong Net, quote hidden |
| `390-mock-wallet-wrong-network.png` | 390 | Mock wallet, Wrong Net, quote hidden |

The 1440 live shot shows 0.0000005 ETH → 0.001122 USDG, minimum 0.001116 USDG, impact 0.0000%, slippage 0.5%, block 130907930, and the sentence "The 20-second window starts at the chain block time, not when this response arrives." Swap execution stays disabled. The wallet was disconnected.

Horizontal overflow: at each width, `documentElement.scrollWidth` equalled `clientWidth`, and no leaf element extended past the viewport. On 390 the bottom nav is `position: fixed` at the bottom of the viewport. The quote card is taller than the viewport, so the top screenshot ends under the nav until the page is scrolled. The details screenshot shows the figures clear of the nav.

While the mock wallet was on the wrong network, Pool, Earn, and Portfolio still rendered their existing shells, and the ROBEX logo returned to Home. No swap was submitted and no signature was requested.

## QA14 remediation

The screenshots above were taken before the impact comparison kept fractional raw USDG. Their `0.0000%` figure is the old floored comparison. After the fix, the same 0.0000005 ETH size includes that fraction.

Live reads from the updated local API, `https://rpc.testnet.chain.robinhood.com`, on 2026-10-08:

| amountIn wei | HTTP | Result |
| --- | --- | --- |
| `21825000000` | 400 | `PRICE_IMPACT`, message `Price impact is 2.0291%`, block `130957016` |
| `22700000000` | 200 | warning, exact impact `1.8806%`, output `50`, reference `50`, block `130957041`, `quotedAt` `1791443064000` equals that block second, ttl 20000 ms |
| `500000000000` | 200 | normal, exact impact `0.0383%`, output `1122`, reference `1122`, block `130957061` |

These are observations at those blocks, not a hardcoded price. One earlier call in the same hour returned `FUTURE_BLOCK` when the pinned block second was ahead of the API clock. No skew allowance was added.

## Amendment 1 (B5)

Captured on 2026-10-10 at about 16:28 (UTC+7) from the local build at `1f58992`, with `scripts/capture-003b-amendment1.mjs`. The API ran on port 3101 against `https://rpc.testnet.chain.robinhood.com` (chain 46630). The web app ran on port 5183 with `VITE_ENABLE_MOCK_WALLET=true`. All 41 PNGs and `measurements.json` are in `amendment-1/`. At every width, `scrollWidth` equals `clientWidth` and no element overflows (`leafOverflow` 0).

Where each state's data came from:

| State | Widths | Source |
| --- | --- | --- |
| `disconnected-empty` | 1440, 390 | No request sent |
| `disconnected-live` | 1440, 1100, 768, 390 | Real RPC |
| `disconnected-custom-0` / `-1.01` / `-4.99` | 1440, 390 | Real RPC. Shows the zero notice, the warning, and the warning plus MEV note |
| `disconnected-custom-5` / `-50` | 1440, 390, 360 | Real RPC. Strong warning under the input and after "Minimum received" |
| `disconnected-blocked-0.0001` | 1440, 390 | Real RPC. Range cap blocks the quote |
| `disconnected-expired` | 1440, 390 | Real RPC, then waited past the 20 s window |
| `disconnected-future-block` | 1440, 390 | **Fixture**: the API response was intercepted to return `FUTURE_BLOCK` and show the clock-sync guidance (F-01) |
| `mock-wallet-balance` (`-zero`, `-loading`, `-error`) | 1440 (plus 1100, 768, 390 and 360 for the main state) | **Dev mock wallet**: fixture balance 0.0002 ETH, 0, a read that never finishes, and a read that fails |
| `mock-wallet-max-over-limit` | 1440, 390 | Mock balance. Max goes over 0.0001 ETH, so no request is sent |
| `mock-wallet-25pct-range-cap` | 1440, 390 | Mock balance, real RPC quote. Blocked by the active-range cap |
| `mock-wallet-wrong-network` | 1440, 390 | Mock wallet switched to 46600. Balance buttons are hidden |

These screenshots do not include a real browser-extension wallet (MetaMask or similar), because the build machine has none. The owner still needs to capture the balance quick-fill with a real wallet on 46630. No signature was requested and no transaction was sent.
