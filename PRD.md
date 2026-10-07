# PRD — Robinhood Chain DEX

## 1. Product Vision

Xây một DEX chạy thật trên **Robinhood Chain Testnet**, nhưng được thiết kế để có thể chuyển sang mainnet mà không cần viết lại sản phẩm.

Sản phẩm không phải demo học AMM.

Sản phẩm là một **DEX application layer** — lớp ứng dụng giao dịch đứng trên nhiều nguồn thanh khoản, dữ liệu và protocol khác nhau.

Bốn trụ chính:

- Swap
- Pool
- Earn
- Portfolio

---

# 2. Product Goal

DEX phải cho phép người dùng:

1. Kết nối ví.
2. Xem tài sản trên Robinhood Chain.
3. Swap token qua nguồn thanh khoản tốt nhất.
4. Khám phá và quản lý liquidity position.
5. Xem cơ hội tạo lợi suất.
6. Theo dõi Portfolio và activity.
7. Sử dụng Stock Tokens khi các asset này phù hợp và có dữ liệu đáng tin cậy.

Ứng dụng phải chạy với transaction thật và state thật trên Robinhood Chain Testnet.

---

# 3. Core Principles

## 3.1 Mainnet-capable

Testnet và mainnet phải sử dụng cùng:

- application logic
- interfaces
- service architecture
- transaction flow
- state handling

Khác nhau chủ yếu ở:

- chain configuration
- RPC
- contract addresses
- token addresses
- provider configuration
- liquidity availability

Không được tạo fake logic riêng cho testnet.

---

## 3.2 Non-custodial

Ứng dụng không giữ tài sản của người dùng.

Backend không được:

- giữ private key
- ký transaction thay user
- tự rút tài sản
- custody asset

Wallet của user luôn là nơi xác nhận transaction.

---

## 3.3 Evidence over assumptions

Nếu hệ thống không biết dữ liệu có đáng tin hay không:

- không tự đoán
- không hiển thị estimate như fact
- phải thể hiện trạng thái unavailable / stale / estimated khi phù hợp

---

# 4. Target Users

## 4.1 Primary User

Người dùng Web3 muốn:

- swap tài sản
- quản lý liquidity
- xem yield
- theo dõi portfolio

User không bắt buộc phải là DeFi expert.

UX phải ưu tiên:

**Simple first, advanced when needed.**

---

## 4.2 Advanced User

User có kinh nghiệm hơn có thể cần xem:

- routing
- slippage
- price impact
- minimum received
- fee tier
- liquidity range
- transaction details

Thông tin nâng cao được cung cấp nhưng không làm UX mặc định quá phức tạp.

---

# 5. Navigation

Navigation chính:

- Home
- Swap
- Pool
- Earn
- Portfolio

Wallet control nằm ở vùng global navigation.

---

# 6. Feature — Home

Home là trang tổng quan.

## Connected state

Hiển thị:

- total portfolio value
- top assets
- active positions
- quick actions
- recent activity

Quick actions:

- Swap
- Add Liquidity
- Earn

## Disconnected state

App vẫn hỗ trợ read-only mode.

User có thể:

- xem markets
- xem pools
- xem opportunities
- xem token information

Action cần transaction sẽ yêu cầu connect wallet.

---

# 7. Feature — Swap

## 7.1 Product Definition

Swap là một **Aggregator** — bộ tổng hợp nhiều nguồn thanh khoản.

App phải có:

- Quote Engine
- Route Engine
- Execution Adapter layer

V1 có thể chỉ tích hợp ít nguồn.

Architecture phải cho phép thêm nguồn mới mà không redesign toàn bộ Swap.

---

## 7.2 Basic Swap Flow

User:

1. chọn token bán
2. chọn token nhận
3. nhập amount
4. hệ thống lấy quote
5. hệ thống chọn route tốt nhất
6. user review
7. approve nếu cần
8. confirm transaction
9. transaction pending
10. transaction confirmed
11. balance/state được refetch

---

## 7.3 Swap Information

Basic view phải hiển thị tối thiểu:

- amount user trả
- amount dự kiến nhận
- price impact
- CTA chính

Advanced details có thể hiển thị:

- route
- slippage
- minimum received
- estimated gas
- quote expiration
- reference price
- execution source

---

## 7.4 Swap Safety

Bắt buộc:

- quote expiration
- slippage protection
- minimum received
- liquidity check
- price impact warning
- stale quote handling
- contract allowlist
- verified token policy

Không execute quote hết hạn.

---

## 7.5 Reference Price vs Execution Price

Reference price:

- dùng để tham chiếu
- risk checking
- portfolio valuation

Execution price:

- giá user thật sự có thể giao dịch

Hai khái niệm không được trộn lẫn.

---

# 8. Feature — Pool

## 8.1 Product Definition

Pool không sở hữu custom AMM trong V1.

Pool là giao diện quản lý liquidity trên protocol bên dưới.

---

## 8.2 Pool Navigation

Pool gồm:

### Explore

User có thể xem:

- token pair
- TVL
- volume
- fee tier
- estimated APR nếu dữ liệu đáng tin
- risk summary

### My Positions

User có thể xem:

- current value
- deposited assets
- earned fees
- range status
- pool share / position information

---

## 8.3 Pool Actions

User có thể:

- add liquidity
- remove liquidity
- increase position nếu protocol hỗ trợ
- inspect position

---

## 8.4 Concentrated Liquidity UX

Nếu underlying protocol sử dụng concentrated liquidity:

App phải hỗ trợ concept price range.

V1 ưu tiên guided UX:

- Simple
- Balanced
- Custom

Advanced parameter không được ép user mới phải hiểu ngay.

---

# 9. Feature — Earn

## 9.1 Product Definition

Earn chỉ hiển thị nguồn lợi suất có economic source rõ ràng.

V1 ưu tiên:

- LP trading fees
- external liquidity incentives
- claimable rewards

---

## 9.2 Không tạo fake reward economics

V1 không tạo protocol token chỉ để có staking.

Không có:

- infinite reward emission
- artificial staking yield
- reward không có nguồn rõ ràng

---

## 9.3 Yield Display

Nếu hiển thị APR:

App phải biết:

- APR lấy từ đâu
- dữ liệu mới đến đâu
- công thức gì

APR nên được tách:

- Trading APR
- Incentive APR
- Total Estimated APR

Không sử dụng từ “guaranteed” nếu yield biến động.

---

## 9.4 Earn Risk

Mỗi opportunity cần có risk summary.

Có thể gồm:

- variable yield
- impermanent loss
- smart contract risk
- reward expiration
- out-of-range risk

---

# 10. Feature — Portfolio

## 10.1 Product Definition

Portfolio không giới hạn ở activity của DEX.

Portfolio hiển thị những tài sản và vị thế trên Robinhood Chain mà hệ thống có thể hiểu với dữ liệu đáng tin.

---

## 10.2 Portfolio Sections

### Overview

- total value
- asset allocation
- top assets
- liquidity value
- earn value

### Assets

- ETH
- stablecoins
- Stock Tokens
- verified ERC-20

### Positions

- liquidity positions
- earn positions

### Activity

- swaps
- add liquidity
- remove liquidity
- claims
- transfers
- approvals

---

## 10.3 Human-readable Activity

Không hiển thị raw contract interaction nếu app hiểu được action.

Ưu tiên:

“Swapped 2 AAPL → 426 USDG”

thay vì:

“Contract Interaction 0x…”

---

## 10.4 PnL

Exact PnL không phải requirement V1.

Chỉ hiển thị PnL khi cost basis có thể được xác định đáng tin.

Không tự suy đoán giá vốn.

---

# 11. Wallet

## 11.1 V1

External wallet first.

Mục tiêu hỗ trợ:

- MetaMask
- Rabby
- WalletConnect-compatible wallets

---

## 11.2 Architecture

Wallet architecture phải theo hướng Hybrid.

Sau này có thể hỗ trợ Smart Account mà không rewrite toàn bộ Swap / Pool / Earn.

Potential future capabilities:

- batch transactions
- gas sponsorship
- session policy
- account abstraction

Không phải requirement V1.

---

# 12. Robinhood Stock Tokens

Stock Tokens phải được hỗ trợ ở architecture level từ đầu.

Hệ thống phải phân biệt:

- raw token amount
- display-adjusted amount

Không được để mỗi feature xử lý multiplier riêng.

Phải có normalization layer dùng chung cho:

- Swap
- Portfolio
- Pool
- Earn

---

# 13. Data Architecture Requirements

Dữ liệu được chia theo nguồn.

## Blockchain / RPC

Source of truth cho:

- balances
- ownership
- contract state
- transaction receipt

## Indexer

Dùng cho:

- transaction history
- activity
- historical events
- position discovery

## Robinhood APIs

Dùng cho:

- Stock Token metadata
- trading information
- corporate-action-related data

## Chainlink

Dùng cho:

- reference price
- portfolio valuation
- risk checking

## Liquidity Protocols

Dùng cho:

- executable quotes
- pool state
- transaction execution

---

# 14. Backend

Backend là non-custodial service layer.

Có thể xử lý:

- quote aggregation
- routing
- token metadata
- price normalization
- portfolio aggregation
- caching
- rate limiting
- provider abstraction

Backend không được giữ user private key.

---

# 15. Security Requirements

Bắt buộc có:

- verified token list
- contract allowlist
- exact approval default
- quote expiry
- slippage protection
- minimum received
- price deviation checks
- liquidity checks
- stale-data handling
- provider failure handling
- transaction receipt verification
- account switch invalidation
- chain switch invalidation

---

# 16. Approval Policy

Exact approval là default.

Nếu sau này hỗ trợ unlimited approval:

- user phải được thông báo rõ
- spender contract phải được hiển thị
- amount / approval type phải rõ ràng

---

# 17. Transaction Lifecycle

Không được coi wallet confirmation là transaction success.

Lifecycle:

Ready  
→ wallet confirmation  
→ submitted  
→ pending  
→ confirmed  
→ refetch state  
→ success

Failure states phải gồm:

- user rejected
- transaction reverted
- provider error
- quote expired
- wrong network
- insufficient gas
- insufficient balance

---

# 18. State Matrix Requirement

Mỗi async feature phải định nghĩa state trước implementation.

Tối thiểu phải xem xét:

- disconnected
- wrong network
- loading
- ready
- empty
- error
- stale
- pending
- confirmed
- rejected
- account switched
- chain switched

---

# 19. Responsive Requirement

Không được xem responsive behavior là mặc định đúng.

UI feature quan trọng phải được kiểm bằng evidence trên tối thiểu:

- desktop wide
- desktop narrow
- tablet
- mobile

---

# 20. Design Principles

Design phải ưu tiên:

- financial readability
- clear hierarchy
- clear risk
- clear transaction status
- low cognitive load
- progressive disclosure
- consistency

Không được hy sinh thông tin tài chính quan trọng chỉ để UI nhìn đơn giản.

---

# 21. V1 Scope

V1 gồm:

- Home
- Swap aggregator
- Pool management
- Earn
- Portfolio
- wallet integration
- Robinhood Chain Testnet
- Stock Token-aware architecture
- backend
- provider abstraction
- security baseline
- responsive UX
- Git/GitHub workflow
- runtime evidence
- visual QA

---

# 22. V1 Non-goals

Không phải V1:

- custom AMM
- custom blockchain
- custom oracle
- custom indexer
- protocol token
- DAO governance
- protocol fee sharing
- limit orders
- cross-chain swap
- perpetuals
- Lighter integration
- gas sponsorship
- full Smart Account UX
- advanced MEV system
- exact PnL
- tax reporting
- multi-chain portfolio

---

# 23. Mainnet Capability vs Mainnet Readiness

Mainnet-capable:

Architecture có thể chạy mainnet bằng cấu hình và deployment phù hợp.

Mainnet-ready cần thêm:

- security audit
- contract audit nếu có custom contracts
- production providers
- monitoring
- incident response
- key management
- operational controls
- legal/compliance review nếu cần
- explicit human approval

Không agent nào được tự deploy mainnet.

---

# 24. Agent Model

## ChatGPT

Role:

Orchestrator.

Responsibilities:

- product decisions
- task decomposition
- scope control
- dependency coordination
- conflict resolution
- workflow governance

---

## Gemini / Antigravity

Role:

Primary Builder.

Responsibilities:

- implementation
- direct implementation tests
- runtime verification
- bug fixes

Builder handoff là claim, không phải final verdict.

---

## Opus 4.6

Role:

Limited-Quota Specialist.

Responsibilities:

- difficult architecture trade-offs
- difficult security reasoning
- ambiguous root-cause analysis
- hard bug investigation
- important design critique
- second opinion trước quyết định khó đảo ngược

Không dùng Opus cho routine coding, simple refactor, repetitive documentation hoặc standard review. Quota phải được bảo vệ.

---

## Codex

Role:

Independent Reviewer.

Responsibilities:

- verify source
- verify tests
- verify runtime evidence
- identify regression
- challenge claims
- issue PASS / FAIL / limitation findings

Codex không được tự sửa code rồi tự approve cùng task.

---

## Human

Role:

Final authority.

Human controls:

- acceptance
- merge
- release
- destructive Git operations
- mainnet deployment

---

# 25. Git/GitHub Rules

Workflow:

Spec approved  
→ feature branch  
→ implementation  
→ self-verification  
→ scoped commit  
→ PR  
→ independent review  
→ fix commit  
→ focused re-review  
→ Human Acceptance  
→ merge

Không silent rewrite sau review.

Post-review fix phải là commit mới.

---

# 26. Evidence Rules

Không có DONE chỉ dựa trên agent report.

Evidence tùy task:

UI claim  
→ runtime screenshot

logic claim  
→ tests

wallet claim  
→ real wallet runtime

transaction claim  
→ transaction receipt / hash

on-chain claim  
→ RPC / contract read

responsive claim  
→ real viewport evidence

---

# 27. Success Criteria for V1

V1 được coi là đạt mục tiêu khi:

1. User có thể connect wallet trên Robinhood Chain Testnet.
2. Swap flow hoạt động end-to-end bằng transaction thật.
3. Pool position có thể được xem và quản lý qua protocol tích hợp.
4. Earn hiển thị yield có nguồn rõ ràng.
5. Portfolio phản ánh tài sản và positions đáng tin.
6. Transaction state không được giả.
7. UI hoạt động tốt trên desktop và mobile.
8. Agent workflow hoạt động đúng với independent review.
9. Git/GitHub history rõ ràng, reviewable.
10. Human Acceptance được thực hiện trước merge/release.

---

# 28. Five Golden Rules

1. Design/spec first.
2. One builder, one independent reviewer.
3. No DONE without evidence.
4. Fix systems, not symptoms.
5. Human Acceptance before merge/release.