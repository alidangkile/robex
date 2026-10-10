# Plan 003B — Amendment 1: Báo giá swap live chỉ đọc (khớp PR #14 và nghiệm thu HA-14)

> **Trạng thái: Approved by Owner 2026-10-10 (Gate 1).** Nguồn: chủ duyệt Cổng 1 lúc 2026-10-10 16:14 (giờ VN, UTC+7), do Grok Quân Sư chuyển lại cho Grok Product Manager; chưa có bản ghi trên GitHub. Chốt bổ sung D8 lúc 2026-10-10 16:18 (cùng nguồn). Grok Github được phép code các việc ở §9.1. Bản này chưa đẩy lên GitHub.
>
> - Ngày: 2026-10-10 (bản 4, cập nhật 16:18 giờ VN: quyết định D8). Bản trước: bản 3 lúc 16:14 (Cổng 1, D6–D7), bản 2 lúc 15:52 (D1–D5).
> - Người viết: Grok Product Manager (theo giao việc của Grok Quân Sư)
> - Plan gốc: [`plans/003b-live-readonly-swap-quote.md`](https://github.com/alidangkile/robex/blob/main/plans/003b-live-readonly-swap-quote.md) trên `main` (`21b7255`, blob `529ca0f`), chủ duyệt ngày 2026-10-08 (commit `d6efa49`).
> - PR liên quan: [#14 `feat/003b-live-readonly-quote`](https://github.com/alidangkile/robex/pull/14), HEAD `0d5ea211970e1f92666472f412209bb9cc160108`, base `21b7255f18bccc2584e1d3b34782c80da9773d86`, đang **OPEN / chưa merge**.
> - Nghiệm thu HA-14: [comment chủ 2026-10-09](https://github.com/alidangkile/robex/pull/14#issuecomment-6073966646) + `docs/qa/SPEC-HA14-CUSTOM-SLIPPAGE-AND-DIAGNOSTICS.md` (trên nhánh PR).
> - Phạm vi mạng: vẫn **chỉ Robinhood Chain Testnet 46630**. Không mainnet, không thực thi giao dịch.
>
> Quy ước nhãn: **[Có trong PR]** = đã có trong code/test PR #14 tại `0d5ea21`. **[Approved by Owner 2026-10-10]** = chủ đã quyết (§0.1). **[Cần sửa]** = chủ đã duyệt nhưng code PR chưa làm, builder phải làm. **[Không làm]** = chủ đã quyết định không làm.

---

## 0. Tóm tắt

Plan 003B gốc cho phép một báo giá chỉ đọc ETH → USDG với trượt giá mặc định 0,5%. Trong lúc làm PR #14, qua 7 vòng review và một lần nghiệm thu thất bại (HA-14), phạm vi đã thay đổi: thêm trượt giá tùy chỉnh 0–50%, log chẩn đoán FUTURE_BLOCK, chữ trạng thái nhỏ hơn, và nhiều quy tắc an toàn chi tiết hơn Plan (hạn 20 giây tính từ block, đồng hồ đơn điệu, ràng buộc danh tính phản hồi, tính price impact chính xác). Bản sửa này ghi các thay đổi đó vào Plan để PR #14 có đặc tả đã duyệt làm căn cứ nghiệm thu, đúng luật "yêu cầu mới phải thành bản sửa Plan, không nhét thẳng vào PR".

Mọi chính sách của Plan gốc **giữ nguyên** trừ khi bảng dưới ghi khác.

### 0.1 Quyết định của chủ — Approved by Owner 2026-10-10

> Nguồn: D1–D5 là quyết định của chủ ngày 2026-10-10 lúc 15:52; D6–D7 và duyệt Cổng 1 lúc 16:14; D8 lúc 16:18 (giờ VN, UTC+7). Tất cả do Grok Quân Sư chuyển lại cho Grok Product Manager. Chưa có bản ghi trên GitHub.

| # | Quyết định | Áp dụng ở |
|---|---|---|
| D1 | **Dung sai lệch giờ = 0 giây** (giữ đúng HA-14). Chủ sẽ đồng bộ giờ máy Windows chạy API rồi thử lại. Chỉ xem xét nới nếu sau đó vẫn còn FUTURE_BLOCK, và việc đó phải là **một amendment riêng**. | §3, §4 |
| D2 | **Log chẩn đoán FUTURE_BLOCK chỉ ghi ở môi trường dev.** Code hiện ghi ở mọi môi trường nên phải sửa. | §4 |
| D3 | **Cảnh báo mạnh khi trượt giá ≥ 5%**, hiện cả trong phần chi tiết quote. Là yêu cầu bắt buộc, không còn là đề xuất. | §2 |
| D4 | **Pool mỏng: 0,0001 ETH bị chặn (`RANGE_CAP`) là hành vi đúng**, chủ chấp nhận. | §5 |
| D5 | **Gemini là builder cho phần HA-14 đã làm. Từ nay builder Robex là Grok Github.** | §8 |
| D6 | **Không** thêm nút điền sẵn mức tối đa của pool (đề xuất P-LQ-1 cũ). | §5 |
| D7 | **Yêu cầu mới:** nút 25% / 50% / 75% / Max theo số dư ví của token đầu vào. | §6A |
| D8 | Số dư cho nút % đọc **qua ví đã kết nối** (`eth_getBalance` trên provider của ví, ở frontend). **Không** tạo endpoint backend `GET /api/v1/balance`, **không** tạo provider riêng ở backend. Chủ biết và chấp nhận: B8 là phạm vi mới; gần như mọi lần bấm sẽ bị chặn do pool mỏng; phải tin node RPC của ví. | §6A, B8 |

## 1. Thay đổi so với Plan gốc

| # | Mục Plan gốc | Plan gốc ghi | Amendment 1 | Nguồn | Trạng thái |
|---|---|---|---|---|---|
| A1 | §3 Slippage | Mặc định 0,5%; "validate, không tin tham số" | Preset 0,1% / 0,5% (mặc định) / 1% + **Custom 0,00–50,00%**, tối đa 2 chữ số thập phân, không làm tròn ngầm. Trần 50% **giữ nguyên** | HA-14-02; commit `e51d1e1`; chủ xác nhận 2026-10-10 | [Có trong PR], chủ giữ trần 50% |
| A2 | §4 UX | Không có cảnh báo trượt giá | Thông báo ở 0%; cảnh báo thường ở > 1% và < 5% **[Có trong PR]**; **cảnh báo mạnh ở ≥ 5%, hiện cả dưới ô nhập và trong chi tiết quote** | HA-14-02; `SwapPage.tsx`; D3 | [Approved by Owner 2026-10-10], phần ≥ 5% **[Cần sửa]** |
| A3 | §3/§4 Hạn quote | "Quote lifetime 20 seconds", không nói mốc tính | 20 giây tính từ **timestamp block đã ghim**; lỗi `STALE_BLOCK`, `FUTURE_BLOCK`, `READ_BUDGET`, `CLOCK_INVALID`; **dung sai lệch giờ 0 s**; UI dùng đồng hồ đơn điệu, quote hết hạn không "sống lại" | 003B-PRE-01, QA14-02; commit `af07b9f`, `9bc45c4`, `52a50c3`, `2a28bdf`; D1 | [Có trong PR], [Approved by Owner 2026-10-10] |
| A4 | §7 / mới | Không có | Log chẩn đoán có cấu trúc khi `FUTURE_BLOCK`, URL RPC chỉ ghi origin, **chỉ ghi ở môi trường dev**; UI khuyên đồng bộ đồng hồ | HA-14-01, HA14-QA-01/03; commit `e51d1e1`, `948b239`, `0d5ea21`; D2 | [Approved by Owner 2026-10-10], phần chỉ-dev **[Cần sửa]** |
| A5 | §3 Price impact | So với spot đã trừ phí, ngưỡng 1%/2% | So sánh bằng **số hữu tỉ chính xác** với tham chiếu chưa làm tròn; chỉ làm tròn khi hiển thị | QA14-01; commit `5709fb0` | [Có trong PR] (không đổi ngưỡng) |
| A6 | §4 State matrix | "Huỷ request cũ, bỏ kết quả trễ" | UI chỉ hiển thị phản hồi khớp đúng chain, cặp token, amountIn, slippageBps, pool ID; số liệu sai định dạng bị từ chối | QA14-03, 003B-PRE-03; commit `5709fb0`, `37d9992` | [Có trong PR] |
| A7 | §3 Liquidity cap / pool mỏng | Fail closed khi không xác định được mức an toàn | Pool rất mỏng (trần động ~0,00000076 ETH), nên 0,0001 ETH **luôn bị chặn** `RANGE_CAP`. Đây là **hành vi đúng** của 003B; không nới trần | Mô tả PR §6; README evidence; D4, D6 | [Có trong PR], [Approved by Owner 2026-10-10]; nút điền trần pool [Không làm] |
| A8 | §4 Typography | Không ghi | Chữ trạng thái (`Calculating...`, `Blocked`, `Expired`, `--`) nhỏ hơn và nhạt hơn số tiền thật | HA-14-03; `DESIGN.md`; commit `e51d1e1` | [Có trong PR] |
| A9 | §2/§5 Danh tính hợp đồng | Kiểm bytecode + liên kết bằng RPC mới | Ghim địa chỉ (không ghi đè bằng env) và **kích thước + keccak256 bytecode** của PoolManager/StateView/V4Quoter/USDG; provider chỉ cho phép `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`, `eth_call` | Mô tả PR §2; `uniswap-v4-testnet-quote.ts`, `read-only-json-rpc.ts` | [Có trong PR] |
| A10 | §8 Vai trò | ChatGPT Planner, Codex QA, Builder Gemini/Grok | ChatGPT và Codex **không còn tham gia**. Grok PM viết Plan; **Grok Github là builder Robex**; Grok QA Tester là reviewer duy nhất; chủ duyệt cuối | `TEAM-PROCESS.md`; D5 | [Approved by Owner 2026-10-10] |
| A11 | §4 UX, §6 Non-goals ("Do not claim balances", "balance features") | Không đọc, không hiển thị số dư | Đọc **số dư ETH gốc** (chỉ đọc) **qua provider của ví ở frontend** (`eth_getBalance`, kiểm `eth_chainId` trước), không qua backend, không gửi lên API Robex; nút **25% / 50% / 75% / Max** điền số vào ô nhập, tính bằng bigint, làm tròn xuống; vẫn chịu mọi trần. Thay một phần non-goal của Plan 002 / 003B gốc | D7, D8 | [Approved by Owner 2026-10-10], **[Cần sửa]**, phạm vi mới |

## 2. Trượt giá tùy chỉnh (A1, A2)

### 2.1 Chính sách

- Preset: **0,1%**, **0,5% (mặc định)**, **1%**. Thêm lựa chọn **Custom**.
- Custom chấp nhận **0,00% đến 50,00%**, tối đa **2 chữ số thập phân** (tức 0–5000 bps nguyên).
- Trần 50% là **yêu cầu của chủ, giữ nguyên, không giảm**. Các đề xuất trước đó hạ trần (ví dụ "tối đa 5%" trong `dapp-agent-process-review.md` §5.3) **không áp dụng**.
- Ba mức thông báo rủi ro (**Approved by Owner 2026-10-10**, D3), chỉ phụ thuộc giá trị bps, không phụ thuộc preset hay Custom:

| Giá trị | Mức | Nội dung (hiện có hoặc đề xuất câu chữ) | Ở đâu |
|---|---|---|---|
| 0% (0 bps) | Thông báo | "0% slippage may cause transactions to fail if the price moves before execution." **[Có trong PR]** | Dưới ô nhập |
| > 1% và < 5% (101–499 bps) | Cảnh báo thường | "High slippage tolerance increases the risk of unfavorable execution." **[Có trong PR]** | Dưới ô nhập |
| **≥ 5% (500–5000 bps)** | **Cảnh báo mạnh** | Câu chữ đề nghị: "Very high slippage: you could receive up to X% less than the estimate." (X = giá trị đã chọn). Kiểu hiển thị khác hẳn cảnh báo thường (màu nguy hiểm, có biểu tượng, `role="alert"`) **[Cần sửa]** | **Dưới ô nhập và trong phần chi tiết quote, cạnh dòng "Minimum received"** |

- Ở đúng 1% và ở các mức 0,01–1%: không cảnh báo. Cảnh báo mạnh **thay** cảnh báo thường, không hiện cả hai.
- Trong 003B, trượt giá chỉ ảnh hưởng con số **"Minimum received" hiển thị**; không có giao dịch nào được tạo. Plan thực thi swap sau này phải xét lại cách xác nhận khi người dùng chọn trượt giá cao, nhưng **không được tự ý hạ trần 50%** khi chủ chưa duyệt.

### 2.2 Hành vi đã có trong PR #14 — [Có trong PR]

- Frontend `parseSlippagePercentInput` (`apps/web/src/features/swap/SwapPage.tsx`) và backend `parseSlippageQuery` (`apps/api/src/routes/quote.route.ts`) dùng cùng cú pháp: số không âm, không số 0 thừa ở đầu, không dấu chấm đầu/cuối, không dấu phẩy, tối đa 2 chữ số thập phân, ≤ 5000 bps. `resolveSlippageBps` / `minimumAmountOut` (`packages/core/src/quote/v4-math.ts`) chặn ngoài 0–5000 bps.
- Thiếu tham số `slippage` thì backend dùng mặc định 0,5% (50 bps).
- Nhập sai: không gửi request, xoá quote cũ (`setQuote(null)`), hiện lỗi inline. Thông báo hiện có: "Enter a slippage tolerance between 0% and 50%.", "Slippage cannot have more than 2 decimal places.", "Slippage must be a valid number between 0% and 50%.", "Slippage tolerance cannot exceed 50%."
- Cảnh báo hiện chỉ có **một mức** cho mọi giá trị > 1% (1,01% và 50% cùng một câu), chỉ hiện dưới ô nhập ở chế độ Custom. Phần ≥ 5% và hiển thị trong chi tiết quote là **[Cần sửa]** (§9.1, B2).
- Đổi slippage huỷ quote cũ; request đang bay bị `AbortSignal`, kết quả trễ không được hiển thị. Phản hồi phải có `slippageBps` khớp request.
- `minimumAmountOut = floor(amountOut × (10000 − bps) / 10000)`. Codex đã đối chiếu RPC thật: 1122 raw USDG → 1121 ở 1 bps, 561 ở 5000 bps.

### 2.3 Tiêu chí hoàn thành

| ID | Tiêu chí | Cách kiểm |
|---|---|---|
| AC-SL-01 | Preset 0,1 / 0,5 / 1 gửi `slippage` đúng và `slippageBps` 10 / 50 / 100; mặc định là 0,5% | Test UI + kiểm query request |
| AC-SL-02 | Custom chấp nhận `0`, `0.01`, `1`, `1.01`, `2.5`, `4.99`, `5`, `50`, `1.00`, `0.10`; bps nguyên tương ứng, không làm tròn | Test UI + test `parseSlippageQuery` |
| AC-SL-03 | Custom từ chối `50.01`, `0.125`, `-1`, chuỗi rỗng, `abc`, `0,5`, `.5`, `.01`, `1.`, `00.5`: **0 request mới**, nhận `--`, không có chi tiết quote cũ, có lỗi inline | Test UI đếm request; Playwright |
| AC-SL-04 | Backend trả `USER_ERROR` (HTTP 400) cho slippage ngoài 0–50%, quá 2 chữ số thập phân, mảng, hoặc `slippageBps` không phải số nguyên 0–5000; không có quote | Test API |
| AC-SL-05 | `minimumAmountOut` = floor như công thức trên, đúng ở 0, 1, 50, 100, 500, 5000 bps; phản hồi có `slippageBps` khác request thì UI từ chối | Test core + UI; đối chiếu một quote RPC thật |
| AC-SL-06 | Thông báo 0% hiện ở `0`. Không có cảnh báo ở `0.01`, `0.5`, `1`. Cảnh báo **thường** hiện ở `1.01` và `4.99`, và ở hai giá trị này **không** có cảnh báo mạnh | Test UI (bảng giá trị) |
| AC-SL-07 | **Cảnh báo mạnh** hiện ở `5`, `5.00`, `12.5` và `50`: (a) dưới ô nhập, (b) trong phần chi tiết quote cạnh "Minimum received" khi có quote hợp lệ; dùng kiểu khác cảnh báo thường (class/role riêng kiểm được trong test, ví dụ `role="alert"`); cảnh báo thường không hiện cùng lúc | Test UI + ảnh chụp 1440 và 390 |
| AC-SL-08 | Khi quote bị xoá (nhập sai, hết hạn, `Blocked`, sai mạng), cảnh báo mạnh trong phần chi tiết cũng biến mất cùng chi tiết; đổi từ `50` về preset `0.5` thì cảnh báo mạnh biến mất | Test UI |
| AC-SL-09 | Đổi qua lại Custom ↔ preset, sửa nhanh hợp lệ → sai: request đang chạy bị huỷ, kết quả trễ không hiển thị | Test UI race |
| AC-SL-10 | Ô Custom có nhãn truy cập (`aria-label`), có hậu tố `%`; ô nhập, cảnh báo mạnh và chi tiết quote không tràn ngang ở 1440 / 1100 / 768 / 390 / 360 | Playwright đo `scrollWidth` |

## 3. Hạn hiệu lực quote và đồng hồ (A3)

**[Có trong PR]**, làm rõ chính sách 20 giây của Plan gốc. **Dung sai lệch giờ = 0 s — Approved by Owner 2026-10-10 (D1).**

- `quotedAt` = timestamp của block đã ghim (giây × 1000); `expiresAt = quotedAt + 20000`. Phản hồi chậm không được tính lại 20 giây.
- Adapter kiểm độ tươi hai lần (trước khi đọc pool và trước khi trả quote), fail closed với lý do:
  - `STALE_BLOCK`: block đã quá 20 giây.
  - `FUTURE_BLOCK`: giây của block **lớn hơn** `floor(readStartedAtMs / 1000)`. **Không có dung sai lệch giờ.**
  - `READ_BUDGET`: chuỗi đọc dùng hết ngân sách 20 giây.
  - `CLOCK_INVALID`: đồng hồ không dùng được.
- UI kiểm lại bằng đồng hồ trình duyệt, không tin `expiresAt` của API vượt quá block + 20 s. Thời gian còn lại dựa trên đồng hồ đơn điệu (`performance.now()`); quote đã hết hạn hoặc gặp giờ lùi / giá trị đồng hồ không hợp lệ thì **vô hiệu vĩnh viễn** cho tới khi có request mới.

Tiêu chí hoàn thành:

| ID | Tiêu chí |
|---|---|
| AC-TTL-01 | API: `expiresAt − quotedAt = 20000` và `quotedAt` = giây block × 1000 (test API + core) |
| AC-TTL-02 | Block cũ ≥ 20 s → `STALE_BLOCK`; block ở tương lai dù chỉ 1 s → `FUTURE_BLOCK`; đọc chậm hết ngân sách → `READ_BUDGET`; đồng hồ NaN/âm/vô hạn → `CLOCK_INVALID`; không có quote, không gọi adapter mô phỏng |
| AC-TTL-03 | UI: API giả `expiresAt` = block + 1 giờ vẫn hết hạn ở block + 20 s |
| AC-TTL-04 | UI: sau khi hiện "Expired", lùi giờ hệ thống về B+1 s (hoặc trước B) **không** làm quote hiện lại; chỉ "Refresh"/request mới mới có quote mới |
| AC-TTL-05 | UI: `performance.now()` trả NaN/Infinity/âm/không có lúc nhận quote → không hiển thị quote, có thông báo lỗi đồng hồ, không có chữ "NaN" trên DOM |

Giới hạn đã biết, **chấp nhận để sau** (phân loại LOW trên PR): gọi trực tiếp `advanceQuoteClock` trong core với `acceptedMonotonicMs` có mà thiếu `remainingBudgetMs` vẫn có thể trả `valid` (`packages/core/src/quote/v4-math.ts`). SwapPage luôn truyền đủ hai trường nên không bị ảnh hưởng. Để một task bảo trì riêng, không làm trong PR #14.

## 4. FUTURE_BLOCK: log chẩn đoán và thông báo (A4)

### 4.1 Bối cảnh (từ HA-14 và review)

- Chủ gặp lỗi "The pinned chain block timestamp is ahead of the quote clock. No quote is available." khi nhập số ETH.
- Bằng chứng: máy Windows chạy API **không đồng bộ NTP** (`w32tm`: Leap Indicator 3, Local CMOS Clock), chậm khoảng ~1 giây so với UTC (có sai số; con số 1,4 s ban đầu đã được sửa). RTT tới RPC khoảng 200–300 ms. Codex chạy 5 request API thật: **3 FUTURE_BLOCK / 2 thành công**.
- Quy tắc bất biến: **không** tắt kiểm `FUTURE_BLOCK`, **dung sai 0 s** (D1), **không** kéo dài 20 s, **không** dùng giá mô phỏng.

### 4.2 Hành vi đã có trong PR — [Có trong PR]

- Khi `FUTURE_BLOCK` ở cả hai pha (`pre-pool`, `post-quote`), adapter gọi `logger.warn` với ngữ cảnh có cấu trúc: `phase`, `readStartedAtMs`, `readFinishedAtMs`, `blockTimestampSeconds`, `blockNumber`, `diffSeconds`, `rpcUrl`, `chainId`. Lỗi gốc được ném lại nguyên vẹn; không có kết quả pool/quote nào lọt ra.
- `rpcUrl` trong log chỉ là **origin** (`scheme + host + port`), bỏ userinfo, path, query, fragment. URL sai định dạng hoặc scheme khác http/https → chuỗi cố định `[redacted-invalid-rpc-url]`. URL thật dùng để gọi RPC **không đổi**.
- UI hiện: "… No quote is available. Please verify your system clock is synchronized with network time.", nhận `--`, không có chi tiết.
- **Lệch với D2:** log hiện ghi ở **mọi môi trường** (`console.warn`, không xét `NODE_ENV`). Phải sửa (§4.3).

### 4.3 Chính sách log — Approved by Owner 2026-10-10 (D2) — [Cần sửa]

- Log chẩn đoán FUTURE_BLOCK **chỉ ghi khi API chạy ở môi trường dev**, định nghĩa là `NODE_ENV === 'development'`.
- `NODE_ENV` là `production`, `test`, giá trị lạ, hoặc **không đặt** → **không ghi** log chẩn đoán (fail closed: thiếu cấu hình thì im lặng, không phải ghi).
- Tắt log **không** đổi hành vi an toàn: lỗi `FUTURE_BLOCK` vẫn bị ném ra, HTTP 400 vẫn trả về, UI vẫn hiện câu hướng dẫn đồng bộ giờ.
- Cách test: điều kiện môi trường phải tiêm được (ví dụ tham số `isDev`/`diagnosticsEnabled` hoặc hàm đọc env truyền vào adapter), để test không phải sửa `process.env` toàn cục.
- Builder phải kiểm và ghi trong mô tả PR: chạy API theo README (`npm run dev`) trên máy chủ thì `NODE_ENV` có thực sự là `development` không (`.env.example` đặt `NODE_ENV=development`, nhưng chưa xác minh API có nạp file `.env`). Nếu không, ghi rõ cách bật để chủ dùng khi chẩn đoán.

### 4.4 Tiêu chí hoàn thành

| ID | Tiêu chí |
|---|---|
| AC-FB-01 | Dev bật, ép FUTURE_BLOCK ở pre-pool: không gọi quoter, log có đủ 8 trường, giá trị khớp tham số kiểm độ tươi thật (ví dụ ca qua mốc giây: start …999 ms, block +1 s, `diffSeconds = 1`) |
| AC-FB-02 | Dev bật, ép FUTURE_BLOCK ở post-quote: không trả quote, log có `phase = post-quote` với start và block ghim ban đầu |
| AC-FB-03 | Dev bật, URL chứa userinfo, query, fragment, path dài/ngắn/có dấu chấm/percent-encoded: **cả chuỗi message và object ngữ cảnh** chỉ chứa origin; URL sai định dạng/scheme lạ → `[redacted-invalid-rpc-url]` |
| AC-FB-04 | Test tích hợp với `JsonRpcReadOnlyProvider`: request `fetch` dùng đúng URL cấu hình gốc, log (khi dev) chỉ có origin |
| AC-FB-05 | **Chỉ dev:** với `NODE_ENV` = `production`, `test`, không đặt, và một giá trị lạ: ép FUTURE_BLOCK ở **cả hai pha** → spy `logger.warn` (và `console.warn`) **được gọi 0 lần** cho FUTURE_BLOCK; lỗi vẫn là `QUOTE_ERROR`/`FUTURE_BLOCK` y như khi dev bật. Với `NODE_ENV = development` → đúng 1 lần mỗi pha bị lỗi |
| AC-FB-06 | UI khi API trả `FUTURE_BLOCK`: hiện câu hướng dẫn đồng bộ đồng hồ, nhận `--`, không có chi tiết quote (không phụ thuộc môi trường) |
| AC-FB-07 | Điều kiện `blockSec > startedSec` (dung sai 0) và hạn 20 s không đổi so với `2a28bdf` (diff kiểm tra) |
| AC-FB-08 (nghiệm thu thật, chủ làm) | Sau khi **đồng bộ NTP** máy chạy API, chủ thử **≥ 10 lần** quote ETH → USDG thật trên 46630; lấy được ít nhất một quote hợp lệ; ghi số block, số lần thành công / FUTURE_BLOCK. Nếu vẫn còn FUTURE_BLOCK khi giờ đã đồng bộ → mở **amendment riêng** (D1), không sửa trong PR #14 |

### 4.5 Hoãn sang amendment riêng (theo D1), không làm trong PR #14

Nhận định của PM (suy luận, chưa đo): ngay cả khi giờ đã đồng bộ, so với **giây lúc bắt đầu đọc** vẫn có thể lỗi khi mốc giây mới trôi qua trong lúc chờ RPC (Robinhood Chain ra block khoảng 121 ms/lần, RTT 200–300 ms). Kết quả AC-FB-08 sẽ cho biết. Nếu cần, amendment riêng sẽ cân nhắc: đọc lại có giới hạn với **đúng** điều kiện cũ; so với thời điểm kết thúc đọc; hoặc dung sai nhỏ. Hai cách sau là thay đổi chính sách, cần chủ duyệt bằng chữ.

## 5. Pool mỏng / thanh khoản thấp (A7) — Approved by Owner 2026-10-10 (D4)

### 5.1 Hiện trạng — [Có trong PR]

- Chính sách Plan gốc không đổi: giới hạn hiệu lực = **min**(0,0001 ETH; 50% lượng ETH cần để chạm biên dưới dải thanh khoản đang hoạt động; mức thoả price impact ≤ 2%).
- Đo ngày 2026-10-08: trần động `759572282608` wei (≈ 0,00000076 ETH). 0,0001 ETH và 0,00001 ETH → HTTP 400 `RANGE_CAP`; đúng trần → HTTP 200; trần + 1 wei → `RANGE_CAP`.
- UI: nhận hiện `Blocked`, thông điệp nêu lý do và mức trần hiện tại, có số block; không hiện số nhận được. Các lý do chặn khác: `PRICE_IMPACT`, `NO_LIQUIDITY`, `SAFE_CAP_UNKNOWN`, `POOL_FEE_MISMATCH`, `QUOTER_REVERTED`, `INCONSISTENT_STATE`, `ABSOLUTE_CAP`.

### 5.2 Quyết định

- **0,0001 ETH bị chặn khi pool mỏng là hành vi đúng của 003B; chủ chấp nhận.** Không nới trần, không thêm pool mới trong 003B. Câu hỏi mở ở mô tả PR #14 §6 coi như đã được trả lời.
- **[Không làm]** (D6, Approved by Owner 2026-10-10): **không** thêm nút điền sẵn mức tối đa của pool (trần động) vào ô nhập. Nút Max ở §6A là theo **số dư ví**, không phải trần pool.

### 5.3 Tiêu chí hoàn thành

| ID | Tiêu chí |
|---|---|
| AC-LQ-01 | Số lượng > trần động → HTTP 400 `RANGE_CAP` kèm giá trị trần (wei) và số block; UI hiện `Blocked`, mức trần dạng ETH đủ 18 chữ số thập phân, không hiện số nhận |
| AC-LQ-02 | Đúng trần → quote hợp lệ; trần + 1 wei → `RANGE_CAP` (test core + một lần đọc RPC thật ghi block) |
| AC-LQ-03 | Thanh khoản = 0 → `NO_LIQUIDITY`; không xác định được trần → fail closed, không đoán |
| AC-LQ-04 | > 0,0001 ETH → `ABSOLUTE_CAP` dù trần động lớn hơn |
| AC-LQ-05 | Ca price impact nhỏ lẻ: `21825000000` wei / 48 raw USDG → chặn ở 2,0291%; `22700000000` wei / 50 raw → cảnh báo 1,8806% (đã có test, giữ làm hồi quy) |
| AC-LQ-06 (nghiệm thu thật) | Nhập `0.0001` ETH khi pool còn mỏng → `Blocked` kèm mức trần hiện tại; chủ ghi nhận là **đạt** |

## 6. Các làm rõ khác đã có trong PR (A5, A6, A8, A9)

| ID | Tiêu chí |
|---|---|
| AC-PI-01 | Price impact so sánh bằng phân số nguyên chính xác với tham chiếu chưa làm tròn; ngưỡng < 1% bình thường, 1–2% cảnh báo, > 2% chặn **không đổi** |
| AC-ID-01 | UI từ chối phản hồi sai `chainId`, `tokenIn`, `tokenOut`, `amountIn`, `slippageBps`, pool ID, và các số `referenceAmountOut`, `referenceRate`, `priceImpactPercent(Exact)` sai định dạng; có test riêng cho từng trường và một ca hợp lệ |
| AC-PIN-01 | Bytecode khác kích thước hoặc keccak256 đã ghim → lỗi, không quote; địa chỉ không ghi đè được qua env |
| AC-RPC-01 | Provider từ chối mọi method ngoài 5 method chỉ đọc đã liệt kê; không có trường `estimatedGas`, `rawCalldata`, `gasEstimate` trong phản hồi |
| AC-TY-01 | Số tiền thật: `clamp(1.25rem, 6vw, 2rem)`, weight 700, `tabular-nums`. Trạng thái `Calculating...`/`Blocked`/`Expired`/`--`: nhỏ hơn (đo được 18 px ở ≥ 768, 16 px ở 390/360), weight 600, màu phụ. Không tràn ngang ở 1440 / 1280 / 1100 / 768 / 390 / 360 |
| AC-UI-01 | Nút Swap vẫn bị khoá, ghi "Swap execution is a later milestone"; không có popup ký/approve |

## 6A. Nút chọn nhanh 25% / 50% / 75% / Max theo số dư ví (A11) — Approved by Owner 2026-10-10 (D7, D8) — [Cần sửa], phạm vi mới

### 6A.1 Hiện trạng repo (kiểm bằng `gh`, chỉ đọc, nhánh `feat/003b-live-readonly-quote` @ `0d5ea21`)

- **Đã có kết nối ví** (từ Plan 002): `apps/web/src/wallet/` (EIP-6963, injected, mock wallet chỉ cho dev), `wallet-context.tsx`, trạng thái `DISCONNECTED / CONNECTING / CONNECTED / WRONG_NETWORK / UNSUPPORTED_NETWORK`. Adapter injected đã phát sự kiện vô hiệu `account / chain / disconnect` (`onInvalidation`) từ sự kiện của ví.
- **Chưa có đọc số dư ở đâu cả.** `WalletAdapter` (`packages/types/src/wallet.ts`) không có hàm đọc số dư; adapter injected chỉ gọi `eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`. Plan 002 cấm đọc số dư ("Plan 002 performs no balance reads"); Plan 003B gốc ghi "Do not claim balances" (§4) và "balance features" là non-goal (§6).
- **Kết luận: đọc số dư và các nút % là phạm vi mới phải làm thêm.** Amendment này **thay** một phần non-goal của Plan 002 / 003B gốc, chỉ trong giới hạn ở 6A.2.
- Ô nhập "You pay" hiện chặn phía client mọi số > 0,0001 ETH bằng `parseEthAmountInput` ("The read-only limit is 0.0001 ETH."), không gọi RPC.

### 6A.2 Phạm vi

- **Chủ đã biết và chấp nhận** (Approved by Owner 2026-10-10, D8): (1) B8 là **phạm vi mới** so với Plan gốc và PR #14 hiện tại; (2) với pool mỏng hiện nay, **gần như mọi lần bấm sẽ bị chặn** (vượt 0,0001 ETH hoặc vượt trần động ~0,00000076 ETH). Đây không còn là điểm chờ quyết.
- Token đầu vào của 003B chỉ có **ETH gốc** (18 decimals), nên chỉ đọc **số dư ETH gốc** của tài khoản đang kết nối. Không đọc số dư ERC-20 (USDG, WETH), không hiển thị portfolio, tài sản hay giá trị.
- Bốn nút **25% / 50% / 75% / Max**, đặt trong ô "You pay", kèm dòng "Balance: X ETH".
- Bấm nút chỉ **điền số vào ô nhập**; sau đó luồng quote chạy y như khi người dùng gõ tay (cùng kiểm tra, cùng trần, cùng thông báo). Không tự kẹp số về mức trần.
- **Ghi chú ETH gốc:** "Max" = **toàn bộ số dư**, không chừa phí gas. Việc chừa lại phần ETH cho phí gas thuộc **giai đoạn thực thi swap sau**, không thuộc 003B (003B không gửi giao dịch). Plan thực thi sau phải định nghĩa lại "Max" cho ETH gốc.
- Nút Swap vẫn khoá. Không ký, không approve, không gửi giao dịch.

### 6A.3 Cách đọc số dư (chỉ đọc) — Approved by Owner 2026-10-10 (D8)

Đọc **qua ví đã kết nối, ở frontend**, bằng `eth_getBalance` trên provider EIP-1193 của ví. **Không** tạo endpoint backend `GET /api/v1/balance`, **không** tạo provider riêng ở backend.

- Thêm hàm chỉ đọc vào `WalletAdapter`, ví dụ `getNativeBalance(): Promise<{ chainId: number; address: string; balanceWei: string }>`. Feature gọi qua `wallet-context`, **không** gọi `window.ethereum` hay provider trực tiếp (giữ ranh giới Feature → Adapter → Provider của Plan 002).
- Trong adapter injected, mỗi lần đọc:
  1. Gọi `eth_chainId` của ví; khác `0xb626` (46630) → lỗi, không gọi `eth_getBalance`.
  2. Gọi `eth_getBalance(<địa chỉ đang kết nối>, 'latest')`; kết quả phải là hex số nguyên không âm hợp lệ, đổi sang bigint.
  3. Trước khi trả kết quả, kiểm lại phiên: tài khoản và chain vẫn như lúc bắt đầu (không có sự kiện vô hiệu `account` / `chain` / `disconnect` từ `accountsChanged` / `chainChanged` / `disconnect` trong lúc chờ); nếu đã đổi → bỏ kết quả.
- Chỉ dùng các method đọc: `eth_chainId`, `eth_getBalance`. Không gọi `eth_sendTransaction`, `eth_sign`, `personal_sign`, `eth_signTypedData*`, `wallet_*` mới, không gọi gì gây popup.
- Mock wallet (chỉ dev, theo `isMockWalletAllowed`) trả số dư fixture cấu hình được (gồm 0), ghi rõ là mock; không bao giờ dùng mock ở build production.
- **Không gửi địa chỉ ví hay số dư lên API của Robex.** Request quote không có trường số dư hay địa chỉ mới; số dư chỉ nằm trong state frontend, không log.
- **Không tính vào giới hạn 5 lệnh RPC đọc của quote**, vì không đi qua backend. Provider quote ở backend giữ **đúng 5 method** (`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode`, `eth_call`) và vẫn **từ chối** `eth_getBalance`.
- Thời điểm đọc: khi ví vào `CONNECTED` trên 46630, khi đổi tài khoản, khi đổi chain về 46630, và khi người dùng bấm Refresh. Đổi tài khoản / chain / ngắt kết nối → bỏ kết quả đang chờ, xoá số dư cũ.
- Lỗi đọc, timeout, ví từ chối request (ví dụ lỗi EIP-1193 `4001`/`4100`), hoặc chain khác 46630 → **không có số dư, cả 4 nút disabled**, hiện lỗi ngắn; **không** dùng số dư giả, không thử lại liên tục.

### 6A.4 Cách tính số

- Mọi phép tính dùng **bigint trên wei**, không `parseFloat`, không nhân số thực:
  - 25% = `balanceWei * 25n / 100n`, 50% = `* 50n / 100n`, 75% = `* 75n / 100n` (chia nguyên = **làm tròn xuống** theo 18 decimals); Max = `balanceWei`.
- Đổi wei → chuỗi thập phân ETH: tối đa 18 chữ số sau dấu chấm, bỏ số 0 thừa ở cuối, không ký hiệu mũ (`1e-7`), không dấu phẩy nghìn. Chuỗi điền vào ô phải qua `parseEthAmountInput` ra **đúng** số wei đã tính (khứ hồi không mất mát).

### 6A.5 Tiêu chí hoàn thành

| ID | Tiêu chí | Cách kiểm |
|---|---|---|
| AC-PCT-01 | Nút 25/50/75/Max và dòng số dư **chỉ hiện** khi `state = CONNECTED` và `account.chainId = 46630`. Ẩn khi `DISCONNECTED`, `CONNECTING`, `WRONG_NETWORK`, `UNSUPPORTED_NETWORK` | Test UI từng trạng thái (mock adapter) |
| AC-PCT-02 | Tính bằng bigint, làm tròn xuống: số dư `1000000000000000003` wei → 25% = `250000000000000000`, 50% = `500000000000000001`, 75% = `750000000000000002`, Max = `1000000000000000003`; số dư `3` wei → 25/50/75% = `0`, `1`, `2`. Không có `parseFloat`/`Number(...)` trên số tiền trong code mới | Test core + review diff |
| AC-PCT-03 | Chuỗi điền vào ô: `250000000000000000` wei → `0.25`; `1` wei → `0.000000000000000001`; không có dạng mũ; `parseEthAmountInput(chuỗi).wei` = số wei đã tính cho mọi ca ở AC-PCT-02 | Test core |
| AC-PCT-04 | Số dư = 0 → cả 4 nút **disabled** (có `disabled` và `aria-disabled`), bấm không đổi ô nhập, không gửi request. Nút nào tính ra 0 wei (ví dụ 25% của 3 wei) cũng disabled | Test UI |
| AC-PCT-05 | Adapter injected (provider EIP-1193 giả): gọi `eth_chainId` **trước**; trả khác `0xb626` → lỗi và **0 lần** gọi `eth_getBalance`; trả `0xb626` → gọi `eth_getBalance` với đúng địa chỉ đang kết nối và `'latest'`. Kết quả không phải hex hợp lệ / âm → lỗi | Test adapter, spy `request` |
| AC-PCT-06 | Đang tải số dư, `eth_getBalance` lỗi/timeout, hoặc ví từ chối (`4001`, `4100`) → 4 nút disabled, có lỗi ngắn, **không** hiện số dư giả | Test adapter + UI |
| AC-PCT-07 | Đổi tài khoản (`accountsChanged`), đổi chain (`chainChanged`) hoặc ngắt kết nối khi đang đọc số dư → kết quả trễ bị bỏ, số dư cũ bị xoá, nút ẩn hoặc disabled; không bao giờ hiện số dư của tài khoản/chain cũ | Test adapter + UI race |
| AC-PCT-08 | Số sau khi bấm **> 0,0001 ETH** → ô nhập nhận đúng số đó (không tự kẹp), hiện lỗi inline rõ ràng "The read-only limit is 0.0001 ETH." (hoặc câu tương đương nêu mức trần), **0 request quote**, nhận `--` | Test UI đếm request |
| AC-PCT-09 | Số sau khi bấm **≤ 0,0001 ETH nhưng > trần động của pool** → request quote gửi đi, API trả `RANGE_CAP`, UI hiện `Blocked` kèm mức trần hiện tại (như AC-LQ-01); không có số nhận | Test UI fixture + một lần thử RPC thật ghi block |
| AC-PCT-10 | Số sau khi bấm ≤ trần động → quote hợp lệ như nhập tay (cùng slippage, cảnh báo, hạn 20 s) | Test UI fixture |
| AC-PCT-11 | **Không gửi địa chỉ hay số dư lên API Robex:** trong mọi request tới API (quote) khi ví đã kết nối và đã đọc số dư, URL/query/body **không** chứa địa chỉ ví hay `balance`. Không có route backend mới (`/api/v1/balance` không tồn tại → 404) | Test UI chặn `fetch` + kiểm route |
| AC-PCT-12 | Provider quote backend vẫn chỉ cho **đúng 5 method** cũ; gọi `eth_getBalance` qua `JsonRpcReadOnlyProvider` → bị từ chối. Không có provider backend mới | Test API |
| AC-PCT-13 | Code đọc số dư chỉ gọi `eth_chainId` và `eth_getBalance` trên provider ví; không có method ký/gửi giao dịch/`wallet_*` mới; mock chỉ bật ở dev. Nút Swap vẫn khoá; Max không trừ gas (6A.2) | Test adapter (spy) + review diff |
| AC-PCT-14 | Nút và dòng số dư không tràn ngang ở 1440 / 1100 / 768 / 390 / 360; nút có nhãn truy cập ("Use 25% of balance"…) | Playwright đo `scrollWidth` |

### 6A.6 Rủi ro đã biết

- **Phải tin node RPC của ví** (Approved by Owner 2026-10-10, D8): số dư đến từ RPC mà ví người dùng cấu hình, Robex không tự xác minh độc lập. Chain được kiểm bằng `eth_chainId` của chính ví. Vì 003B chỉ dùng số dư để điền ô nhập (không giao dịch, mọi trần vẫn áp dụng), ảnh hưởng của số dư sai chỉ là số điền vào ô bị sai. Plan thực thi sau phải xét lại.
- Hành vi các ví khác nhau (một số ví trả lỗi hoặc chậm khi chưa mở khoá) → xử lý như lỗi đọc (AC-PCT-06), cần thử ở nghiệm thu với ví thật.

## 7. Không đổi và ngoài phạm vi

Giữ nguyên toàn bộ §2 (on-chain cố định), §5 (kiến trúc), §6 (non-goals) của Plan gốc, **trừ** ngoại lệ số dư ETH gốc cho nút % ở §6A (vẫn cấm số dư ERC-20, portfolio, tài sản). Nhắc lại: không ký, không approve, không calldata, không router, không mainnet, không `ALLOW_MAINNET`, không sửa `blockTimeMs` hay chain ID mainnet `46600` trong 003B, không thêm thư viện mới, không fallback mô phỏng, không dung sai lệch giờ. Không làm nút điền trần pool (D6).

## 8. Vai trò (thay §8 Plan gốc) — Approved by Owner 2026-10-10 (D5)

Theo `TEAM-PROCESS.md` (chủ duyệt 10/10/2026) và quyết định D5:

- **ChatGPT và Codex không còn tham gia.** Các review/verdict của Codex trên PR #14 chỉ là **bằng chứng lịch sử** gắn với SHA cũ, không thay cho review mới.
- **Grok Product Manager**: viết và sửa Plan (bản này).
- **Grok Quân Sư**: điều phối, cập nhật trạng thái từ GitHub, báo cáo chủ.
- **Builder:**
  - **Gemini (Antigravity)** là builder đã làm phần HA-14 trên PR #14 (commit `e51d1e1`, `948b239`, `0d5ea21`); chủ ghi nhận việc này. Gemini không nhận thêm việc Robex.
  - **Từ nay builder Robex là Grok Github**, kể cả mọi commit mới trên PR #14. Grok Github có thể giao code nặng cho `agy` (skill delegate-coding-to-antigravity-cli), làm trong **git worktree riêng**, không sửa trong `/workspace/robex` dùng chung.
- **Grok QA Tester**: reviewer/QA **duy nhất**. Review đúng SHA, chạy lại test, kết luận PASS / PASS WITH LIMITATION / FAIL / BLOCKER. FAIL quá 2 vòng → báo chủ.
- **Chủ**: Cổng 1 duyệt Plan (bản sửa này), Cổng 2 nghiệm thu, Cổng 3 tự merge.
- Mọi comment GitHub phải ghi rõ bot nào viết (cùng một tài khoản `alidangkile`).

## 9. Việc còn lại

### 9.1 Việc còn lại cho builder (Grok Github)

Chỉ bắt đầu khi chủ duyệt Amendment 1 ở Cổng 1 và cho phép code. Làm commit mới trên nhánh `feat/003b-live-readonly-quote` (PR #14), trong worktree riêng, rồi **dừng** chờ QA.

| # | Việc | Tiêu chí liên quan |
|---|---|---|
| B1 | **Log FUTURE_BLOCK chỉ ở dev:** chặn `logFutureBlockDiagnostic` khi `NODE_ENV !== 'development'` (kể cả không đặt), điều kiện tiêm được để test; giữ nguyên việc ném lỗi và rút gọn URL. Thêm test cho cả hai pha × các giá trị `NODE_ENV`. Kiểm `npm run dev` có cho `NODE_ENV=development` không và ghi lại cách bật log | §4.3, AC-FB-01…05 |
| B2 | **Cảnh báo mạnh ≥ 5%:** thêm mức thứ ba vào `parseSlippagePercentInput` (hoặc hàm phân loại riêng theo bps), hiện dưới ô nhập **và** trong phần chi tiết quote cạnh "Minimum received", kiểu khác cảnh báo thường; test 4,99 / 5 / 5.00 / 12.5 / 50 và ca biến mất khi quote bị xoá | §2.1, AC-SL-06…08, AC-SL-10 |
| B3 | Cập nhật `docs/qa/SPEC-HA14-CUSTOM-SLIPPAGE-AND-DIAGNOSTICS.md` và `DESIGN.md` cho khớp B1, B2 (SPEC hiện ghi "Dev/Redacted" nhưng code ghi mọi môi trường; DESIGN chưa có mức ≥ 5%) | §2, §4 |
| B4 | **Cập nhật mô tả PR #14** theo SHA cuối: hiện vẫn ghi commit `9865f8f` và "93 tests". Số đúng hiện tại là commit `0d5ea21`, **142/142 test, 13 file**; sau B1–B3 và B8 phải ghi lại SHA và số test mới. Thêm tóm tắt HA-14, các quyết định D1–D7, duyệt Cổng 1, phạm vi mới §6A, link Amendment 1, và xoá câu hỏi mở về pool mỏng (đã trả lời ở D4) | §9 |
| B5 | **Chụp lại ảnh bằng chứng** trong `docs/qa/evidence/003b-stage-b/`: ảnh hiện tại có impact "0.0000%" từ trước bản sửa QA14-01. Chụp lại ở 1440 / 1100 / 768 / 390 (thêm 360 cho cảnh báo) các trạng thái: quote live, `Blocked` 0,0001 ETH, `Expired`, rỗng, sai mạng (ghi rõ mock wallet), Custom 0% / 1,01% / 4,99% / 5% / 50%, lỗi FUTURE_BLOCK; **thêm cho §6A:** ví đã kết nối đúng 46630 có dòng số dư và 4 nút, số dư 0 (nút disabled), lỗi đọc số dư, đang đọc số dư (nút disabled), lỗi đọc / ví từ chối, bấm 25%/Max ra lỗi trần 0,0001 ETH, bấm ra số ≤ 0,0001 nhưng bị `RANGE_CAP`, sai mạng (nút ẩn); ở 1440 và 390/360. Ghi rõ ảnh dùng mock wallet hay ví thật; ít nhất một ảnh với **ví thật** trên 46630 có dòng số dư (che bớt địa chỉ nếu muốn). Cập nhật README evidence; ghi ảnh nào dùng RPC thật, ảnh nào dùng fixture | §2.3, §6, Plan gốc §7 |
| B6 | Chạy và ghi exit code: `npm run test` (test discovery sạch, không quét `.playwright-mcp`), `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check 0d5ea21 <HEAD>` và `git diff --check 21b7255 <HEAD>`. Không commit file tạm của QA | Plan gốc §7 |
| B8 | **Nút 25% / 50% / 75% / Max theo số dư ví (phạm vi mới, đọc qua ví — D8):** (1) thêm `getNativeBalance()` (chỉ đọc) vào `WalletAdapter` trong `packages/types/src/wallet.ts`; cài trong adapter injected: `eth_chainId` phải là `0xb626` rồi mới `eth_getBalance(address, 'latest')`, kiểm hex hợp lệ, bỏ kết quả nếu có sự kiện `account`/`chain`/`disconnect` trong lúc chờ; cài trong mock adapter (chỉ dev) với số dư fixture cấu hình được, gồm 0; (2) đưa vào `wallet-context` (đọc khi `CONNECTED` trên 46630, khi đổi tài khoản/chain, khi Refresh; xoá khi vô hiệu); (3) hàm core bigint tính % và đổi wei → chuỗi ETH khứ hồi qua `parseEthAmountInput`; (4) UI: dòng số dư + 4 nút trong ô "You pay", ẩn khi không `CONNECTED` trên 46630, disabled khi số dư 0/đang tải/lỗi/ví từ chối. **Không** tạo route hay provider backend, **không** gửi địa chỉ/số dư lên API. **Test:** core (AC-PCT-02/03, gồm 0, 1, 3 wei, 10^18+3 wei), adapter với provider EIP-1193 giả (AC-PCT-05/06/07/13), UI (AC-PCT-01, 04, 06–11), API (AC-PCT-12), Playwright (AC-PCT-14). Không thêm thư viện mới. Cập nhật `DESIGN.md` | §6A, AC-PCT-01…14 |
| B7 | Không đụng các phần đã PASS: điều kiện FUTURE_BLOCK (dung sai 0), hạn 20 s, ngưỡng price impact, trần số lượng, preset/khoảng 0–50%, typography | §3, §5, §6 |

Thứ tự đề nghị: B1 → B2 → B8 → B3 → B6 → B5 → B4 (mô tả PR viết sau cùng theo SHA cuối). B7 áp dụng suốt.

Không thuộc phạm vi builder lúc này: lỗi LOW `advanceQuoteClock` (task bảo trì riêng), nút điền trần pool (D6, không làm), số dư ERC-20, chừa phí gas cho Max (giai đoạn thực thi), mọi thay đổi chính sách FUTURE_BLOCK (amendment riêng nếu cần).

### 9.2 Việc chờ chủ

1. **Cổng 1: đã duyệt** 2026-10-10 16:14 (Approved by Owner 2026-10-10 (Gate 1)); Grok Github được code B1–B8.
2. **Đồng bộ giờ máy Windows chạy API** (NTP; kiểm bằng `w32tm /query /status`), rồi **thử lại quote thật ≥ 10 lần** trên commit cuối, ghi số thành công / FUTURE_BLOCK và số block (AC-FB-08). Nếu vẫn còn FUTURE_BLOCK → báo Quân Sư để mở amendment riêng.
3. **Cổng 2:** nghiệm thu thật: AC-FB-08, nút 25/50/75/Max với **ví thật** trên 46630 (số dư khớp số dư ví/explorer, bấm ra số đúng, bị chặn rõ ràng khi vượt trần — đã được chủ chấp nhận là kết quả thường gặp; thử thêm ví bị khoá/từ chối), trượt giá Custom (gồm 4,99%, 5%, 50%), chữ trạng thái, `Blocked` ở 0,0001 ETH (AC-LQ-06), ví thật (connect/disconnect/sai mạng/đổi tài khoản), nút Swap vẫn khoá.
4. **Cổng 3:** chủ tự merge.

### 9.3 QA (Grok QA Tester)

- Review PR #14 trên **đúng HEAD cuối** sau B1–B8 (không dùng verdict Codex trên `0d5ea21` thay thế), đối chiếu Plan gốc + Amendment 1, kiểm từng AC ở §2–§6A.
- Chạy lại độc lập các lệnh ở B6, ghi exit code và số test thật.
- Tách rõ bằng chứng RPC thật với fixture. Kết luận PASS / PASS WITH LIMITATION / FAIL / BLOCKER, ghi nhãn bot trong comment.
- Commit mới bất kỳ sau review làm mất hiệu lực review/nghiệm thu của SHA cũ.

## 10. Câu hỏi còn mở

Không còn câu hỏi mở cho chủ. Q-LQ-1 đã được trả lời bằng D6 (không làm).
