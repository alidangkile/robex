# Mainnet Readiness Checklist — robex

> Trạng thái: **DRAFT — chờ Owner duyệt**. Viết ngày 2026-10-12 bởi Claude (mentor/orchestrator).
> Tài liệu này định nghĩa "đủ chuẩn lên mainnet". Mỗi Issue/Plan mới phải chỉ ra nó đánh dấu mục nào ở đây.

## 1. Quyết định nền tảng (Owner đã chốt 2026-10-12)

- **Hướng A — giao diện/aggregator trên hạ tầng đã kiểm chứng.** robex **không** tự viết smart contract giữ tiền. Mọi giao dịch đi qua hợp đồng có sẵn (Uniswap v4 trên Robinhood Chain) đã được ghim địa chỉ trong `packages/config`.
  - Lý do: hợp đồng giữ tiền cần kỹ sư Solidity chuyên sâu + audit độc lập. Ngoài phạm vi hiện tại.
  - Hệ quả: tính năng nào **cần hợp đồng riêng** (vd. farming/reward token của robex) là **hướng B** và không nằm trong checklist này.
- **Sản phẩm đích: DEX có 4 tab — Swap, Pool, Earn, Portfolio.**
- **Mạng:** phát triển và chấp nhận trên testnet 46630. Mainnet 4663 chỉ bật sau khi checklist này đạt và Owner duyệt riêng.

Ký hiệu: ✅ xong · 🟡 đang làm · ⏳ chưa làm · ❓ cần khảo sát/quyết định

## 2. Tab Swap

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Báo giá read-only ETH → USDG | ✅ | Plan 003B |
| Lõi dựng lệnh + mô phỏng trước khi gửi | ✅ | C1 PR 1 (#38) |
| Gửi giao dịch có khóa + theo dõi receipt | ✅ | C1 PR 2A (#39) |
| UI swap ETH → USDG + swap thật đầu tiên | 🟡 | C1 PR 2B (#40) + Human Acceptance |
| Chiều ngược USDG → ETH (approve giới hạn + Permit2) | ⏳ | C2 — mức rủi ro A |
| Danh sách token + chặn token giả | ⏳❓ | Phụ thuộc pool thực có trên testnet/mainnet |
| Swap qua nhiều pool (multi-hop) / chọn đường giá tốt nhất | ⏳ | Sau khi có ≥ 2 pool |
| Cài đặt slippage, deadline cho người dùng (có giới hạn an toàn) | ⏳ | |

## 3. Tab Pool (cung cấp thanh khoản trên Uniswap v4)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Xem thông tin pool (thanh khoản, giá, phí) | ⏳ | read-only |
| Thêm thanh khoản (mở vị thế LP) | ⏳ | Plan 006 — mức A (approve + ký) |
| Rút thanh khoản, thu phí | ⏳ | mức A |
| Xem vị thế LP của mình | ⏳ | dùng chung với Portfolio |

## 4. Tab Earn

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Định nghĩa "Earn" trong hướng A | ❓ | Phương án: (1) hiển thị phí LP kiếm được từ Pool; (2) tích hợp giao thức lợi nhuận **có sẵn, đã audit** trên Robinhood Chain nếu tồn tại. Cần khảo sát. Phần thưởng/farming do robex tự phát hành = hướng B, loại. |

## 5. Tab Portfolio

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Số dư ETH | ✅ | |
| Số dư USDG | 🟡 | trong #40 |
| Số dư mọi token trong danh sách | ⏳ | |
| Vị thế LP | ⏳ | sau Pool |
| Lịch sử giao dịch của robex | ⏳ | |

## 6. Ví

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| EIP-6963 nhiều ví trình duyệt, chọn ví gọn | ✅ | #36 |
| Tự kết nối lại, chống race | ✅ | #36 |
| Kiểm địa chỉ và chainId | ✅ | #36 |
| WalletConnect (ví điện thoại) | ⏳ | W1 |
| Thử với ≥ 3 ví thật | ⏳ | W7 — Human Acceptance |

## 7. An toàn

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Ghim địa chỉ hợp đồng + test chặn bịa địa chỉ | ✅ | G1 (#35) |
| Một đường gửi giao dịch duy nhất, khóa chống gửi trùng | ✅ | #38, #39 |
| Không agent nào ký/gửi giao dịch | ✅ | AGENTS.md |
| Threat model (mô hình đe dọa) cho giao diện | ⏳ | |
| Approve có giới hạn, không approve vô hạn | ⏳ | C2 |
| Content Security Policy, chống frontend bị chèn mã | ⏳ | W8 |
| Bỏ placeholder trong config (multicall/router/weth giả) | ⏳ | W3 |
| Cấu hình mạng tách khỏi build web | ⏳ | W2 |
| Audit bảo mật **phần giao diện** bởi bên độc lập | ⏳ | Trước mainnet |
| Đợt hardening gom các LOW/INFO tồn đọng | ⏳ | Issue riêng |

## 8. Vận hành

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| CI lint/typecheck/test/build + verify:dist | ✅ | |
| Theo dõi lỗi (monitoring) phía web/API | ⏳ | |
| Quy trình xử lý sự cố + cách tắt swap khẩn cấp | ⏳ | |
| Hosting/domain production, quy trình phát hành | ⏳ | |

## 9. Trải nghiệm

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Responsive điện thoại | 🟡 | |
| Thông báo lỗi dễ hiểu | 🟡 | |
| Hướng dẫn người mới (faucet, thêm token vào ví) | ⏳ | vd. nút "Add USDG to wallet" |

## 10. Pháp lý

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Điều khoản sử dụng, cảnh báo rủi ro | ⏳ | **Cần luật sư**; agent không tư vấn pháp lý |

## 11. Thứ tự đề xuất (Owner duyệt)

1. Hoàn tất C1 (PR 2B + swap thật).
2. Process upgrade: áp dụng agent-skills (Addy Osmani) + 3 mức rủi ro A/B/C.
3. Khảo sát testnet (read-only): pool/token mới, giao thức "Earn" có sẵn.
4. C2: swap USDG → ETH.
5. Plan 006: tab Pool (thêm/rút thanh khoản).
6. Portfolio đầy đủ.
7. Earn (theo kết quả khảo sát).
8. Ví: WalletConnect + thử nhiều ví.
9. Hardening + threat model + audit giao diện → Owner quyết định bật mainnet.
