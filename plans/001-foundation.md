# Plan 001 — Foundation

## 1. Goal

Dựng nền móng kỹ thuật đầu tiên cho Robex để các feature sau có thể phát triển theo cùng architecture, design rules và agent workflow.

Plan này không triển khai Swap/Pool/Earn/Portfolio hoàn chỉnh.

---

## 2. Scope

Gemini triển khai:

- frontend application skeleton
- lightweight backend/API skeleton
- shared TypeScript configuration
- network configuration foundation
- wallet abstraction foundation
- provider/service/adapter boundaries
- token/asset model foundation
- transaction state model foundation
- test baseline
- lint/typecheck/build baseline
- environment/secrets baseline
- repository structure needed for later plans

---

## 3. Non-goals

Không làm trong Plan 001:

- executable swap
- liquidity pool integration
- Earn logic
- Portfolio aggregation
- Stock Token pricing implementation
- production RPC integration
- custom smart contracts
- mainnet deployment
- Smart Account UX
- real transaction execution
- final visual design of product pages

---

## 4. Required Repository Shape

Target concept:

```text
/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── config/
│   ├── types/
│   └── core/
│
├── plans/
├── docs/
│   ├── ai/
│   ├── qa/
│   └── architecture/
│       └── decisions/
│
├── PRD.md
├── ARCHITECTURE.md
├── DESIGN.md
├── AGENTS.md
├── .gitignore
├── .env.example
├── package.json
└── README.md
```

Gemini có thể điều chỉnh chi tiết nếu toolchain yêu cầu, nhưng phải giữ boundary rõ giữa frontend, backend và shared code.

Không tạo abstraction dư thừa chỉ để khớp cây thư mục mẫu.

---

## 5. Frontend Foundation

Frontend phải có tối thiểu:

- app bootstrap
- global layout
- navigation shell:
  - Home
  - Swap
  - Pool
  - Earn
  - Portfolio
- wallet control placeholder
- responsive shell
- shared error boundary
- loading boundary khi framework hỗ trợ
- base design tokens

Các page ở Plan 001 chỉ là shell.

Không giả lập financial data như dữ liệu thật.

---

## 6. Backend Foundation

Backend/API phải có:

- health endpoint
- service layer structure
- adapter/provider boundary
- centralized error shape
- basic logging boundary
- configuration validation

Không cần database trong Plan 001 nếu chưa có requirement cụ thể.

Không giữ private key hoặc signing logic.

---

## 7. Network Configuration

Tạo centralized network config.

Tối thiểu model phải hỗ trợ:

```text
chainId
chainName
rpcUrl
explorerUrl
nativeCurrency
contracts
providers
```

Robinhood Chain Testnet là active target.

Mainnet config có thể có schema/placeholder nhưng không được tự kích hoạt.

Không hardcode network values rải rác trong feature component.

---

## 8. Wallet Abstraction

Tạo wallet boundary đủ để các feature sau không phụ thuộc trực tiếp vào MetaMask-specific API.

Concept:

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

Plan 001 có thể chỉ dựng interface + provider integration foundation.

Không cần hoàn thiện real wallet transaction flow nếu việc đó thuộc plan sau.

---

## 9. Service / Adapter Boundary

Phải chứng minh architecture này có thể tồn tại trong code:

```text
Feature
→ Internal Service
→ Adapter
→ External Provider
```

Không để page/component gọi external provider trực tiếp.

Plan 001 không cần tích hợp nhiều provider thật.

---

## 10. Asset Model Foundation

Tạo shared model cho asset/token.

Tối thiểu hỗ trợ concept:

```text
NATIVE
ERC20
STABLECOIN
STOCK_TOKEN
ETF_TOKEN
```

Model không cần chứa mọi field cuối cùng, nhưng phải cho phép mở rộng Stock Token normalization sau này.

---

## 11. Transaction State Foundation

Tạo shared transaction state model cho các flow sau này.

Tối thiểu:

```text
IDLE
PREPARING
AWAITING_WALLET
SUBMITTED
PENDING
CONFIRMED
REFETCHING_STATE
SUCCESS
REJECTED
REVERTED
EXPIRED
NETWORK_ERROR
PROVIDER_ERROR
```

Không tạo fake success path.

---

## 12. Environment and Secrets

Repository phải có:

- `.env.example`
- không commit secret thật
- config validation cho biến bắt buộc
- local development guidance

Không đưa API key thật vào source.

---

## 13. Quality Baseline

Phải có commands rõ ràng cho:

- install
- dev
- build
- lint
- typecheck
- test

Nếu dùng monorepo, root commands phải chạy được từ repository root.

---

## 14. Test Baseline

Tối thiểu có automated tests cho foundation logic có ý nghĩa, ví dụ:

- network config validation
- transaction state model hoặc transition helper
- shared asset model helper nếu có logic
- configuration parsing

Không viết test chỉ để tăng số lượng.

---

## 15. Responsive Baseline

Shell UI phải được runtime-check trên:

- desktop wide
- desktop narrow
- tablet
- mobile

Evidence phải là screenshot/runtime evidence thật.

Không cần final visual polish ở Plan 001.

---

## 16. Documentation

Gemini phải cập nhật README đủ để một agent mới có thể:

1. install dependencies
2. run frontend/backend
3. run tests
4. understand repository layout
5. know which environment variables are required

Không duplicate toàn bộ PRD/Architecture vào README.

---

## 17. Git Rules

Implementation phải diễn ra trên branch riêng cho Plan 001.

Không commit trực tiếp vào `main`.

Không silent rewrite sau review.

Post-review fix phải là commit mới.

---

## 18. Required Evidence

Builder handoff phải có:

- branch name
- commit SHA(s)
- files changed
- commands run
- build result
- lint result
- typecheck result
- test result
- runtime verification result
- screenshots for required viewport sizes
- known limitations
- open questions
- PR link

Agent report không thay thế evidence.

---

## 19. Acceptance Criteria

Plan 001 đạt khi:

1. Repository có runnable frontend foundation.
2. Repository có runnable backend/API foundation.
3. Root development commands hoạt động.
4. Network config được centralized.
5. Wallet abstraction boundary tồn tại.
6. Service → Adapter → Provider boundary tồn tại.
7. Asset model foundation tồn tại.
8. Transaction state foundation tồn tại.
9. Secrets không bị commit.
10. Build pass.
11. Lint pass.
12. Typecheck pass.
13. Automated tests pass.
14. Responsive shell có runtime evidence trên 4 viewport groups.
15. README đủ để setup project.
16. Codex independent review không còn BLOCKER/HIGH.
17. Human Acceptance được thực hiện trước merge.

---

## 20. Human Acceptance

Human không cần review source line-by-line.

ChatGPT phải cung cấp Human Summary ngắn trước acceptance.

Human cần kiểm:

- app chạy được
- navigation shell có đúng 5 khu vực
- desktop/mobile không vỡ rõ ràng
- product không hiển thị fake financial success/data
- project direction vẫn đúng Robex

---

## 21. Stop Conditions

Gemini phải dừng và báo thay vì tự mở rộng scope nếu:

- cần custom smart contract
- cần chọn liquidity protocol cho Swap
- cần chọn production RPC/provider
- cần thay đổi architecture invariant
- cần mainnet config hoạt động thật
- cần secret/key mà repo chưa có
- phát hiện foundation docs mâu thuẫn với implementation requirement

---

## 22. Reviewer Focus

Codex review tập trung:

- scope discipline
- repository boundaries
- hidden provider coupling
- hardcoded network assumptions
- fake success/state
- secret leakage
- build/lint/typecheck/test evidence
- responsive runtime evidence
- mismatch với PRD/ARCHITECTURE/DESIGN/AGENTS

Không yêu cầu refactor chỉ vì code có thể “đẹp hơn”.

---

## 23. Completion Flow

```text
Plan approved
↓
Gemini implementation
↓
Builder self-verification
↓
Push + PR
↓
Codex independent review
↓
Gemini fix commit if needed
↓
Focused re-review
↓
ChatGPT Human Summary
↓
Human Acceptance
↓
Merge main
```
