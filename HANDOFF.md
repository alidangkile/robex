# ROBEX — Project Handoff

> Snapshot updated: 2026-10-14 (UTC+7) · repository: `alidangkile/robex` · `main` HEAD `8d277305ea1ca2c5803d5a74ec48c172d5ae64d4` (merge of PR #46; recheck current HEAD before use).
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
- **Hướng sản phẩm (Owner chọn, PR #41):** hướng A — giao diện / aggregator trên Uniswap v4, **không tự viết contract giữ tiền**. 4 tab: Swap, Pool, Earn, Portfolio. Checklist: `plans/mainnet-readiness.md`.
- **Trạng thái Swap hiện tại:** swap thật **một chiều ETH → USDG** trên testnet (C1), trần 0.0001 ETH, ký bằng ví của Owner. Human Acceptance C1: PASS (issue #28). Chưa có chiều USDG → ETH (C2), chưa có approve / Permit2.
- **Cấu hình mạng** (theo https://docs.robinhood.com/chain/connecting, kiểm tra 2026-10-11):
  - Testnet: chain ID `46630`, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com` — đang dùng.
  - Mainnet: chain ID `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com` — chỉ là cấu hình, **không được kích hoạt**.

## 3. Đã merge vào `main`

- Plan 001 Foundation (#2, #3); Plan 002 Wallet / network (#4, #5); UI refresh v2 (#7); 3D Home Hero (#8)
- Plan 003A Swap discovery (#9); Plan 003B Stage A + B: báo giá ETH → USDG chỉ đọc (#13, #14)
- Quy trình: đội hình (#18), CI (#19), quy ước báo cáo §3.1 (#20), PR template (#24), QA tạm thời Claude Code (#31), luật trung thực `.agents/rules/00-truthfulness.md` (#33), Guardrails G1 chống bịa địa chỉ + `npm run agent:report` (#35)
- Maintenance M1: mainnet config chính thức `4663` (#23)
- Plan 004 / C0 execution discovery (#27); R1 nguồn USDG testnet (#30)
- Wallet polish W4, W5, W6, W9 (#36)
- **C1 — swap thật ETH → USDG (issue #28, đã đóng):** PR 0 test hygiene (#37) → PR 1 execution core + pre-send checks (#38) → PR 2A guarded swap + receipt tracking (#39) → PR 2B UI, gates, pending guard (#40) → UX polish (#43). CI: 408 test pass (Actions run 38409640861).
- Mainnet readiness checklist, hướng A, 4 tab (#41)
- **Process upgrade (#44):** Risk Tier A/B/C, tối đa 2 vòng QA, QA Phần 2 UX, `CONSTRAINTS.md`, 5 agent skills ghim phiên bản.
- **Pilot P1 — nút "Add USDG to wallet" (#46, issue #45, Tier B):** 2 vòng QA, Human Acceptance PASS bằng ví thật. CI: 441 test (Actions run 38586809193).

## 4. Đang mở

- **Issue #47 — Research R2:** khảo sát testnet chỉ đọc (pool v4, Permit2 cho C2, giao thức Earn, chẩn đoán lỗi báo giá `FUTURE_BLOCK`). Builder Gemini, QA Claude Code.
- **Issue #42 — Hardening backlog:** finding LOW / INFO và ý tưởng UX hoãn lại từ #39, #40, #43.
- Issue #32 — Wallet polish W1 (phần còn lại).
- Issue #17 — RFC Multi-route Aggregator (cập nhật sau khảo sát testnet).

## 5. Lộ trình (`plans/mainnet-readiness.md`)

1. ~~C1~~ → 2. ~~Process upgrade + pilot P1~~ (xong)
3. Khảo sát testnet chỉ đọc R2 (#47) — đang làm
4. C2: USDG → ETH (Tier A: approve + Permit2)
5. Plan 006 Pool → 6. Portfolio → 7. Earn → 8. WalletConnect
9. Hardening (#42) + security audit bởi con người → mainnet (chỉ Owner quyết)

## 6. Việc còn treo (chưa giao)

- CI: cân nhắc nâng Node 20 → Node 22 LTS.
- Khoảng 4,6% báo giá từng gặp "node not synced".
- V4Quoter và Universal Router chưa verify trên explorer.
- Chưa có CODEOWNERS.
- F-07, F-08, F-09, F-10 (từ QA PR #14) — chưa giao; theo dõi trong #42.
- Kiểm chứng PR template hiện ra khi tạo PR qua giao diện web.
- Floor guard tự động (`.agents/skills/constraint-driven-development/references/floor-guard.md`) chưa đưa vào CI; hiện QA kiểm tay.
- Claude (chat) không gọi được RPC; bằng chứng on-chain do QA agent tái lập.

## 7. Bài học quy trình

- Agent có thể bịa chi tiết: SHA sai (PR #23), link comment sai và id pool sai (PR #27). Luôn kiểm bằng chứng; lấy SHA từ `git rev-parse HEAD`.
- Agent có thể dừng mà không báo trong IDE; kiểm tra trạng thái trên GitHub.
- Nếu CI được re-run, phải ghi rõ trong `CI RESULT:` (PR #27 từng báo FAIL rồi PASS trên cùng run).
- QA từng chỉ soi kỹ thuật, bỏ sót lỗi giao diện / chữ ⇒ thêm QA Phần 2 UX.
- Vòng QA kéo dài làm chậm task nhỏ ⇒ Risk Tier + tối đa 2 vòng, LOW vào #42.
- Pilot P1 (#46): QA bằng mutation test (cố tình làm hỏng code) bắt được 1 test bị nới lỏng — đúng loại lỗi CONSTRAINTS "Guard the bar" canh. Builder vẫn tự tick AC chưa đạt và trích sai số hiệu run CI ⇒ QA độc lập vẫn bắt buộc; luôn đối chiếu run ID với headSha.
- Môi trường cloud của Claude và máy ảo trên PC Owner không vào được npm / RPC ⇒ QA chạy test và on-chain phải dùng Claude Code trên máy Owner.

## 8. Minimal context-loading recipe (cho agent)

1. Kiểm tra `main` HEAD hiện tại, PR đang mở, issue đang mở.
2. Đọc `AGENTS.md` (vai trò, §3.1 báo cáo, §4.1 Risk Tier), `CONSTRAINTS.md`, file này, rồi Plan liên quan trong `plans/`.
3. Đọc `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md` theo phần liên quan.
4. Chỉ làm task được giao; Builder dừng ở PR, QA dừng ở verdict. Mọi kết quả ghi lên GitHub.

**Resume prompt:** "Đọc AGENTS.md và HANDOFF.md trong alidangkile/robex; xác minh main và PR mới nhất. Gemini là Builder, QA tạm thời là Claude Code, Claude điều phối. Ghi mọi kết quả lên GitHub theo AGENTS.md mục 3.1. Không làm ngoài task được giao."
