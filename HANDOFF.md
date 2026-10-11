# ROBEX — Project Handoff

> Snapshot updated: 2026-10-11 · repository: `alidangkile/robex` · `main` HEAD `4d8d35adba612e78dd6e98a3b7c6d04244827ad0` (recheck current HEAD before use).
> Purpose: sổ bàn giao chung cho Owner và các agent. Source files và live PR state trên GitHub là nguồn sự thật; file này phải được cập nhật sau mỗi merge hoặc thay đổi vai trò.

## 1. Team (từ 2026-10-11)

| Thành viên | Vai trò |
|---|---|
| Owner (Human) | Duyệt Plan, Human Acceptance, merge, mainnet |
| Claude | Mentor, Planner / Orchestrator, review cuối, báo cáo |
| Gemini | Builder |
| Grok | Independent QA (chỉ báo lỗi, không tự sửa) |

Chi tiết: `AGENTS.md`. Mọi báo cáo của agent phải ghi lên GitHub theo `AGENTS.md` mục 3.1 (`BUILDER UPDATE:`, `QA VERDICT:`, `CI RESULT:`).

## 2. Product

- **Robex:** non-custodial DEX trên **Robinhood Chain Testnet (chain ID 46630)**. Scope: Swap, Pool, Earn, Portfolio. Kiến trúc hướng tới mainnet, nhưng **mainnet use/deployment chưa được phép**.
- **Trạng thái Swap hiện tại:** báo giá thật, chỉ đọc (read-only), ETH → USDG từ pool Uniswap v4 trên 46630. Swap execution vẫn tắt; không ký ví, không approve, không giao dịch.

## 3. Đã merge vào `main`

- Plan 001 Foundation (#2, #3)
- Plan 002 Wallet / network (#4, #5)
- UI refresh v2 (#7) và 3D Home Hero (#8)
- Plan 003A Swap discovery (#9, docs only)
- Handoff + Plan 003B docs (#10, #11)
- Plan 003B Stage A: official testnet RPC / explorer endpoints (#13)
- Favicon và rút ngắn scroll của 3D hero (commit `4371c98`, `7d14d71`); PR #15 / #16 đã đóng
- Đội hình mới Claude / Gemini / Grok (#18)
- CI GitHub Actions: lint, typecheck, test, build trên mọi PR vào `main` và push lên `main` (#19, Builder: Gemini)
- Quy ước báo cáo lên GitHub, `AGENTS.md` mục 3.1 (#20)
- **Plan 003B Stage B: live read-only ETH → USDG quote (#14)**, merge 2026-10-11 (Gate 3). Bằng chứng trên PR #14:
  - CI xanh sau khi cập nhật nhánh với `main` (commit `e561367`)
  - Human Acceptance Gate 2 của Owner: 7 mục đạt, ví OKX thật trên 46630, không có yêu cầu ký
  - AC-FB-08: 10/10 báo giá live thành công, 0 FUTURE_BLOCK (Grok)
  - Claude quét toàn bộ diff: code non-test chỉ dùng RPC đọc (`eth_call`, `eth_chainId`, `eth_getBalance`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`); không có sign / sendTransaction / private key / mainnet
- PR #6 (UI cũ): đã đóng, không merge

## 4. Đang mở

- Không có PR nào đang mở tại thời điểm snapshot (ngoài PR cập nhật file này).
- Issue #17 — RFC Multi-route Swap Aggregator (Stage C+): chưa duyệt, chưa giao.

## 5. Việc còn treo (chưa giao)

- Cấu hình mainnet `packages/config/src/networks/robinhood-mainnet.ts` vẫn ghi `chainId: 46600` (Plan 003A ghi chain ID chính thức là `4663`). Cần một thay đổi nhỏ có review và test.
- CI: chỉ bật `cancel-in-progress` cho PR (không hủy lượt chạy trên `main`); cân nhắc nâng Node 20 → Node 22 LTS cho README và CI.
- Một UI test flaky trong `swap-quote-ui` (phụ thuộc thời gian thật), hoãn sang T3.
- Khoảng 4,6% báo giá từng gặp "node not synced" (người dùng thấy thông báo thân thiện); 10/10 lần thử ngày 2026-10-11 không gặp.
- F-07, F-08, F-09, F-10 (từ QA PR #14) thuộc một Plan riêng.
- V4Quoter chưa được verify trên explorer.
- Chưa có PR template và CODEOWNERS.
- Giới hạn công cụ: GitHub connector của Claude không có quyền đọc Checks / Commit statuses; dùng comment `CI RESULT:` hoặc Owner xác nhận dấu xanh.

## 6. Minimal context-loading recipe (cho agent)

1. Kiểm tra `main` HEAD hiện tại, PR đang mở, issue đang mở.
2. Đọc `AGENTS.md` (vai trò, mục 3.1 quy ước báo cáo), file này, rồi Plan liên quan trong `plans/`.
3. Đọc `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md` theo phần liên quan.
4. Chỉ làm task được giao; Builder dừng ở PR, QA dừng ở verdict. Mọi kết quả ghi lên GitHub.

**Resume prompt:** "Đọc AGENTS.md và HANDOFF.md trong alidangkile/robex; xác minh main và PR mới nhất. Gemini là Builder, Grok là QA độc lập, Claude điều phối. Ghi mọi kết quả lên GitHub theo AGENTS.md mục 3.1. Không làm ngoài task được giao."
