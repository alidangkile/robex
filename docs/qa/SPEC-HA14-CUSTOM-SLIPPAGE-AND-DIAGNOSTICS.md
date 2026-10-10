# SPEC & Acceptance Criteria — Human Acceptance HA-14 Feedback

> PR #14: `feat/003b-live-readonly-quote`<br />
> Author: Builder (Gemini in Antigravity)<br />
> Orchestrator: ChatGPT<br />
> Reviewer: Codex CLI<br />
> Final Authority: Owner

---

## 1. Yêu cầu 1: Chẩn đoán & Xử lý FUTURE_BLOCK (HA-14-01)

### 1.1 Hiện tượng
Người dùng gặp thông báo lỗi:
> *"The pinned chain block timestamp is ahead of the quote clock. No quote is available."* (HTTP 400, `reason: FUTURE_BLOCK`).

### 1.2 Bằng chứng chẩn đoán thực tế
1. **API Server & Host Environment:**
   - Hệ điều hành: Windows 11.
   - Trạng thái đồng hồ hệ thống (`w32tm /query /status`):
     - `Leap Indicator: 3 (not synchronized)`
     - `Source: Local CMOS Clock`
     - Đồng hồ chưa được đồng bộ với mạng NTP (`Unspecified sync time`).
   - Sai lệch thực tế so với chuẩn UTC (kiểm tra qua HTTP Date):
     - Đồng hồ máy trạm chậm khoảng ~1 giây so với UTC thực (có độ không chắc chắn do RTT mạng).
2. **RPC Endpoint & Chain Time:**
   - Chain ID: `46630` (Robinhood Chain Testnet).
   - RPC URL: `https://rpc.testnet.chain.robinhood.com`.
   - Block timestamp từ RPC sequencer được mint theo giây Unix thực tế của validator.
   - Khi đồng hồ máy chủ API cục bộ trễ so với UTC, các block mới nhất thường có `blockTimestamp = startedSec + 1` (chênh lệch 1 giây).
   - Ngoài ra, thời gian trễ mạng khứ hồi (RTT ~200-300ms) giữa lúc ghi nhận `readStartedAtMs` và khi nhận response `eth_getBlockByNumber` khiến trường hợp sang giây mới dễ chạm mốc `blockSec > startedSec`.
3. **Quy tắc an toàn bất biến:**
   - **Không** bỏ qua hoặc xóa bỏ kiểm tra `FUTURE_BLOCK`.
   - **Không** nới lỏng giới hạn 20 giây TTL của block.
   - **Không** áp dụng skew tolerance âm thầm hoặc giả lập báo giá.

### 1.3 Giải pháp an toàn
1. **Chẩn đoán Dev/Redacted Logging:**
   - Bổ sung log chẩn đoán an toàn (không chứa private key / sensitive data, URL được chuẩn hóa về origin hợp lệ hoặc chuỗi cố định [redacted-invalid-rpc-url] nếu sai định dạng; loại bỏ hoàn toàn userinfo, path, query params, fragment) trong `uniswap-v4-readonly-adapter.ts` khi `FUTURE_BLOCK` xảy ra, bao gồm: `phase`, `readStartedAtMs`, `readFinishedAtMs`, `blockTimestampSeconds`, `blockNumber`, `diffSeconds`, `rpcUrl`, `chainId`.
   - **Chỉ ghi ở môi trường dev** (Plan 003B Amendment 1, D2): log chỉ được ghi khi `NODE_ENV === 'development'`. `NODE_ENV` là `production`, `test`, giá trị lạ hoặc **không đặt** → không ghi log (im lặng). Điều kiện được tiêm vào adapter qua tham số `diagnosticsEnabled` (mặc định `isDiagnosticLoggingEnabled()`), nên test không cần sửa `process.env` toàn cục. Tắt log **không** đổi hành vi an toàn: lỗi `FUTURE_BLOCK` vẫn bị ném ra, HTTP 400 giữ nguyên.
   - **Cách bật log:** API không tự nạp file `.env`. `npm run dev` / `npm run dev:api` chạy `apps/api/src/dev.ts`, file này đặt `NODE_ENV=development` **nếu biến chưa được đặt**, nên chạy dev là có log. Nếu shell đã đặt sẵn `NODE_ENV` khác (ví dụ `production`), giá trị đó được giữ và log tắt; khi đó đặt lại `NODE_ENV=development` trước khi chạy (PowerShell: `$env:NODE_ENV="development"; npm run dev:api`). `npm start` (bản build) không đặt biến này nên mặc định không ghi log.
2. **Hướng dẫn người dùng & Thông báo rõ ràng:**
   - Cung cấp thông báo lỗi rõ ràng hướng dẫn người dùng đồng bộ đồng hồ thiết bị/máy tính với thời gian Internet (`Sync system clock`) khi gặp `FUTURE_BLOCK`.
   - Thông báo này hiện **trong cả hai trường hợp**: API trả `FUTURE_BLOCK`, và trình duyệt tự từ chối quote vì block ở tương lai so với đồng hồ thiết bị (sửa QA F-01). Dung sai lệch giờ vẫn là 0 giây (D1).

---

## 2. Yêu cầu 2: Custom Slippage Control (HA-14-02)

### 2.1 Đặc tả giao diện & Luồng nghiệp vụ
1. **Tùy chọn Slippage:**
   - 3 Preset nút bấm: `0.1%`, `0.5%` (mặc định), `1%`.
   - 1 Tùy chọn `Custom`: Cho phép người dùng nhập trực tiếp giá trị phần trăm mong muốn.
   - Giao diện linh hoạt: Nút Custom có thể mở ô nhập inline có hậu tố `%` gọn gàng, phù hợp trên cả desktop và mobile (không làm vỡ hàng hoặc gây tràn ngang).
2. **Quy tắc Validation (khớp với backend `resolveSlippageBps`):**
   - Giá trị nhập phải là số thực từ `0.00%` đến `50.00%`.
   - Tối đa **2 chữ số thập phân** (tương đương đơn vị basis points nguyên từ `0` đến `5000` bps).
   - **Không làm tròn âm thầm** (ví dụ: `0.125%` bị coi là không hợp lệ, không tự làm tròn thành `0.13%`).
   - Nếu giá trị không hợp lệ (trống, âm, >50%, quá 2 chữ số thập phân, ký tự lạ):
     - **Không gửi request quote**.
     - Vô hiệu hóa/ẩn báo giá cũ (`setQuote(null)`), không hiển thị chi tiết báo giá cũ.
     - Hiển thị thông báo validation rõ ràng: *"Slippage must be between 0% and 50% with at most 2 decimal places."*
3. **Cảnh báo rủi ro (Risk Communication) — 3 mức theo bps (Plan 003B Amendment 1, D3):**
   - `0%` (0 bps): **thông báo** *"0% slippage may cause transactions to fail if the price moves before execution."* dưới ô nhập.
   - `> 1%` và `< 5%` (101–499 bps): **cảnh báo thường** *"High slippage tolerance increases the risk of unfavorable execution."* dưới ô nhập.
   - `≥ 5%` (500–5000 bps): **cảnh báo mạnh** *"Very high slippage: you could receive up to X% less than the estimate."* (X = giá trị đã chọn), kiểu nguy hiểm (màu đỏ, biểu tượng ⚠, `role="alert"`, class `slippage-strong-warning`). Hiện **dưới ô nhập và trong phần chi tiết quote ngay sau dòng "Minimum received"**. Cảnh báo mạnh **thay** cảnh báo thường, không hiện cả hai. Cảnh báo trong chi tiết biến mất cùng chi tiết (nhập sai, hết hạn, `Blocked`, sai mạng, đổi về preset).
   - `0.01%`–`1%`: không cảnh báo. Trần 50% giữ nguyên (yêu cầu của chủ).
4. **Đồng bộ Request & Identity:**
   - Gửi query param `slippage` đúng định dạng (`slippageBps = Math.round(customValue * 100)`).
   - Frontend xác thực `accepted.slippageBps === expected.slippageBps` trước khi hiển thị.
   - Đảm bảo `minimumAmountOut` phản ánh đúng slippage đã chọn.

---

## 3. Yêu cầu 3: Typography cho trạng thái báo giá (HA-14-03)

### 3.1 Vấn đề hiện tại
- Các văn bản trạng thái: `Calculating...`, `Blocked`, `Expired`, `--` hiện đang dùng chung font size lớn `clamp(1.25rem, 6vw, 2rem)` và font weight 700 như số lượng token thực tế (`0.001122 USDG`), tạo cảm giác thô, quá khổ và không đúng phân cấp thị giác tài chính.

### 3.2 Đặc tả thiết kế mới
1. **Phân cấp typography:**
   - **Số lượng token thực tế (`showQuote && quote`):** Giữ kích thước lớn `clamp(1.25rem, 6vw, 2rem)`, `font-weight: 700`, `color: var(--text-primary)`, `fontVariantNumeric: tabular-nums`.
   - **Trạng thái thông báo (`Calculating...`, `Blocked`, `Expired`, `--`):** Sử dụng font nhỏ hơn, êm dịu hơn: `fontSize: clamp(1rem, 3.5vw, 1.25rem)` (hoặc `1.125rem`), `fontWeight: 600`, `color: var(--text-secondary)`.
2. **Responsive:**
   - Kiểm tra hiển thị chuẩn xác trên Desktop (1440px), Tablet (768px), Mobile (390px/360px).
   - Không bị tràn viền ngang (no horizontal overflow), không bị giật layout khi chuyển trạng thái.

---

## 4. Acceptance Criteria

1. **AC-01 (FUTURE_BLOCK Diagnosis & Clarity):**
   - Có đầy đủ bằng chứng đối chiếu thời gian host, RPC, chain block và phân tích nguyên nhân.
   - Backend log chẩn đoán an toàn khi xảy ra `FUTURE_BLOCK`, **chỉ khi `NODE_ENV=development`** (D2).
   - UI hiển thị thông điệp rõ ràng hướng dẫn đồng bộ đồng hồ khi gặp lỗi này, cả khi API trả `FUTURE_BLOCK` lẫn khi trình duyệt tự phát hiện (QA F-01).
   - Kiểm tra `FUTURE_BLOCK` và giới hạn 20 giây TTL giữ nguyên 100%.
2. **AC-02 (Custom Slippage):**
   - Các preset 0.1%, 0.5%, 1% hoạt động đúng như cũ.
   - Tùy chọn Custom cho phép nhập giá trị từ 0% đến 50% với tối đa 2 chữ số thập phân.
   - Dữ liệu không hợp lệ không kích hoạt fetch, không làm tròn âm thầm, hiển thị thông báo lỗi rõ ràng.
   - Thay đổi slippage cập nhật đúng `minimumAmountOut` và slippage hiển thị.
   - Ba mức cảnh báo đúng như §2.1 mục 3: thường ở `1.01`/`4.99`, mạnh ở `5`/`5.00`/`12.5`/`50` (dưới ô nhập và trong chi tiết quote).
3. **AC-03 (Status Typography):**
   - Trạng thái `Calculating...`, `Blocked`, `Expired`, `--` hiển thị font nhỏ hơn, tinh tế hơn.
   - Số lượng token thực tế hiển thị to, rõ ràng, đậm nét.
   - Không bị tràn layout trên mobile và desktop.
4. **AC-04 (Quality Gates):**
   - 100% test suite `npm test` PASS (bao gồm các test hồi quy mới).
   - `npm run lint`, `npm run typecheck`, `npm run build` PASS (exit 0).
   - Kiểm chứng kịch bản bằng Playwright.

---

> Cập nhật 2026-10-10 theo Plan 003B Amendment 1 (B3): log FUTURE_BLOCK chỉ ở dev (D2), cảnh báo mạnh ≥ 5% (D3), hướng dẫn đồng bộ giờ ở cả nhánh trình duyệt (QA F-01). by Grok Github
