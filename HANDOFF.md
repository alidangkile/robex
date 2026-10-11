# ROBEX — Project Handoff

> Snapshot updated: 2026-10-11 17:15 (UTC+7) · repository: `alidangkile/robex` · `main` HEAD `a08113caeb84a12ef5460368f03ecf31a5242ebb` (recheck current HEAD before use).
> Purpose: sổ bàn giao chung cho Owner và các agent. Source files và live PR state trên GitHub là nguồn sự thật; file này phải được cập nhật sau mỗi merge hoặc thay đổi vai trò.

## 1. Team

| Thành viên | Vai trò |
|---|---|
| Owner (Human) | Duyệt Plan, Human Acceptance, merge, mainnet |
| Claude | Mentor, Planner / Orchestrator, review cuối, báo cáo |
| Gemini | Builder |
| **Claude Code** | **QA tạm thời** (từ 2026-10-11 17:15, Grok hết quota). Model `opus`; effort `medium` (docs) / `high` (code) |
| Grok | QA chính khi có quota (hiện tạm nghỉ) |

Chi tiết: `AGENTS.md`. Mọi báo cáo của agent phải ghi lên GitHub theo `AGENTS.md` mục 3.1 (`STARTED:`, `BUILDER UPDATE:`, `QA VERDICT:`, `CI RESULT:`).

Merge: mặc định do Owner. Owner có thể cho phép Claude merge từng PR cụ thể bằng lời trong chat.

## 2. Product

- **Robex:** non-custodial DEX trên **Robinhood Chain Testnet (chain ID 46630)**. Scope: Swap, Pool, Earn, Portfolio. Kiến trúc hướng tới mainnet, nhưng **mainnet use/deployment chưa được phép**.
- **Trạng thái Swap hiện tại:** báo giá thật, chỉ đọc (read-only), ETH → USDG từ pool Uniswap v4 trên 46630. Swap execution vẫn tắt; không ký ví, không approve, không giao dịch.
- **Cấu hình mạng** (theo https://docs.robinhood.com/chain/connecting, kiểm tra 2026-10-11):
  - Testnet: chain ID `46630`, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com` — đang dùng.
  - Mainnet: chain ID `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com` — chỉ là cấu hình, **không được kích hoạt**.

## 3. Đã merge vào `main`

- Plan 001 Foundation (#2, #3); Plan 002 Wallet / network (#4, #5); UI refresh v2 (#7); 3D Home Hero (#8)
- Plan 003A Swap discovery (#9); Handoff + Plan 003B docs (#10, #11); Plan 003B Stage A testnet endpoints (#13)
- Đội hình Claude / Gemini / Grok (#18); CI GitHub Actions (#19); quy ước báo cáo `AGENTS.md` §3.1 (#20)
- **Plan 003B Stage B: live read-only ETH → USDG quote (#14)**: CI xanh, Owner Gate 2 đạt (ví OKX thật), AC-FB-08 10/10, quét diff chỉ có RPC đọc.
- **Maintenance M1 (issue #22):** #23 mainnet config chính thức (`4663`); #24 CI concurrency chỉ cho PR + PR template.
- **Plan 004 / Stage C0 (#27, issue #26):** `plans/004-c0-execution-discovery.md`. Kết luận (Grok tái lập ở block 132865815):
  - Universal Router `0x8876789976decbfcbbbe364623c63652db8c0904` thực thi được native ETH → USDG trên pool đã ghim (eth_call + estimateGas ≈ 132,673 gas), không chạm WETH mainnet.
  - Chỉ **1** pool ETH/USDG hợp lệ (`0xf76e…1669`); pool `0x3bb9…047f` bị loại (dynamic fee + hook); 0 pool WETH/USDG ⇒ làm C1 một route, hoãn C2.
  - **C0-01 (MEDIUM, ràng buộc C1):** calldata thủ công trong §7.C không theo ABI chuẩn, chỉ chạy được vì currency0 = address(0). C1 phải dùng thư viện ABI chuẩn.
  - **C0-02:** deadline mô phỏng 2033; C1 dùng deadline 60s (D1).
  - **C0-03:** test flaky `swap-quote-ui` › "expires at the block deadline…" đã làm fail CI của PR docs-only ⇒ sửa ở C1 PR 0.

## 4. Đang mở

- **Issue #28 — Plan 005 / Stage C1: real single-route swap ETH → USDG.** Owner **đã duyệt** (D1 deadline 60s, D2 giữ trần 0.0001 ETH + RANGE_CAP + chặn impact > 2%, D3 dự phòng 2× phí gas, D4 giữ ví hiện tại, D5 tuần tự PR 0 → PR 1 → PR 2). Bắt đầu sau khi xong R1.
- **Issue #29 — Research R1: nguồn Paxos testnet USDG hợp lệ.** PR #30 (Gemini) đã mở, chờ QA.
- Issue #17 — RFC Multi-route Aggregator: C2 hoãn vì C0 chỉ tìm thấy 1 nguồn.

## 5. Lộ trình

1. R1 (#29 / PR #30) → QA → merge.
2. C1 PR 0 (sửa test flaky) → PR 1 (execution core, ABI chuẩn, mô phỏng trước khi gửi) → PR 2 (ký giao dịch + vòng đời UI + "tối đa có thể swap").
3. Plan 006 — Pool: thêm thanh khoản ETH/USDG (cần nguồn USDG từ R1) ⇒ swap số lớn hơn tự hoạt động nhờ RANGE_CAP động.

## 6. Việc còn treo (chưa giao)

- Kiểm chứng PR template hiện ra khi tạo PR qua giao diện web.
- CI: cân nhắc nâng Node 20 → Node 22 LTS.
- Khoảng 4,6% báo giá từng gặp "node not synced".
- F-07, F-08, F-09, F-10 (từ QA PR #14) thuộc một Plan riêng.
- V4Quoter và Universal Router chưa verify trên explorer.
- Chưa có CODEOWNERS.
- Giới hạn công cụ: Claude không đọc được Checks / Commit statuses và không gọi được RPC; dùng `CI RESULT:` và QA agent tái lập on-chain.

## 7. Bài học quy trình

- Agent có thể bịa chi tiết: SHA sai (PR #23), link comment sai và id pool sai (PR #27). Luôn kiểm bằng chứng; lấy SHA từ `git rev-parse HEAD`.
- Agent có thể dừng mà không báo trong IDE; kiểm tra trạng thái trên GitHub.
- Nếu CI được re-run, phải ghi rõ trong `CI RESULT:` (PR #27 từng báo FAIL rồi PASS trên cùng run).

## 8. Minimal context-loading recipe (cho agent)

1. Kiểm tra `main` HEAD hiện tại, PR đang mở, issue đang mở.
2. Đọc `AGENTS.md` (vai trò, mục 3.1 quy ước báo cáo), file này, rồi Plan liên quan trong `plans/`.
3. Đọc `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md` theo phần liên quan.
4. Chỉ làm task được giao; Builder dừng ở PR, QA dừng ở verdict. Mọi kết quả ghi lên GitHub.

**Resume prompt:** "Đọc AGENTS.md và HANDOFF.md trong alidangkile/robex; xác minh main và PR mới nhất. Gemini là Builder, QA tạm thời là Claude Code, Claude điều phối. Ghi mọi kết quả lên GitHub theo AGENTS.md mục 3.1. Không làm ngoài task được giao."
