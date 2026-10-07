# ARCHITECTURE — Robinhood Chain DEX

## 1. Architecture Goal

Kiến trúc phải đáp ứng 4 mục tiêu:

1. Chạy thật trên Robinhood Chain Testnet.
2. Có thể chuyển sang mainnet chủ yếu bằng config và deployment.
3. Không khóa cứng vào một provider hoặc một liquidity source.
4. Dễ kiểm thử, review và mở rộng theo feature.

---

# 2. High-Level Architecture

```text
User
 │
 ▼
Frontend
 │
 ├── Wallet Layer
 ├── UI / Feature Modules
 ├── Client State
 └── Transaction UX
 │
 ▼
Backend / API Layer
 │
 ├── Quote Service
 ├── Route Service
 ├── Token Service
 ├── Price Service
 ├── Portfolio Service
 ├── Provider Layer
 └── Cache
 │
 ├───────────────┬───────────────┬──────────────┐
 ▼               ▼               ▼              ▼
RPC / Chain   Indexer       Robinhood APIs   Liquidity Sources
 │               │               │              │
 ▼               ▼               ▼              ▼
Robinhood Chain          Stock Token Data     Execution
 │
 ▼
On-chain State
```

---

# 3. Core Architecture Principle

Feature không gọi provider bên ngoài trực tiếp.

Không:

```text
SwapPage
→ Uniswap SDK

PortfolioPage
→ Alchemy API

TokenSelector
→ Robinhood API
```

Thay vào đó:

```text
Feature
→ Internal Service
→ Adapter
→ External Provider
```

Ví dụ:

```text
Swap
→ Quote Service
→ Liquidity Adapter
→ Protocol
```

Mục tiêu là giảm:

**Coupling — phụ thuộc chặt giữa feature và provider cụ thể.**

---

# 4. Frontend Layer

Frontend chịu trách nhiệm:

- hiển thị UI
- connect wallet
- lấy dữ liệu từ backend/services
- xây transaction request
- gửi transaction tới wallet
- theo dõi transaction lifecycle
- refetch state sau confirmation
- quản lý state UI

Frontend không chịu trách nhiệm:

- tự aggregate quote
- tự normalize Stock Token data ở từng page
- tự gọi nhiều provider
- tự quyết định trust level của dữ liệu

---

# 5. Frontend Feature Structure

Dự kiến:

```text
src/
├── app/
├── features/
│   ├── home/
│   ├── swap/
│   ├── pool/
│   ├── earn/
│   ├── portfolio/
│   └── wallet/
│
├── components/
├── services/
├── hooks/
├── config/
├── types/
└── utils/
```

Không ép cấu trúc này tuyệt đối trước implementation.

Nhưng ownership theo feature phải rõ.

---

# 6. Wallet Layer

Wallet Layer là abstraction giữa feature và wallet provider.

Feature không nên gọi MetaMask-specific API trực tiếp.

Interface concept:

```text
WalletAdapter

connect()
disconnect()
getAccount()
getChain()
switchChain()
sendTransaction()
signMessage()
```

V1:

- MetaMask-compatible wallets
- Rabby
- WalletConnect-compatible wallets

Future:

- Smart Account
- Account Abstraction
- gas sponsorship
- batch transactions

Swap / Pool / Earn không cần biết wallet loại nào.

---

# 7. Network Configuration

Network config phải tập trung tại một nơi.

Concept:

```text
NetworkConfig

chainId
chainName
rpcUrl
explorerUrl
nativeCurrency
contracts
tokens
providers
```

Testnet và mainnet dùng cùng schema.

Ví dụ:

```text
networks/
├── robinhood-testnet
└── robinhood-mainnet
```

Không hardcode chain ID hoặc contract address rải rác trong component.

---

# 8. Token Registry

Token Registry quản lý các asset mà app hiểu.

Concept:

```text
TokenDefinition

chainId
address
symbol
name
decimals
logo
assetType
verified
metadataSource
```

Asset type có thể gồm:

```text
NATIVE
ERC20
STABLECOIN
STOCK_TOKEN
ETF_TOKEN
```

Token Registry không phải nguồn balance.

Nó là nguồn metadata và identity.

---

# 9. Stock Token Normalization Layer

Stock Tokens phải đi qua một normalization layer dùng chung.

Concept:

```text
Raw Token Data
      ↓
Stock Token Normalizer
      ↓
Normalized Asset Model
```

Normalized model có thể chứa:

```text
rawBalance
displayBalance
multiplier
referencePrice
marketPrice
tradability
```

Không được để:

```text
Swap tự xử lý multiplier
Portfolio tự xử lý multiplier
Pool tự xử lý multiplier
```

Mọi feature phải dùng cùng logic.

---

# 10. Backend Layer

Backend là service layer non-custodial.

Backend không giữ private key.

Backend không ký transaction thay user.

Backend có thể:

- đọc provider
- aggregate dữ liệu
- normalize dữ liệu
- cache dữ liệu
- chuẩn bị transaction payload
- trả transaction request cho frontend

---

# 11. Quote Service

Quote Service nhận yêu cầu swap.

Input concept:

```text
chainId
tokenIn
tokenOut
amountIn
walletAddress
slippagePreference
```

Sau đó:

```text
Quote Service
       ↓
Quote Adapters
 ┌─────┼───────┐
 │     │       │
Source A   Source B   Source C
```

Mỗi source trả về internal quote format chung.

---

# 12. Internal Quote Model

Ví dụ:

```text
Quote

source
route
tokenIn
tokenOut
amountIn
expectedAmountOut
minimumAmountOut
estimatedGas
priceImpact
expiresAt
transactionRequest
metadata
```

Frontend không cần hiểu format riêng của từng protocol.

---

# 13. Quote Adapter

**Adapter — bộ chuyển đổi giữa protocol bên ngoài và model nội bộ.**

Ví dụ:

```text
UniswapAdapter
RFQAdapter
FutureAdapter
```

Adapter chịu trách nhiệm:

```text
external protocol data
        ↓
normalize
        ↓
internal Quote model
```

---

# 14. Route Service

Route Service so sánh các quote hợp lệ.

Không chỉ lấy:

```text
amountOut lớn nhất
```

mà có thể cân nhắc:

```text
output
gas
price impact
quote freshness
execution risk
route availability
```

V1 có thể dùng logic đơn giản.

Interface phải cho phép mở rộng sau.

---

# 15. Execution Boundary

Backend có thể trả:

```text
transactionRequest
```

nhưng frontend gửi request này tới wallet.

Flow:

```text
Backend prepares
      ↓
Frontend validates
      ↓
Wallet presents
      ↓
User confirms
      ↓
Chain executes
```

Backend không tự submit bằng key của user.

---

# 16. Price Service

Price Service là nơi duy nhất normalize pricing semantics.

Input:

```text
asset
priceType
```

Các price type có thể gồm:

```text
REFERENCE
MARKET_BID
MARKET_ASK
EXECUTION
PORTFOLIO
```

Feature không tự chọn provider.

---

# 17. Reference Price

Reference price có thể đến từ oracle.

Dùng cho:

- portfolio valuation
- risk checks
- price deviation
- informational display

Không được dùng làm executable quote nếu liquidity source không hỗ trợ mức giá đó.

---

# 18. Portfolio Service

Portfolio Service tổng hợp:

```text
Wallet assets
Liquidity positions
Earn positions
Activity
Valuation
```

Data có thể đến từ nhiều adapter.

Architecture:

```text
Portfolio Service
      ↓
 ┌────┼─────────┬─────────┐
Wallet Adapter  Pool Adapter  Earn Adapter
```

---

# 19. Portfolio Position Model

Internal model concept:

```text
Position

protocol
type
assets
value
status
source
updatedAt
confidence
```

Type có thể là:

```text
WALLET_ASSET
LIQUIDITY
EARN
```

---

# 20. Data Confidence

Dữ liệu cần biết độ tin cậy.

Concept:

```text
VERIFIED_ONCHAIN
INDEXED
ESTIMATED
STALE
UNAVAILABLE
```

Không nhất thiết show kỹ thuật này trực tiếp cho user.

Nhưng logic hệ thống phải biết.

---

# 21. Indexer Layer

Indexer dùng cho:

- transaction history
- activity
- event discovery
- position discovery
- historical data

Indexer không thay blockchain source of truth cho ownership quan trọng.

Nếu indexer và chain khác nhau:

```text
chain wins
```

---

# 22. Provider Abstraction

External provider phải nằm sau provider interface.

Ví dụ:

```text
RpcProvider
IndexerProvider
PriceProvider
StockTokenProvider
```

Feature không biết provider cụ thể là:

```text
Alchemy
Provider B
Provider C
```

Điều này giúp:

- đổi provider
- failover
- test bằng mock provider
- tránh lock-in

---

# 23. Provider Failure Strategy

Provider có thể:

- timeout
- trả lỗi
- rate limit
- stale
- trả dữ liệu thiếu

Architecture phải support:

```text
Primary Provider
      ↓ fail
Secondary Provider
```

Nhưng:

**No silent fallback.**

Fallback phải:

- observable
- log được
- biết source cuối cùng là gì

---

# 24. Cache Layer

Cache dùng để:

- giảm API request
- tăng tốc UI
- tránh vượt rate limit

Không phải mọi dữ liệu có cùng TTL.

Ví dụ concept:

```text
Token metadata
→ cache lâu

Corporate actions
→ cache vừa

Portfolio
→ cache ngắn

Swap quote
→ cache cực ngắn hoặc không cache
```

**TTL — thời gian dữ liệu cache còn hợp lệ.**

---

# 25. Stale Data Handling

Mỗi cached value cần:

```text
updatedAt
expiresAt
source
```

Nếu stale:

```text
refresh
```

Nếu refresh thất bại:

- giữ stale data chỉ khi UX cho phép
- phải biết đó là stale
- không dùng stale data cho action nhạy cảm nếu policy không cho phép

---

# 26. Transaction Lifecycle Architecture

Frontend transaction state machine:

```text
IDLE
↓
PREPARING
↓
AWAITING_WALLET
↓
SUBMITTED
↓
PENDING
↓
CONFIRMED
↓
REFETCHING_STATE
↓
SUCCESS
```

Failure branches:

```text
REJECTED
REVERTED
EXPIRED
NETWORK_ERROR
PROVIDER_ERROR
```

Không được nhảy:

```text
AWAITING_WALLET
→ SUCCESS
```

---

# 27. State Invalidation

Khi transaction confirmed:

invalidate dữ liệu liên quan.

Ví dụ Swap:

```text
balances
allowances
portfolio
activity
```

Pool:

```text
positions
balances
pool state
portfolio
```

Earn:

```text
rewards
positions
portfolio
```

---

# 28. Account Switch

Khi wallet account thay đổi:

```text
clear user-specific cache
cancel stale requests
reset transaction context
refetch new account
```

Không được render dữ liệu ví cũ dưới ví mới.

---

# 29. Chain Switch

Khi chain thay đổi:

```text
invalidate chain-specific data
reload network config
reload token registry
reload contract addresses
reset quotes
reset pending action context
```

---

# 30. Security Layer

Security checks không nằm rải rác.

Nên có internal services/policies cho:

```text
Token verification
Contract allowlist
Quote validation
Price deviation
Stale quote
Slippage
Liquidity risk
Approval policy
```

---

# 31. Contract Allowlist

Mọi transaction request từ external source phải được kiểm:

```text
target contract
→ allowlisted?
```

Không execute arbitrary contract từ external API.

---

# 32. Token Verification

Token có status:

```text
VERIFIED
UNVERIFIED
BLOCKED
```

V1 default token selector ưu tiên VERIFIED.

Blocked token không được execute.

---

# 33. Approval Architecture

Approval flow tách khỏi Swap business logic.

Concept:

```text
Allowance Service
      ↓
check allowance
      ↓
needs approval?
```

Default:

```text
EXACT
```

Future:

```text
UNLIMITED
PERMIT
```

nếu protocol hỗ trợ.

---

# 34. Pool Architecture

Pool feature không phụ thuộc trực tiếp một protocol.

Concept:

```text
Pool Service
     ↓
Pool Adapter
     ↓
Liquidity Protocol
```

Internal models:

```text
Pool
LiquidityPosition
LiquidityAction
```

---

# 35. Concentrated Liquidity Abstraction

Nếu protocol hỗ trợ concentrated liquidity:

Internal position model phải có thể chứa:

```text
priceLower
priceUpper
currentPrice
rangeStatus
```

Range status:

```text
IN_RANGE
OUT_OF_RANGE
CLOSED
UNKNOWN
```

---

# 36. Earn Architecture

Earn không giả định mọi yield đến từ staking.

Internal opportunity model:

```text
EarnOpportunity

type
source
assets
estimatedApr
rewardAssets
startTime
endTime
risk
```

Type:

```text
LIQUIDITY_FEES
LIQUIDITY_INCENTIVE
STAKING
FEE_SHARING
```

V1 chủ yếu dùng hai loại đầu.

---

# 37. Activity Architecture

Raw blockchain event không render thẳng lên UI.

Flow:

```text
Raw Transaction/Event
        ↓
Activity Parser
        ↓
Human-readable Activity
```

Activity type:

```text
SWAP
ADD_LIQUIDITY
REMOVE_LIQUIDITY
CLAIM
TRANSFER
APPROVAL
UNKNOWN
```

UNKNOWN vẫn được giữ, nhưng không giả định sai action.

---

# 38. Logging and Observability

**Observability — khả năng biết hệ thống đang xảy ra chuyện gì.**

Backend cần log:

```text
request
provider used
fallback used
quote source
latency
error
transaction reference
```

Không log:

```text
private key
seed phrase
sensitive wallet secrets
```

---

# 39. Error Classification

Không dùng một lỗi chung:

```text
Something went wrong
```

Internal error categories:

```text
USER_ERROR
NETWORK_ERROR
PROVIDER_ERROR
QUOTE_ERROR
LIQUIDITY_ERROR
SECURITY_ERROR
CHAIN_ERROR
UNKNOWN_ERROR
```

UI chuyển chúng thành message dễ hiểu.

---

# 40. Mainnet/Testnet Separation

Không dùng branch riêng cho mainnet logic.

Dùng configuration.

```text
App
 ↓
Environment
 ├── Testnet Config
 └── Mainnet Config
```

Mainnet config không tự được kích hoạt bởi agent.

---

# 41. Secrets Management

Các secret như:

```text
provider API key
backend secret
monitoring token
```

không commit vào repo.

Dùng:

```text
.env.local
deployment secrets
CI secrets
```

Repository chỉ giữ `.env.example`.

---

# 42. Git Architecture Rule

Feature nên có ownership area rõ.

Ví dụ:

```text
features/swap
services/quote
adapters/liquidity
```

Điều này giúp chia agent work mà không sửa cùng file.

---

# 43. Agent Ownership

## Gemini

Primary ownership:

```text
implementation code
feature tests
runtime implementation fixes
```

## Opus 4.6

Specialist ownership khi được escalation:

```text
architecture trade-offs
security reasoning
ambiguous root-cause analysis
hard bug investigation
important design critique
second opinion
```

Opus không phải co-builder mặc định và không dùng cho routine work.

## Codex

Read/review ownership.

Không mặc định edit feature đang review.

---

# 44. Architecture Decision Records

Các quyết định kỹ thuật lớn nên lưu thành:

```text
docs/architecture/decisions/
```

Ví dụ:

```text
ADR-001-wallet-abstraction.md
ADR-002-provider-abstraction.md
ADR-003-quote-routing.md
```

**ADR — Architecture Decision Record, bản ghi lý do tại sao ta chọn một kiến trúc.**

Không cần ADR cho quyết định nhỏ.

---

# 45. Testing Architecture

Testing chia theo layer.

## Unit Tests

Kiểm:

- normalization
- routing rules
- calculations
- formatting
- state transitions

## Integration Tests

Kiểm:

- service + adapter
- provider responses
- wallet interaction boundaries
- backend endpoints

## Runtime / E2E

**E2E — kiểm thử xuyên suốt từ đầu đến cuối.**

Kiểm:

- connect wallet
- get quote
- approve
- swap
- confirmation
- state refresh

## On-chain Verification

Kiểm trực tiếp:

- transaction receipt
- balances
- position state
- contract state

---

# 46. Evidence Mapping

```text
Architecture claim
→ source inspection

Logic claim
→ test

Integration claim
→ integration test

Wallet UX claim
→ browser/runtime

Transaction claim
→ tx hash + receipt

On-chain state claim
→ RPC read

Responsive claim
→ viewport screenshots
```

---

# 47. V1 Deployment Model

Concept:

```text
Frontend
→ hosted web app

Backend
→ hosted API service

Blockchain
→ Robinhood Chain Testnet

Providers
→ external infrastructure
```

Exact hosting provider chưa cần chốt trong architecture V0.

---

# 48. Things We Intentionally Do Not Own in V1

Không tự xây:

- blockchain
- wallet
- AMM protocol
- oracle
- indexer
- bridge
- matching engine
- Smart Account infrastructure
- custom MEV system

Nếu một requirement mới đòi tự xây các phần này:

phải tạo architecture review mới.

---

# 49. Architecture Invariants

Các rule không được phá mà không có explicit architecture decision:

1. Backend không custody user funds.
2. Feature không gọi external provider trực tiếp.
3. Wallet signing luôn cần user authority.
4. Chain là source of truth cuối cùng cho ownership.
5. Testnet không dùng fake success.
6. External data phải qua validation/normalization.
7. Mainnet deployment là human-only gate.
8. Reviewed code không được silent rewrite.
9. One task has one primary implementation owner.
10. Evidence phải phù hợp với claim.

---

# 50. Architecture Success Criteria

Architecture V1 được xem là đạt khi:

- Swap source có thể thêm bằng adapter mới.
- Provider có thể đổi mà không sửa feature.
- Testnet/mainnet dùng cùng application logic.
- Wallet layer không khóa cứng MetaMask.
- Stock Token multiplier được xử lý tập trung.
- Portfolio hỗ trợ nhiều position adapter.
- Transaction lifecycle có state rõ.
- Account/chain switch không làm rò state cũ.
- Backend không giữ user key.
- Agent có ownership boundary rõ.