# ROBEX — Project Handoff

> Snapshot updated: 2026-10-11 · repository: `alidangkile/robex` · `main` HEAD `7d14d71cc104a0ee62cce16fc2d074354cf06dc6` (recheck current HEAD before use).
> Purpose: sổ bàn giao chung cho Owner và các agent. Source files và live PR state trên GitHub là nguồn sự thật; file này phải được cập nhật sau mỗi merge hoặc thay đổi vai trò.

## 1. Team (từ 2026-10-11)

| Thành viên | Vai trò |
|---|---|
| Owner (Human) | Duyệt Plan, Human Acceptance, merge, mainnet |
| Claude | Mentor, Planner / Orchestrator, review cuối, báo cáo |
| Gemini | Builder |
| Grok | Independent QA (chỉ báo lỗi, không tự sửa) |

Chi tiết: `AGENTS.md`. Ngoại lệ chuyển tiếp: Grok hoàn tất PR #14 với vai Builder.

## 2. Product

- **Robex:** non-custodial DEX trên **Robinhood Chain Testnet (chain ID 46630)**. Scope: Swap, Pool, Earn, Portfolio. Kiến trúc hướng tới mainnet, nhưng **mainnet use/deployment chưa được phép**.

## 3. Đã merge vào `main`

- Plan 001 Foundation (#2, #3)
- Plan 002 Wallet / network (#4, #5)
- UI refresh v2 (#7) và 3D Home Hero (#8)
- Plan 003A Swap discovery (#9, docs only)
- Handoff + Plan 003B docs (#10, #11)
- Plan 003B Stage A: official testnet RPC / explorer endpoints (#13)
- Favicon và rút ngắn scroll của 3D hero: có trên `main` (commit `4371c98`, `7d14d71`); PR #15 / #16 đã đóng
- PR #6 (UI cũ): đã đóng, không merge

## 4. Đang mở

### PR #14 — Plan 003B Stage B: live read-only ETH → USDG quote

- Branch `feat/003b-live-readonly-quote`, HEAD `980ab7d` tại thời điểm snapshot.
- Báo giá thật, chỉ đọc, từ pool Uniswap v4 trên 46630. Swap execution vẫn tắt; không ký ví, không giao dịch, không mainnet.
- Builder: Grok. QA round 5: **PASS WITH LIMITATION**. Builder báo 219/219 tests (chưa có CI xác nhận độc lập).
- **Owner còn phải làm (Gate 2):**
  1. Thử với ví thật trên 46630: số dư và nút 25/50/75/Max.
  2. Đồng bộ đồng hồ máy Windows chạy API, chạy ≥ 10 báo giá, ghi số lần thành công / FUTURE_BLOCK (AC-FB-08).
- Hạn chế đã biết: một UI test flaky (phụ thuộc thời gian thật, hoãn sang T3); khoảng 4,6% báo giá gặp "node not synced" (thông báo thân thiện).
- Gate 3: Owner merge.

### Issues

- #12 — handoff Plan 003B cho Grok: có thể đóng sau khi PR #14 merge.
- #17 — RFC Multi-route Swap Aggregator (Stage C+): chưa duyệt, chưa giao.

## 5. Việc còn treo (chưa được phép làm)

- Cấu hình mainnet `packages/config/src/networks/robinhood-mainnet.ts` vẫn ghi `chainId: 46600` (Plan 003A ghi chain ID chính thức là `4663`). Cần một thay đổi nhỏ có review và test; chưa giao.
- Repo chưa có CI (`.github/workflows`). Đề xuất là task đầu tiên cho Gemini.
- Chưa có PR template và CODEOWNERS.
- F-07, F-08, F-09, F-10 (từ QA PR #14) thuộc một Plan riêng.
- V4Quoter chưa được verify trên explorer.

## 6. Minimal context-loading recipe (cho agent)

1. Kiểm tra `main` HEAD hiện tại, PR đang mở, issue đang mở.
2. Đọc `AGENTS.md` (vai trò), file này, rồi Plan liên quan trong `plans/`.
3. Đọc `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md` theo phần liên quan.
4. Chỉ làm task được giao trong prompt; Builder dừng ở PR, QA dừng ở verdict.

**Resume prompt:** "Đọc AGENTS.md và HANDOFF.md trong alidangkile/robex; xác minh main và PR mới nhất. Gemini là Builder, Grok là QA độc lập, Claude điều phối. Không làm ngoài task được giao."
