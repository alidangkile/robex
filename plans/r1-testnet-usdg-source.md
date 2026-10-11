# Research R1 — Find a Legitimate Source of Paxos Testnet USDG on 46630

> **Status:** HOÀN THÀNH NGHIÊN CỨU (Research & Discovery only — Docs only).
> **Owner Approval:** Được phê duyệt bởi Owner vào 2026-10-11 16:52 (UTC+7) trên [Issue #29](https://github.com/alidangkile/robex/issues/29).
> **Vai trò:** Builder = **Gemini**, Independent QA = **Grok**, Mentor / Final Review = **Claude**, Final Authority = **Owner**.
> **Giới hạn an toàn:** Chỉ sử dụng các lệnh đọc `eth_call`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, Blockscout Explorer API và tài liệu công khai. Tuyệt đối không gửi giao dịch, không ký ví, không gọi hàm claim/mint, không đăng ký tài khoản thay Owner, không nhập thông tin cá nhân vào bất kỳ biểu mẫu nào.

---

## 1. Trích dẫn phê duyệt của Owner

Theo quy ước quản trị [AGENTS.md](../AGENTS.md), nhiệm vụ này được bắt đầu sau khi Owner phê duyệt trực tiếp trên [Issue #29](https://github.com/alidangkile/robex/issues/29):
```text
**Owner đã đồng ý lộ trình (2026-10-11 16:52 UTC+7, ghi bởi Claude theo chat).** Builder Gemini, QA Grok. Được bắt đầu ngay.
```

---

## 2. Trả lời dứt khoát 3 câu hỏi cốt lõi

### Câu hỏi 1: Có cách hợp lệ nào để ví của Owner nhận USDG testnet đúng hợp đồng `0x7E955252E15c84f5768B83c41a71F9eba181802F` trên 46630 không?
- **KẾT LUẬN: CÓ (FACT).**
- **Nguồn chính thức:** **Paxos Testnet Faucet** tại địa chỉ: [https://faucet.paxos.com/](https://faucet.paxos.com/)
- **Lượng nhận mỗi lần:** **100 USDG** (tương đương `100,000,000` raw units với 6 decimals).
- **Giới hạn thời gian (Rate Limit):** **1 lần / ngày / ví** (24 giờ cooldown theo địa chỉ ví nhận; client-side có thêm bước kiểm tra giãn cách 60 giây giữa các lần bấm).
- **Điều kiện:** **KHÔNG cần đăng ký tài khoản, KHÔNG KYC, KHÔNG mật khẩu, KHÔNG phí gas**. Đây là vòi nước công khai, hoàn toàn permissionless: Owner chỉ cần dán địa chỉ ví EVM nhận và bấm nút gửi.

### Câu hỏi 2: Hợp đồng USDG đó có hàm mint công khai/faucet không?
- **KẾT LUẬN: KHÔNG (FACT).**
- Hợp đồng `0x7E955252E15c84f5768B83c41a71F9eba181802F` có tồn tại hàm `mint(address account, uint256 amount)` và `increaseSupplyToAddress(uint256 value, address mintToAddress)` trong ABI và bytecode, nhưng hàm này **bị kiểm soát quyền truy cập chặt chẽ** qua hợp đồng `SupplyControl` (`0x4549bb98c667aab626627c118102c28065e8f54c`).
- Bất kỳ ví EOA thông thường nào gọi `mint(...)` đều lập tức revert với selector `0xdcae1750` (`AccountMissingSupplyControllerRole(address)`).
- Chỉ có đúng 4 địa chỉ được ủy quyền vai trò `SUPPLY_CONTROLLER_ROLE` mới có thể mint token (gồm 3 EOA nội bộ của Paxos và 1 hợp đồng LayerZero OFT Wrapper).

### Câu hỏi 3: Có bridge hoặc nguồn nào khác chính thức (Robinhood, Paxos) cấp USDG testnet không?
- **KẾT LUẬN: CÓ (FACT).**
  1. **Nguồn chính thức 1 (Faucet trực tiếp - Khuyến nghị):** `https://faucet.paxos.com/` (phát thẳng 100 USDG vào mạng Robinhood Chain Testnet 46630).
  2. **Nguồn chính thức 2 (LayerZero OFT Cross-chain Bridge):** Paxos đã triển khai hợp đồng `OFTWrapperUpgradeable` (`0x54de1f4c0530b28720b227c501fd245fc7051d33`) kết nối với USDG trên Ethereum Sepolia (Peer `0xfb0633ec2fac799224b63ecb45bb542ed45e3f94`, EID `40161`). Có thể bridge USDG từ Sepolia sang 46630 qua LayerZero. (Tuy nhiên do Faucet Paxos đã phát trực tiếp lên 46630 nên việc bridge là không bắt buộc).
  3. **Nguồn chính thức 3 (Paxos Developer Sandbox Dashboard):** Nạp qua giao diện quản trị Sandbox của Paxos tại `https://dashboard.sandbox.paxos.com` (chức năng "Deposit" / "Create Sandbox Deposit"), yêu cầu tài khoản Sandbox đối tác của Paxos.
  4. **Faucet riêng của Robinhood (`https://faucet.testnet.chain.robinhood.com/`):** **KHÔNG phát USDG**; tài liệu và kiểm chứng cho thấy faucet này chỉ phát testnet ETH và mock stock tokens (AAPL, NVDA...).

---

## 3. Scope A: Phân tích On-Chain hợp đồng USDG `0x7E955252E15c84f5768B83c41a71F9eba181802F`

### 3.1. Cấu trúc Proxy & Implementation
- **[FACT]** Tra cứu on-chain tại block `132881856`:
  - Mã bytecode tại `0x7E955252E15c84f5768B83c41a71F9eba181802F`: 170 bytes (kích thước chuẩn của proxy tối giản ERC-1967).
  - Storage slot EIP-1967 implementation (`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`):
    `0x000000000000000000000000f0863d7a29a55d0c4263c11bfac754312ff078df`
  - Địa chỉ Implementation: `0xF0863D7A29a55d0c4263c11bFac754312ff078DF`.
- **[FACT]** Trạng thái trên Blockscout Explorer:
  - Cả Proxy và Implementation đều đã được xác minh mã nguồn công khai (Verified Contract: `true`, Solidity `v0.8.28`).
  - Tên hợp đồng: `USDG` (Global Dollar).

### 3.2. Thuộc tính Token cơ bản qua `eth_call`
- **[FACT]** Kết quả gọi các hàm view tiêu chuẩn tại block `132881856`:
  - `name()`: `"Global Dollar"`
  - `symbol()`: `"USDG"`
  - `decimals()`: `6`
  - `totalSupply()`: `57,301,240,000,000` raw units (= **57,301,240 USDG**, tương đương $57.3 triệu USDG testnet).
  - `owner()`: `0x3a5b30d74e90e08f0e576cf9f6f2457e44af38b3`
  - `supplyControl()`: `0x4549bb98c667aab626627c118102c28065e8f54c`

### 3.3. Cơ chế kiểm soát Mint & Bằng chứng Revert
- **[FACT]** Kiểm tra mã nguồn Solidity của `USDG` (dòng 262–295):
  ```solidity
  function increaseSupplyToAddress(uint256 value, address mintToAddress) public virtual returns (bool success) {
      if (_isAddrFrozen(mintToAddress)) revert AddressFrozen();
      supplyControl.canMintToAddress(mintToAddress, value, msg.sender);
      totalSupply_ += value;
      ...
      emit SupplyIncreased(mintToAddress, value);
  }

  function mint(address account, uint256 amount) public {
      increaseSupplyToAddress(amount, account);
  }
  ```
  Hàm `mint` bắt buộc phải gọi sang `supplyControl.canMintToAddress(mintToAddress, value, msg.sender)`.
- **[FACT]** Hợp đồng `supplyControl` (`0x4549bb98c667aab626627c118102c28065e8f54c`):
  - Implementation: `0xC804f2e8AE84f6CFA01d9d33EF107323bf0F9a59` (`SupplyControl`).
  - Hàm `getAllSupplyControllerAddresses()` trả về danh sách 4 địa chỉ được ủy quyền `SUPPLY_CONTROLLER_ROLE`:
    1. `0x7339d29a058a853e7c171c581d53ef14167e5aba` (EOA của Paxos)
    2. `0x54de1f4c0530b28720b227c501fd245fc7051d33` (Hợp đồng `OFTWrapperUpgradeable` của LayerZero)
    3. `0x343fad2bb3a6bfb0cb814effb1a88a5cbd247e4b` (EOA của Paxos)
    4. `0xe3ac6fed0d9eaa2357b3c9266f6962647e61c38e` (EOA của Paxos)
- **[FACT]** Bằng chứng mô phỏng `eth_call`:
  - Lệnh gọi: `mint(0x8e94699c825a15275e720549aCE1D37612dD0d71, 100000000)` từ địa chỉ ví không có quyền (`from = 0x8e94...`).
  - Kết quả trả về:
    `{"code":3,"message":"execution reverted","data":"0xdcae17500000000000000000000000008e94699c825a15275e720549ace1d37612dd0d71"}`
  - Selector `0xdcae1750` khớp chính xác 100% với lỗi `AccountMissingSupplyControllerRole(address account)` được định nghĩa trong contract `SupplyControl`.
  - **Kết luận:** Người ngoài / ví cá nhân không thể tự gọi hàm mint trên contract để nhận USDG.

### 3.4. Phân bổ Cung tiền (Top Token Holders)
- **[FACT]** Dữ liệu Blockscout API (`/api/v2/tokens/0x7E955252E15c84f5768B83c41a71F9eba181802F/holders`) tại block `132881856`:
  - Tổng số lượng ví đang nắm giữ (holders count): **4,351 ví**.
  - Top 4 ví nắm giữ lớn nhất (chiếm > 88% tổng cung):
    1. `0x545FA0D7993929FEf64158F68799E6fAdfbEb983`: `29,199,500 USDG` (50.96%) — Kho bạc Paxos Treasury.
    2. `0x54b83d1e6Ee818FFB96D260Fc3E4dfc3Aaf03f79`: `9,998,902 USDG` (17.45%).
    3. `0xbb9b227DDCdaE7A5B01b9B737C8d9659e14a92BF`: `7,197,734 USDG` (12.56%).
    4. `0x7253Aa1F10E7d8fbEeb2437bA92Bf8166a2e4a0F`: `4,108,232 USDG` (7.17%).

---

## 4. Scope B: Khảo sát Nguồn Faucet Chính Thức của Paxos

### 4.1. Tài liệu Hướng dẫn của Paxos
- **[FACT]** Tài liệu nhà phát triển chính thức của Paxos tại:
  `https://docs.paxos.com/guides/developer/fund-sandbox-with-test-crypto`
  (Cập nhật lần cuối: 2026-08-27, mục ➋ Source Test Assets):
  > *"The Paxos Testnet Faucet (https://faucet.paxos.com) is the recommended source for Paxos-issued test assets including USDP, PAXG, PYUSD, and USDG across supported networks."*
- **[FACT]** Bảng đối chiếu mạng lưới trong tài liệu Paxos liệt kê rõ ràng:
  - Mạng: `Robinhood Chain` (Testnet)
  - Faucet: `https://faucet.testnet.chain.robinhood.com` (cho native ETH)
  - Paxos Faucet: `https://faucet.paxos.com` (cho USDG)

### 4.2. Bằng chứng Trích xuất từ Client Bundle của Paxos Faucet
- **[FACT]** Kiểm tra tệp Javascript thực thi của giao diện Faucet tại:
  `https://faucet.paxos.com/assets/index-Cnwrg2YM.js` (kích thước 541,440 bytes):
  1. **Cấu hình Token & Mạng:**
     ```javascript
     TOKENS_CONFIG: {
       USDG: {
         networks: ['ETHEREUM', 'SOLANA', 'XLAYER', 'ARBITRUM_ONE', 'INK', 'ROBINHOOD', 'MANTLE']
       }
     }
     ```
  2. **Cấu hình Mạng Robinhood:**
     ```javascript
     ROBINHOOD: {
       name: 'Robinhood Chain Testnet',
       testnetLink: 'https://explorer.testnet.chain.robinhood.com/address/[address]',
       iconName: 'robinhood',
       customClass: 'w-[22px]'
     }
     ```
  3. **Địa chỉ Hợp đồng USDG được Ghim:**
     ```javascript
     ['ROBINHOOD_USDG', 'https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F']
     ```
     Khớp chính xác 100% với địa chỉ USDG mà Robex đang sử dụng!
  4. **Số lượng cấp phát (Amount):**
     Hằng số hiển thị nút bấm: `GT = 100` → `Send 100 Tokens` (tức **100 USDG** mỗi lượt yêu cầu).
  5. **Quy định Giới hạn (Rate Limit):**
     Được ghi rõ trong giao diện: `"Limit 1 request per wallet per day"` (mỗi ví được nhận tối đa 1 lần trong 24 giờ). Phía client kiểm tra thêm giãn cách 60 giây giữa các lần gửi (`diff(e, 'second') < 60`).
  6. **Cơ chế Giao tiếp Backend:**
     Form gửi HTTP POST tới endpoint:
     `POST https://faucet.paxos.com/v2/treasury/faucet/transfers`
     Payload JSON:
     ```json
     {
       "token": "USDG",
       "network": "ROBINHOOD",
       "address": "<wallet_address>"
     }
     ```

---

## 5. Scope C: Các nguồn khác & Cầu nối LayerZero OFT

### 5.1. Cầu nối LayerZero Omnichain Fungible Token (OFT)
- **[FACT]** Địa chỉ `0x54de1f4c0530b28720b227c501fd245fc7051d33` là một `SupplyController` của USDG trên 46630.
- **[FACT]** Contract này là `OFTWrapperUpgradeable` của LayerZero:
  - `paxosToken()`: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
  - `endpoint()`: `0x3acaaf60502791d199a5a5f0b173d78229ebfe32` (LayerZero Endpoint trên 46630)
  - Peer cho Endpoint ID `40161` (Ethereum Sepolia):
    `0x000000000000000000000000fb0633ec2fac799224b63ecb45bb542ed45e3f94`
- **[FACT]** Cơ chế hoạt động: Khi người dùng chuyển USDG từ Ethereum Sepolia sang Robinhood Testnet qua giao thức LayerZero, hợp đồng này sẽ nhận tin nhắn và gọi hàm mint nội bộ để phát hành USDG tương ứng trên 46630.

### 5.2. Paxos Developer Sandbox Dashboard
- **[FACT]** Paxos cung cấp môi trường Sandbox Console tại `https://dashboard.sandbox.paxos.com`.
- Người dùng có tài khoản developer đối tác có thể vào mục "Deposit" hoặc gọi API `POST https://api.sandbox.paxos.com/v2/transfer/sandbox-deposits` để nạp số dư USDG giả lập. Tuy nhiên, phương thức này hướng tới tích hợp doanh nghiệp (B2B Sandbox) và yêu cầu đăng ký tài khoản.

### 5.3. Faucet riêng của Robinhood (`faucet.testnet.chain.robinhood.com`)
- **[FACT]** Faucet của Robinhood Chain được lưu trữ tại `https://faucet.testnet.chain.robinhood.com/`.
- Faucet này phân phối testnet ETH (dùng để trả phí gas) và các mock stock tokens phục vụ cho dApp demo, **không hỗ trợ phân phối USDG**.

---

## 6. Hướng dẫn từng bước để Owner tự nhận 100 USDG testnet

Vì việc nhận token yêu cầu nhập địa chỉ ví cá nhân của Owner và theo quy tắc an toàn Builder tuyệt đối không nhập thông tin cá nhân hay tương tác thay Owner, Owner có thể tự thực hiện theo các bước cực kỳ đơn giản sau:

### Các bước thao tác (Mất khoảng 1 phút):
1. **Bước 1:** Mở trình duyệt web và truy cập vào trang Faucet chính thức của Paxos:
   👉 **[https://faucet.paxos.com/](https://faucet.paxos.com/)**
2. **Bước 2 (Chọn Token):** Ở danh sách biểu tượng token phía trên, bấm chọn **USDG** (Global Dollar).
3. **Bước 3 (Chọn Mạng):** Trong ô thả xuống **Network**, chọn **Robinhood Chain Testnet** (biểu tượng cánh cung màu xanh/đen của Robinhood).
   *(Giao diện sẽ hiển thị link "View USDG smart contract address" trỏ đúng về `0x7E95...802F` trên Blockscout).*
4. **Bước 4 (Dán địa chỉ ví):** Trong ô **Send to (Wallet Address)**, dán địa chỉ ví EVM của Owner (ví dụ ví MetaMask, OKX hoặc Coinbase Wallet đang dùng để test Robex).
5. **Bước 5 (Nhận token):** Bấm nút màu đen **"Send 100 Tokens"**.
6. **Bước 6 (Kiểm tra số dư):** Hệ thống sẽ hiện thông báo thành công kèm link theo dõi giao dịch. Đợi khoảng 1–2 phút để mạng 46630 xác nhận, sau đó kiểm tra số dư USDG trên ví hoặc tra cứu tại:
   `https://explorer.testnet.chain.robinhood.com/address/<địa_chỉ_ví_của_Owner>`

---

## 7. Các phương án thay thế & Đánh đổi (Trade-offs)

Nếu Owner cần lượng thanh khoản USDG lớn hơn 100 USDG (ví dụ để nạp vào pool Uniswap v4 theo Plan 006):

| Phương án | Cách thực hiện | Ưu điểm | Đánh đổi / Hạn chế |
| :--- | :--- | :--- | :--- |
| **Phương án 1 (Khuyến nghị): Faucet Paxos hàng ngày** | Nhận 100 USDG/ngày từ `faucet.paxos.com` | Hoàn toàn miễn phí, 0 KYC, không tài khoản, an toàn tuyệt đối 100%. | Giới hạn 100 USDG mỗi ngày (cần tích lũy qua vài ngày nếu muốn có 300–500 USDG). |
| **Phương án 2: Dùng nhiều địa chỉ ví nhận Faucet rồi gom lại** | Owner dùng 3–5 ví phụ nhận từ Faucet rồi chuyển về 1 ví chính | Nhận được ngay 300–500 USDG trong ngày mà không cần đợi. | Cần thao tác Faucet trên nhiều ví khác nhau (tốn vài phút thao tác thủ công). |
| **Phương án 3: Bridge qua LayerZero từ Ethereum Sepolia** | Nhận USDG Sepolia từ Faucet Paxos (chọn mạng Ethereum Sepolia), sau đó dùng LayerZero bridge sang 46630 | Khai thác được nguồn token từ Sepolia. | Phức tạp hơn: cần testnet ETH Sepolia để trả gas bridge; tốn thời gian cross-chain. |
| **Phương án 4: Swap ETH lấy USDG trên Pool v4 hiện tại** | Dùng ETH testnet (nhận từ faucet Robinhood) swap sang USDG qua Robex UI | Thực hiện được ngay lập tức trên app. | **Không giúp tăng thanh khoản pool:** Swap này chỉ rút USDG ra khỏi pool, làm pool càng cạn USDG hơn (đi ngược lại mục tiêu Plan 006). |

---

## 8. Hướng dẫn tái lập độc lập (Replay Instructions cho Grok QA)

Để Grok tiến hành Independent QA kiểm chứng các phát hiện on-chain trong tài liệu này, chạy script Node.js sau trực tiếp từ terminal:

```bash
node -e "
(async () => {
  const RPC = 'https://rpc.testnet.chain.robinhood.com';
  const USDG = '0x7E955252E15c84f5768B83c41a71F9eba181802F';
  const TEST_CALLER = '0x8e94699c825a15275e720549aCE1D37612dD0d71';

  async function call(to, data) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ from: TEST_CALLER, to, data }, 'latest'] })
    });
    return res.json();
  }

  console.log('=== 1. KIỂM TRA PROXY IMPLEMENTATION SLOT ===');
  const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implRes = await (await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getStorageAt', params: [USDG, implSlot, 'latest'] })
  })).json();
  const impl = '0x' + implRes.result.slice(26);
  console.log('Implementation address:', impl);
  console.log('Khớp 0xF0863D7A29a55d0c4263c11bFac754312ff078DF?', impl.toLowerCase() === '0xf0863d7a29a55d0c4263c11bfac754312ff078df');

  console.log('\n=== 2. KIỂM TRA SUPPLY CONTROL CONTRACT ===');
  // supplyControl() selector: 0x4a254dfe
  const scRes = await call(USDG, '0x4a254dfe');
  const scAddr = '0x' + scRes.result.slice(26);
  console.log('SupplyControl address:', scAddr);
  console.log('Khớp 0x4549bb98c667aab626627c118102c28065e8f54c?', scAddr.toLowerCase() === '0x4549bb98c667aab626627c118102c28065e8f54c');

  console.log('\n=== 3. KIỂM TRA MINT ACCESS CONTROL (ETH_CALL REVERT) ===');
  // mint(address,uint256) selector: 0x40c10f19
  const mintData = '0x40c10f19' + TEST_CALLER.slice(2).padStart(64, '0') + (100000000n).toString(16).padStart(64, '0');
  const mintRes = await call(USDG, mintData);
  console.log('Revert data:', mintRes.error?.data);
  console.log('Chứa selector AccountMissingSupplyControllerRole (0xdcae1750)?', mintRes.error?.data?.startsWith('0xdcae1750'));

  console.log('\n=== 4. KIỂM TRA LAYERZERO OFT WRAPPER PEER ===');
  const OFT = '0x54de1f4c0530b28720b227c501fd245fc7051d33';
  // peers(uint32) selector: 0xbb0b6a53, EID 40161 = 0x9ce1
  const peerData = '0xbb0b6a53' + (40161).toString(16).padStart(64, '0');
  const peerRes = await call(OFT, peerData);
  const peer = '0x' + peerRes.result.slice(26);
  console.log('Peer EID 40161 (Ethereum Sepolia):', peer);
  console.log('Khớp 0xfb0633ec2fac799224b63ecb45bb542ed45e3f94?', peer.toLowerCase() === '0xfb0633ec2fac799224b63ecb45bb542ed45e3f94');
})();
"
```
Kỳ vọng kết quả terminal:
- Implementation address: `0xf0863d7a29a55d0c4263c11bfac754312ff078df` (`true`)
- SupplyControl address: `0x4549bb98c667aab626627c118102c28065e8f54c` (`true`)
- Revert data bắt đầu bằng `0xdcae1750` (`true`)
- LayerZero Sepolia peer: `0xfb0633ec2fac799224b63ecb45bb542ed45e3f94` (`true`)
