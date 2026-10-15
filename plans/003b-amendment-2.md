# Plan 003B — Amendment 2: Dung sai FUTURE_BLOCK (so finishedSec + trần 2 s)

> Trạng thái: Approved by Owner 2026-10-10 21:29 (UTC+7) — transferred via Grok Quân Sư
> Ngày soạn: 2026-10-10. Nguồn quyết định: chủ duyệt bằng chữ lúc **2026-10-10 21:29** (giờ VN, UTC+7) trong chat với Grok Quân Sư, do Quân Sư chuyển lại cho Grok Product Manager (chưa có bản ghi GitHub).
> Phụ thuộc: Amendment 1; PR #14 head `9e6235ea…` (OPEN); commit `eed896e`; `/workspace/company/qa/robex/pr14-audit-r4.md`.
> Mức: **Cao** — Plan soạn `gemini-3.1-pro-high`; Opus 4.6 soi chéo AC/rủi ro (xem `003b-amendment-2-opus-review.md`).

## 0. Tóm tắt

Amendment này giải quyết vấn đề kiểm tra FUTURE_BLOCK đã phát sinh trong quá trình phát triển PR #14 (commit `eed896e`) và audit r4, cụ thể là thay đổi việc kiểm tra độ tươi block so với thời điểm đọc và áp dụng trần dung sai an toàn.

### 0.1 Quyết định D1 mới (thay D1 Amendment 1)

> Duyệt bằng chữ lúc **2026-10-10 21:29** (giờ VN, UTC+7) trong chat với **Grok Quân Sư**, do Quân Sư chuyển lại cho Grok Product Manager. Chưa có bản ghi trên GitHub.

Nội dung quyết định (thay thế hoàn toàn D1 của Amendment 1):

1. **Giữ** thay đổi FUTURE_BLOCK của commit `eed896e`: so `blockSec` với thời điểm **đọc xong** (`finishedSec`).
2. **Trần dung sai tối đa 2 giây.** Quy tắc CHẶN nếu:
   - `blockSec > finishedSec`, **hoặc**
   - `blockSec - startedSec > 2`.
3. Thời gian hiển thị phía trình duyệt vẫn **≤ 20 giây** (không đổi chính sách TTL hiển thị).

Biên số nguyên giây (floor unix second):
- `blockSec - startedSec == 2` → **cho qua** (nếu đồng thời `blockSec <= finishedSec` và các kiểm STALE/READ_BUDGET/CLOCK vẫn OK).
- `blockSec - startedSec == 3` → **chặn** FUTURE_BLOCK.
- `blockSec == finishedSec` → không chặn vì nhánh “tương lai so finished”; vẫn có thể chặn nếu `blockSec - startedSec > 2`.
- `blockSec > finishedSec` → luôn chặn (tương lai thật so lúc đọc xong), kể cả khi `blockSec - startedSec <= 2`.

## 1. Thay đổi so với Amendment 1

- **D1:** Ghi D1 cũ (dung sai 0 s, Approved 15:52) **bị thay thế**; D1 mới được Approved by Owner 2026-10-10 21:29 với quy tắc trên. Các quyết định **D2–D8 giữ nguyên**, không mâu thuẫn.
- Hợp thức hóa commit `eed896e` và xử lý các vấn đề từ bản audit r4.

## 2. Chính sách độ tươi (công thức + thứ tự kiểm)

Thứ tự kiểm đề xuất ghi trong Plan (để AC rõ):
1. CLOCK_INVALID
2. FUTURE_BLOCK nếu `blockSec > finishedSec` (tương lai thật)
3. FUTURE_BLOCK nếu `blockSec - startedSec > 2` (vượt trần dung sai từ lúc bắt đầu đọc)
4. READ_BUDGET nếu `readFinishedAtMs - readStartedAtMs >= 20000`
5. STALE_BLOCK nếu `finishedSec - blockSec >= 20`
6. Trả `quotedAt`/`expiresAt`; UI vẫn tự giới hạn hiển thị ≤ 20 s từ block.

**Cả hai pha pre-pool và post-quote đều dùng cùng quy tắc (bước 2 + 3 ở trên).** Audit r4 ghi nhận nhánh `blockSec > finishedSec` ở post-quote gần như không bắt (vì `postFinish ≥ preFinish`); tuy nhiên nhánh `blockSec - startedSec > 2` ở post-quote vẫn hoạt động và có thể bắt skew nếu pha đọc kéo dài ≥ 2 s. Không tách quy tắc riêng cho từng pha.

## 3. Tiêu chí AC (sửa + mới) — bảng kiểm thử được

> Ghi chú tương thích: ví dụ AC-FB-01 của Amendment 1 (start …999 ms, block +1 s → FUTURE_BLOCK, `diffSeconds = 1`) **đã lỗi thời** dưới D1 mới — ca đó nay **cho qua** (xem AC-FB-09). Amendment 2 **không** bắt buộc sửa văn bản Amendment 1; builder/test lấy AC dưới đây làm chuẩn cho FUTURE_BLOCK.

Định nghĩa giây (áp dụng mọi AC dưới):
- `startedSec = Math.floor(readStartedAtMs / 1000)`
- `finishedSec = Math.floor(readFinishedAtMs / 1000)`
- `blockSec = Number(blockTimestampSeconds)` (unix second nguyên từ chain)
- So sánh dùng `>` / `<=` trên **số nguyên giây**, không làm tròn nearest, không dùng millisecond cho nhánh FUTURE_BLOCK.

| ID | Tiêu chí | Cách kiểm (tuple `blockSec`, `startMs`, `finishMs` hoặc mô tả) | Kỳ vọng |
|---|---|---|---|
| **AC-TTL-02** *(sửa)* | FUTURE_BLOCK khi `blockSec > finishedSec` **hoặc** `blockSec - startedSec > 2`. STALE_BLOCK khi `finishedSec - blockSec ≥ 20`. READ_BUDGET khi `finishMs - startMs ≥ 20000`. CLOCK_INVALID khi đồng hồ NaN/âm/vô hạn/`finish < start`. Không quote, không adapter mô phỏng. | Core unit: các tuple biên ở AC-FB-09…12 + stale `(blockSec=startSec-20, start, start)` → STALE; `(b, s, s+20000)` → READ_BUDGET | Đúng reason; không quote |
| **AC-FB-07** *(sửa)* | Điều kiện FUTURE_BLOCK trong core = đúng D1 mới (so `finishedSec` + trần 2 s từ `startedSec`). **Không** còn yêu cầu “không đổi so với `2a28bdf` / chỉ `blockSec > startedSec`”. Hạn TTL `expiresAt = blockSec×1000 + 20000` không đổi. | Diff `resolveQuoteFreshness` so `eed896e` + commit bổ sung trần 2 s; test AC-FB-09…12 pass | Diff + test xanh |
| **AC-FB-09** *(mới)* | Ca **qua mốc giây trong lúc đọc**: cho qua | `(2n, 1999, 2000)` → startedSec=1, finishedSec=2, blockSec=2; diff start=1≤2; blockSec≤finishedSec | Quote hợp lệ (nếu không STALE/READ_BUDGET) |
| **AC-FB-10** *(mới)* | Ca **đọc dài**, block “bám” finish: chặn vì vượt trần 2 s từ start (đóng lỗ audit r4) | `(21n, 1001, 21000)` → startedSec=1, finishedSec=21, blockSec=21; `21-1=20 > 2`; không phải ahead_of_finish | FUTURE_BLOCK, reason phụ `skew_from_start_gt_2` |
| **AC-FB-11** *(mới)* | Ca **tương lai thật** so lúc đọc xong: luôn chặn | Ví dụ `(5n, 4000, 4500)` → finishedSec=4, blockSec=5 > 4; kể cả khi diff start = 1 ≤ 2 | FUTURE_BLOCK, reason phụ `ahead_of_finish` |
| **AC-FB-12** *(mới)* | Biên trần 2 s (số nguyên) | Cho qua: diff start `0` với `(10n, 10000, 10500)`; diff start `2` với `(12n, 10000, 12050)` (finishedSec≥12). Chặn: diff start `3` với `(13n, 10000, 13050)`. Block cũ diff âm (ví dụ blockSec=9, start=10000) → không FUTURE_BLOCK vì skew; có thể STALE nếu ≥20 s | Đúng cho qua / chặn như cột |
| **AC-FB-13** *(mới, log — D2)* | Khi FUTURE_BLOCK (dev): log có đủ trường cũ + `rejectReason` ∈ {`ahead_of_finish`,`skew_from_start_gt_2`} + `compareAgainst` ∈ {`finishedSec`,`startedSec`}. `diffSeconds` = `blockSec - finishedSec` nếu `ahead_of_finish`; = `blockSec - startedSec` nếu `skew_from_start_gt_2`. Message nêu rõ mốc và lý do. Production/test/không đặt env: 0 lần log (D2). Nếu cả hai điều kiện đúng, ưu tiên ghi `ahead_of_finish` (khớp thứ tự kiểm §2). | Spy logger: ép AC-FB-10 và AC-FB-11 ở pre-pool và post-quote; NODE_ENV matrix như AC-FB-05 | Khớp bảng; origin-only URL |
| **AC-TTL-06** *(mới, client)* | UI/`acceptDisplayedQuote` gọi `resolveQuoteFreshness(block, nowMs, nowMs)` → `startedSec == finishedSec` → nhánh tương lai vẫn **dung sai 0** phía trình duyệt (`blockSec > nowSec` → FUTURE_BLOCK). Thời gian hiển thị còn lại ≤ 20 s từ block (không tin `expiresAt` API vượt block+20s). | Test UI/core client: block = nowSec+1 → không hiện quote; API giả expiresAt xa vẫn hết hạn đúng block+20s (hồi quy AC-TTL-03) | Client strict; TTL hiển thị ≤ 20 s |

Cả hai pha **pre-pool** và **post-quote** phải thỏa AC-FB-09…13 với cùng quy tắc.

## 4. Log chẩn đoán (D2 giữ — bổ sung trường)

- D2 không đổi: chỉ `NODE_ENV === 'development'`.
- Object log tối thiểu: `phase`, `readStartedAtMs`, `readFinishedAtMs`, `blockTimestampSeconds`, `blockNumber`, `diffSeconds`, `rejectReason`, `compareAgainst`, `rpcUrl` (origin-only), `chainId`.
- Công thức `diffSeconds` theo nhánh (xem AC-FB-13). Không dùng một `diffSeconds = block - started` cho mọi ca khi reject vì finished.
- Message ví dụ: `FUTURE_BLOCK (pre-pool): rejectReason=skew_from_start_gt_2 compareAgainst=startedSec diffSeconds=20 …`.

## 5. §4.5 Amendment 1 — đóng mục hoãn

Mục “Hoãn sang amendment riêng” của Amendment 1 §4.5 **đóng**: chính sách đã duyệt tại Amendment 2 (D1 mới). Commit `eed896e` (so `finishedSec`) **được hợp thức hóa** kèm trần `blockSec - startedSec > 2`. Không revert `eed896e`. Khi triển khai, builder cập nhật HANDOFF/mô tả PR trỏ Amendment 2; không bắt buộc sửa ngược file Amendment 1 đã snapshot trong repo.

## 6. Phạm vi builder / việc còn lại

1. Bổ sung nhánh `blockSec - startedSec > 2` vào `resolveQuoteFreshness` (giữ nhánh `blockSec > finishedSec` từ `eed896e`).
2. Sửa log adapter theo AC-FB-13; giữ chỉ-dev (B1 Amendment 1 nếu chưa xong).
3. Test: AC-TTL-02, AC-FB-07, AC-FB-09…13, AC-TTL-06; cả hai pha adapter.
4. **Mô tả PR #14:** bỏ / sửa mọi câu “0 s tolerance unchanged (D1)”, “FUTURE_BLOCK check unchanged from 2a28bdf”; ghi D1 mới (21:29), trần 2 s, link Amendment 2 (khi có trên repo hoặc đường dẫn local rõ ràng).
5. Không revert `eed896e`. Không đụng D2–D8 ngoài FUTURE_BLOCK/log liên quan.

## 7. MUST NOT / không mâu thuẫn D2–D8

- Giữ D2–D8; trượt giá custom tới 50%; không mainnet; không `ALLOW_MAINNET`; không tắt FUTURE_BLOCK; không fallback mô phỏng; không kéo TTL hiển thị > 20 s; không nâng gói GitHub.

## 8. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Đọc dài + chỉ so finished (eed896e thuần) cho phép block “tương lai so start” tới gần 20 s | Cao (đã biết, audit r4) | Trần cứng `blockSec - startedSec > 2` (AC-FB-10) |
| NTP server lệch > 2 s so chain | Trung bình | Vẫn FUTURE_BLOCK; UI khuyên đồng bộ giờ; AC-FB-08 chủ thử lại sau NTP |
| Server và trình duyệt cùng chậm d → quote có thể hiện quá hạn thật ~d | Trung bình (audit r4) | Client vẫn so `now,now` (AC-TTL-06) + TTL hiển thị ≤ 20 s từ block |
| Post-quote ít bắt `ahead_of_finish` | Thấp/INFO | Nhánh skew-from-start vẫn bắt ở post-quote nếu đọc ≥ ~2 s; cùng quy tắc hai pha |
| Log `diffSeconds` lệch điều kiện | Thấp | AC-FB-13 |

## 9. Bằng chứng nghiệm thu

- Unit/PBT/probe: bảng AC-FB-09…12 (gồm biên 0/2/3 và tuple audit r4).
- Spy log AC-FB-13 (dev on/off, hai reason).
- Client AC-TTL-06 + hồi quy AC-TTL-03.
- Diff core + mô tả PR đã bỏ “0 s unchanged”.
- SHA commit(s) sau khi builder làm.

## 10. Câu hỏi mở / ghi chú kỹ thuật

Không còn câu hỏi quyết định cho chủ (D1 mới đã chốt 21:29).

Ghi chú kỹ thuật (không hỏi lại trừ khi chủ muốn đổi):
1. Đơn vị giây = **`Math.floor(ms / 1000)`** (unix second, **floor**, không round-nearest).
2. Trần dùng **`>` không phải `>=`**: đúng 2 giây cho qua; 3 giây chặn.
3. Client giữ `resolveQuoteFreshness(block, now, now)` → dung sai 0 phía trình duyệt cho nhánh tương lai.
4. Nếu sau AC-FB-08 (NTP đã đồng bộ) vẫn FUTURE_BLOCK thường xuyên vì lệch > 2 s thật, cần amendment riêng — không tự nới trần trong PR hiện tại.

## 11. Amendment 3 (H1) — Issue #49: Dung sai đồng hồ người dùng 3 giây

> Trạng thái: Owner approval recorded on issue #49.
> Mục tiêu: Khắc phục lỗi `FUTURE_BLOCK` (`ahead_of_finish`) khi đồng hồ máy người dùng/Owner chậm ~1–2 s so với giờ mạng / chuỗi RPC.

Amendment 3 supersedes §10 items on the 2 s cap and on zero browser tolerance; the browser path also tolerates 3 s.

Nội dung sửa đổi bổ sung (amends §2 D1):
1. Bổ sung hằng số `QUOTE_CLOCK_TOLERANCE_S = 3` (3 giây dung sai) cho kiểm tra `FUTURE_BLOCK`.
2. Điều kiện chặn `FUTURE_BLOCK` trong `resolveQuoteFreshness` được nới lỏng:
   - Chặn `ahead_of_finish` nếu `blockSec - finishedSec > QUOTE_CLOCK_TOLERANCE_S` (tức `> 3` s; cho qua độ lệch ≤ 3 s).
   - Chặn `skew_from_start_gt_2` nếu `blockSec - startedSec > 2 + QUOTE_CLOCK_TOLERANCE_S` (tức `> 5` s).
   - Thứ tự kiểm tra không đổi: `ahead_of_finish` vẫn ưu tiên xét trước (finish comparison wins).
3. Hạn hiệu lực báo giá giữ nguyên: `quotedAt = blockSec * 1000` và `expiresAt = quotedAt + QUOTE_TTL_MS` (20 s từ thời điểm block trên chuỗi). Dung sai không kéo dài thời gian sống của báo giá quá 20 s giờ chuỗi.
4. Giữ nguyên các kiểm tra `STALE_BLOCK`, `READ_BUDGET`, `CLOCK_INVALID`.
5. Cập nhật `apps/api` diagnostics `classifyFutureBlockRejection` dùng chung hằng số `QUOTE_CLOCK_TOLERANCE_S` (không lặp lại số cứng).
6. Cập nhật thông báo lỗi người dùng `FUTURE_BLOCK_CLOCK_GUIDANCE` trên `SwapPage.tsx`: "Your device clock is more than 3 seconds behind network time. Sync your clock (Windows: Settings → Time & language → Date & time → Sync now) and refresh."
