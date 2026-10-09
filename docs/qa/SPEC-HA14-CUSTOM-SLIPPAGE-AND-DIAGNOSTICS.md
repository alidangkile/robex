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
   - Bổ sung log chẩn đoán an toàn (không chứa private key / sensitive data, URL secrets/query params/userinfo được redact) trong `uniswap-v4-readonly-adapter.ts` khi `FUTURE_BLOCK` xảy ra, bao gồm: `readStartedAtMs`, `readFinishedAtMs`, `blockTimestampSeconds`, `blockNumber`, `diffSeconds`, `rpcUrl`, `chainId`.
2. **Hướng dẫn người dùng & Thông báo rõ ràng:**
   - Cung cấp thông báo lỗi rõ ràng hướng dẫn người dùng đồng bộ đồng hồ thiết bị/máy tính với thời gian Internet (`Sync system clock`) khi gặp `FUTURE_BLOCK`.

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
3. **Cảnh báo rủi ro (Risk Communication):**
   - Nếu Custom Slippage > `1.0%`: Hiển thị cảnh báo rủi ro biến động giá / front-running.
   - Nếu Custom Slippage = `0%`: Hiển thị thông báo giao dịch có thể revert nếu giá biến động nhỏ.
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
   - Backend log chẩn đoán an toàn khi xảy ra `FUTURE_BLOCK`.
   - UI hiển thị thông điệp rõ ràng hướng dẫn đồng bộ đồng hồ khi gặp lỗi này.
   - Kiểm tra `FUTURE_BLOCK` và giới hạn 20 giây TTL giữ nguyên 100%.
2. **AC-02 (Custom Slippage):**
   - Các preset 0.1%, 0.5%, 1% hoạt động đúng như cũ.
   - Tùy chọn Custom cho phép nhập giá trị từ 0% đến 50% với tối đa 2 chữ số thập phân.
   - Dữ liệu không hợp lệ không kích hoạt fetch, không làm tròn âm thầm, hiển thị thông báo lỗi rõ ràng.
   - Thay đổi slippage cập nhật đúng `minimumAmountOut` và slippage hiển thị.
3. **AC-03 (Status Typography):**
   - Trạng thái `Calculating...`, `Blocked`, `Expired`, `--` hiển thị font nhỏ hơn, tinh tế hơn.
   - Số lượng token thực tế hiển thị to, rõ ràng, đậm nét.
   - Không bị tràn layout trên mobile và desktop.
4. **AC-04 (Quality Gates):**
   - 100% test suite `npm test` PASS (bao gồm các test hồi quy mới).
   - `npm run lint`, `npm run typecheck`, `npm run build` PASS (exit 0).
   - Kiểm chứng kịch bản bằng Playwright.
