# DESIGN — Robex

## 1. Design Goal

Robex phải:
1. Dễ hiểu với user không phải DeFi expert.
2. Đủ sâu cho advanced user.
3. Ưu tiên financial readability — số liệu tài chính phải dễ đọc và khó hiểu sai.
4. Responsive thật trên desktop, tablet và mobile.

---

## 2. Core Principles

- Simple first, advanced when needed.
- Không giấu rủi ro tài chính quan trọng.
- Human-readable language thay vì raw contract jargon.
- Một action chính phải có hierarchy rõ.
- Mobile không phải desktop thu nhỏ.
- Visual QA là một loại test riêng.

---

## 3. Navigation

Desktop:
```text
Logo | Home | Swap | Pool | Earn | Portfolio           Wallet
```

Mobile:
- Home
- Swap
- Pool
- Earn
- Portfolio

Feature hierarchy không đổi giữa desktop và mobile.

---

## 4. Page Anatomy

Mỗi page ưu tiên:
```text
Page title
↓
Primary summary / primary action
↓
Main content
↓
Secondary data
↓
Advanced details
```

Không để nhiều card cạnh tranh cùng mức ưu tiên.

---

## 5. Home

Connected:
- Portfolio Value
- Quick Actions: Swap / Add Liquidity / Earn
- Top Assets
- Active Positions
- Recent Activity

Disconnected:
- Explore Robinhood Chain
- Markets / Pools / Opportunities
- Connect Wallet CTA

App không được thành màn hình trắng khi chưa connect wallet.

---

## 6. Swap

Primary hierarchy:
- You pay
- Token selector
- Amount
- You receive
- Expected amount
- Price impact
- Primary Swap CTA

Advanced details:
- Rate
- Minimum received
- Slippage (Presets: 0.1%, 0.5%, 1%, plus Custom 0.00% to 50.00% with max 2 decimals)
- Network fee
- Route
- Quote expiry
- Quote source

### Slippage Risk Levels in Swap (Plan 003B Amendment 1, D3)
Levels depend only on the bps value (preset or Custom). Only one level shows at a time.
- **0% (notice):** amber 11px text under the slippage control: "0% slippage may cause transactions to fail if the price moves before execution."
- **> 1% and < 5% (warning):** amber 11px text under the control: "High slippage tolerance increases the risk of unfavorable execution."
- **>= 5% up to the 50% cap (strong warning):** danger box (red tint background, red border, ⚠ icon, weight 600, `role="alert"`, class `slippage-strong-warning`): "Very high slippage: you could receive up to X% less than the estimate." Shown under the control **and** inside quote details right after "Minimum received". It replaces the amber warning and disappears with the quote details.
- 0.01% to 1%: no message. The 50% cap stays (owner requirement).

### Wallet Balance Quick-Fill in Swap (Plan 003B Amendment 1, §6A, D7/D8)
- Inside the "You pay" panel, under the read-only limit line: "Balance: X ETH" (native ETH, full precision, no trailing zeros) and four small buttons **25% / 50% / 75% / Max** (accent text, subtle border, 28px min height, `aria-label` "Use 25% of balance" … "Use maximum balance").
- Shown only when the wallet is CONNECTED on Robinhood Chain Testnet (46630); hidden when disconnected, connecting, wrong or unsupported network.
- Loading: "Balance: loading..." and all buttons disabled. Read error / wallet refusal: short amber "Balance unavailable…" text, all buttons disabled, no made-up balance. Zero balance, or a share that rounds to 0 wei: that button is disabled (`disabled` + `aria-disabled`).
- The dev mock wallet labels its fixture balance "(dev mock wallet fixture)".
- A click only fills the input (bigint, rounded down; Max = full balance, no gas reserve in 003B). The normal input checks and caps apply; amounts above 0.0001 ETH show the read-only limit error and send no request.
- The balance is read through the wallet's own provider (`eth_chainId`, `eth_getBalance`) and never sent to the Robex API.

### Typography & Status Hierarchy in Swap
- **Primary output amount:** `clamp(1.25rem, 6vw, 2rem)`, bold 700, tabular-nums when a real quote is ready.
- **Informational status text:** Smaller, quieter scale (`clamp(1rem, 3.5vw, 1.25rem)` or `1.125rem`, font-weight 600, muted/secondary color) for `Calculating...`, `Blocked`, `Expired`, `--`. Avoid giant shouting status text in the primary amount slot.

### Required Swap States

- disconnected
- wrong network
- empty amount
- quote loading
- quote ready
- quote expired
- approval required
- approval pending
- wallet confirmation
- transaction pending
- confirmed
- rejected
- reverted
- insufficient balance
- insufficient gas
- provider error
- no liquidity

---

## 7. Pool

Internal navigation:
- Explore
- My Positions

Pool cards prioritize:
- token pair
- TVL
- estimated APR
- volume
- fee tier
- risk indicator

Pool detail:
- pair summary
- TVL / volume / APR / fee tier
- price range or position information
- Add Liquidity CTA
- position details if connected user has a position

### Add Liquidity

Use guided flow:
1. Choose strategy
2. Enter amount
3. Review
4. Approve
5. Add liquidity

Strategies:
- Simple
- Balanced
- Custom

Advanced controls appear only when needed.

---

## 8. Concentrated Liquidity

If used, UI must explain:
- lower price
- current price
- upper price
- range status

Range status:
- Active
- Out of Range
- Closed

Không chỉ hiển thị technical tick values.

---

## 9. Earn

Hierarchy:
- Your Earning Positions
- Claimable Rewards
- Opportunities

Each opportunity can show:
- asset / pool
- estimated APR
- yield source
- reward end date
- risk

APR details must explain where yield comes from.

---

## 10. Portfolio

Internal navigation:
- Overview
- Assets
- Positions
- Activity

Overview:
- Total Value
- Asset Allocation
- Top Assets
- Liquidity Value
- Earn Value

Không hiển thị exact PnL nếu cost basis không đáng tin.

---

## 11. Financial Number Hierarchy

Use:
```text
Primary amount
→ largest

Fiat equivalent
→ smaller

Supporting metric
→ smaller again
```

Do not truncate meaningful small balances to zero.

---

## 12. Typography

Typography must distinguish:
- Page title
- Section title
- Primary number
- Body
- Secondary label
- Metadata

Không lạm dụng bold, all caps hoặc tiny text.

---

## 13. Spacing

Use a consistent spacing scale, for example:
```text
4 / 8 / 12 / 16 / 24 / 32 / 48
```

Avoid arbitrary magic spacing values without a reason.

---

## 14. Components

Cards group related information only.
Avoid excessive nested cards.

Buttons:
- one strong primary CTA per context
- secondary actions visually quieter
- dangerous actions clearly distinct

Do not over-abstract components before a stable pattern exists.

---

## 15. Transaction UX

Transaction feedback must stay close to the originating action.

Example:
```text
Swap card
↓
Waiting for wallet
↓
Transaction pending
↓
Confirmed
```

Global toasts may supplement, not replace, contextual feedback.

---

## 16. Wallet States

Must design:
- disconnected
- connecting
- connected
- wrong network
- unsupported network
- account switched

Wrong network needs an actionable CTA:
`Switch to Robinhood Chain`.

---

## 17. Warning Levels

Use three levels:
- Info
- Warning
- Block

Security/risk meaning should not depend on color alone.

---

## 18. Empty / Loading / Error States

Empty state must suggest the next useful action.

Loading should preserve layout and minimize jumping.

Error messages should answer:
1. What happened?
2. Are funds safe?
3. What can the user do next?

---

## 19. Responsive Requirements

Evidence must cover at least:
- desktop wide
- desktop narrow
- tablet
- mobile

Each significant feature must define:
- navigation behavior
- card stacking
- table/list conversion
- modal/drawer behavior
- CTA placement
- overflow handling

---

## 20. Mobile Rules

Prioritize:
- single-column flow
- large tap targets
- bottom sheets/full-screen flows when suitable
- sticky primary CTA only when helpful
- no accidental horizontal overflow
- financial values must not lose meaning

---

## 21. Desktop Rules

Prioritize:
- quick scanning
- comparison of financial data
- sensible max content width
- no unlimited content stretching

---

## 22. Tables

Use tables only when comparison benefits from them.

Every table needs a mobile fallback, usually list/card format.

---

## 23. Modal / Drawer

Desktop:
- modal for short actions
- side panel for detail when appropriate

Mobile:
- bottom sheet or full-screen flow when content is substantial

Avoid long forms inside tiny modals.

---

## 24. Design Tokens

Use shared tokens for:
- spacing
- typography
- radius
- border
- elevation
- semantic colors

Avoid scattered hard-coded styling.

---

## 25. Visual Direction

Target:
- clean
- financial
- modern
- calm
- high-trust

Avoid:
- casino-like styling
- neon overload
- excessive gradients
- unnecessary glow
- meme aesthetic

Robex must have its own identity and must not clone Robinhood UI.

---

## 26. Charts

Only use charts when they help a user make a decision.

Charts need:
- clear labels
- timeframe
- data source
- loading/error state

---

## 27. Data Freshness UX

System should distinguish:
- Fresh
- Refreshing
- Stale
- Unavailable

Stale data must not masquerade as live data.

---

## 28. Activity UX

Prefer:
- Swapped
- Added liquidity
- Removed liquidity
- Claimed rewards
- Approved token
- Transferred

Avoid raw contract terminology when Robex can classify the activity correctly.

---

## 29. Accessibility

Consider:
- keyboard navigation
- focus states
- readable contrast
- clear labels
- no color-only meaning

---

## 30. Visual QA Evidence

Every PR with significant UI changes must include runtime evidence for:
- desktop wide
- desktop narrow
- tablet
- mobile

If a breakpoint is not relevant, the PR must explain why.

---

## 31. Visual QA Checklist

Review:
- hierarchy
- alignment
- spacing
- typography
- overflow
- clipping
- button consistency
- card consistency
- warning visibility
- financial readability
- responsive behavior
- loading/error/pending states

---

## 32. Root Cause Rule

Do not patch layout problems with magic numbers when the root cause is structural.

Fix grid/layout architecture when that is the real problem.

---

## 33. Design Review Flow

```text
Feature behavior approved
↓
UX flow
↓
State matrix
↓
Responsive rules
↓
Design critique when needed
↓
Gemini implementation
↓
Runtime screenshots
↓
Visual QA
↓
Human Acceptance
```

---

## 34. Design Ownership

ChatGPT:
- product UX intent
- hierarchy
- acceptance criteria

Gemini:
- implementation

Codex:
- verify behavior and implementation claims

Opus 4.6:
- limited-quota specialist for important design critique only

Human:
- final visual acceptance

---

## 35. Human Acceptance Questions

Before accepting UI:
1. Is the primary action obvious within a few seconds?
2. Can I understand what assets I give and receive?
3. Are risks clear?
4. Are financial values easy to scan?
5. Does mobile feel intentionally designed?
6. Does anything feel generic or AI-generated?
7. Are loading/error/pending states clear?
8. Is there a visual issue automated tests would miss?

---

## 36. Design Success Criteria

Design V1 succeeds when:
- a new user can swap without understanding routing
- advanced users can still inspect details
- Pool does not force users to understand concentrated liquidity immediately
- Earn explains yield sources
- Portfolio is easy to scan
- transaction feedback is clear
- risk is visible
- mobile is intentionally designed
- visual QA uses real runtime evidence
