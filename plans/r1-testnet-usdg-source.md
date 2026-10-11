# Research R1 — Find a Legitimate Source of Paxos Testnet USDG on 46630

> **Status:** HOÀN THÀNH NGHIÊN CỨU & CẬP NHẬT THEO QA (Docs only).
> **Owner Approval:** Được phê duyệt bởi Owner vào 2026-10-11 16:52 (UTC+7) trên [Issue #29](https://github.com/alidangkile/robex/issues/29).
> **Vai trò:** Builder = **Gemini**, Independent QA = **Claude Code** (chuyển giao tạm thời từ Grok từ 17:15 theo AGENTS.md và Issue #29), Mentor / Final Review = **Claude**, Final Authority = **Owner**.
> **Giới hạn an toàn:** Chỉ sử dụng các lệnh đọc `eth_call`, `eth_getCode`, `eth_getStorageAt`, `eth_getLogs`, Blockscout Explorer API, file cấu hình và tài liệu công khai. Tuyệt đối không gửi giao dịch, không ký ví, không gọi hàm claim/mint, không đăng ký tài khoản, không nhập thông tin cá nhân vào bất kỳ biểu mẫu nào.

---

## 1. Trích dẫn phê duyệt của Owner

Theo quy ước quản trị [AGENTS.md](../AGENTS.md), nhiệm vụ này được bắt đầu sau khi Owner phê duyệt trực tiếp trên [Issue #29](https://github.com/alidangkile/robex/issues/29):
```text
**Owner đã đồng ý lộ trình (2026-10-11 16:52 UTC+7, ghi bởi Claude theo chat).** Builder Gemini, QA Grok. Được bắt đầu ngay.
```
*(Ghi chú: Tại thời điểm 17:15 UTC+7, vai trò Independent QA được bàn giao cho Claude Code theo thông báo trên Issue #29 và AGENTS.md).*

---

## 2. Trả lời dứt khoát 3 câu hỏi cốt lõi

### Câu hỏi 1: Có cách hợp lệ nào để ví của Owner nhận USDG testnet đúng hợp đồng `0x7E955252E15c84f5768B83c41a71F9eba181802F` trên 46630 không?
- **KẾT LUẬN: CÓ [FACT].**
- **Nguồn chính thức:** **Paxos Testnet Faucet** tại địa chỉ: [https://faucet.paxos.com/](https://faucet.paxos.com/)
- **Hợp đồng USDG được ghim trên Faucet:** `0x7E955252E15c84f5768B83c41a71F9eba181802F` trên mạng `Robinhood Chain Testnet` **[FACT]**.
- **Lượng nhận mỗi lần:** **100 USDG** (tương đương `100,000,000` raw units với 6 decimals) theo hằng số giao diện nút bấm `GT=100` (`Send 100 Tokens`) **[FACT - Client UI]**.
- **Giới hạn thời gian (Rate Limit):**
  - Giao diện người dùng ghi rõ: `"Limit 1 request per wallet per day"`, kèm kiểm tra phía client giãn cách tối thiểu 60 giây giữa các lần nhấn **[FACT - Client UI]**.
  - Cơ chế thực thi giới hạn 24 giờ và chống lạm dụng phía server: **[ASSUMPTION - Chưa gửi request thực tế theo quy tắc an toàn (not proven phía server)]**.
- **Điều kiện người dùng:**
  - Form client không yêu cầu KYC, không yêu cầu đăng nhập tài khoản, request payload `POST` không chứa Authorization header **[FACT - Client Bundle]**.
  - Việc server Paxos có cơ chế lọc IP hay điều kiện backend bổ sung: **[ASSUMPTION - Chưa gửi request thực tế (not proven phía server)]**.

### Câu hỏi 2: Hợp đồng USDG đó có hàm mint công khai/faucet không?
- **KẾT LUẬN: KHÔNG [FACT].**
- Hợp đồng `0x7E955252E15c84f5768B83c41a71F9eba181802F` có tồn tại hàm `mint(address account, uint256 amount)` và `increaseSupplyToAddress(uint256 value, address mintToAddress)` trong ABI và bytecode, nhưng hàm này **bị kiểm soát quyền truy cập chặt chẽ** qua hợp đồng `SupplyControl` (`0x4549bb98c667aab626627c118102c28065e8f54c`) tại file `contracts/PaxosTokenClaimableRewards.sol` (dòng 263–298) **[FACT]**.
- Bất kỳ ví EOA thông thường nào gọi `mint(...)` đều revert với custom error selector `0xdcae1750` (`AccountMissingSupplyControllerRole(address)`) **[FACT]**.
- Chỉ có đúng 4 địa chỉ được ủy quyền vai trò `SUPPLY_CONTROLLER_ROLE` mới có quyền mint: gồm 3 địa chỉ EOA (code = 0 bytes) và 1 hợp đồng LayerZero OFT Wrapper `0x54de1f4c0530b28720b227c501fd245fc7051d33` **[FACT]**. Quyền sở hữu của 3 địa chỉ EOA được giả định là thuộc quản trị nội bộ Paxos **[ASSUMPTION - Explorer không gắn nhãn chính thức]**.

### Câu hỏi 3: Có bridge hoặc nguồn nào khác chính thức (Robinhood, Paxos) cấp USDG testnet không?
- **KẾT LUẬN: CÓ [FACT].**
  1. **Nguồn chính thức 1 (Faucet trực tiếp - Khuyến nghị):** `https://faucet.paxos.com/` (cấu hình production hỗ trợ cấp 100 USDG tới mạng Robinhood Chain Testnet 46630 **[FACT - Cấu hình Faucet production]**; việc giao dịch phân phối thực tế từ backend tới ví: **[ASSUMPTION]**).
  2. **Nguồn chính thức 2 (LayerZero OFT Cross-chain Bridge):** Paxos đã triển khai hợp đồng `OFTWrapperUpgradeable` (`0x54de1f4c0530b28720b227c501fd245fc7051d33`) là một `SupplyController` trên 46630, kết nối với USDG trên Ethereum Sepolia (Peer `0xfb0633ec2fac799224b63ecb45bb542ed45e3f94`, EID `40161`) **[FACT]**. Khả năng bridge end-to-end thành công từ Sepolia sang 46630: **[ASSUMPTION - Chưa gửi giao dịch bridge thực tế (not proven)]**.
  3. **Nguồn chính thức 3 (Paxos Sandbox Dashboard):** Nạp qua Sandbox Console tại `https://dashboard.sandbox.paxos.com` hoặc endpoint `POST /v2/sandbox/profiles/{profile_id}/deposit` (cần API Bearer token) **[FACT - Paxos Documentation]**. Nguồn này chỉ nạp vào profile lưu ký Sandbox nội bộ của Paxos; việc có thể rút on-chain trực tiếp ra ví cá nhân trên Robinhood 46630 hay không: **[ASSUMPTION - Chưa chứng minh (not proven cho ví trên 46630)]**.
  4. **Faucet riêng của Robinhood (`https://faucet.testnet.chain.robinhood.com/`):** **KHÔNG phát USDG**; faucet này chỉ phát 0.01 testnet ETH và 5 token cổ phiếu giả lập (TSLA, AMZN, PLTR, NFLX, AMD) mỗi 24 giờ **[FACT]**.

---

## 3. Scope A: Phân tích On-Chain hợp đồng USDG `0x7E955252E15c84f5768B83c41a71F9eba181802F`

### 3.1. Cấu trúc Proxy & Implementation
- **[FACT]** Tra cứu on-chain tại block `132894582`:
  - Mã bytecode tại `0x7E955252E15c84f5768B83c41a71F9eba181802F`: 170 bytes (proxy tối giản ERC-1967).
  - Storage slot EIP-1967 implementation (`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`):
    `0x000000000000000000000000f0863d7a29a55d0c4263c11bfac754312ff078df`
  - Địa chỉ Implementation: `0xF0863D7A29a55d0c4263c11bFac754312ff078DF`.
- **[FACT]** Trạng thái xác minh trên Blockscout Explorer:
  - Proxy `0x7E95...802F` là `ERC1967Proxy`, đã verify mã nguồn, biên dịch bằng Solidity **v0.8.29**.
  - Implementation `0xF086...78DF` là `USDG`, đã verify mã nguồn, biên dịch bằng Solidity **v0.8.28**.

### 3.2. Thuộc tính Token cơ bản qua `eth_call`
- **[FACT]** Kết quả gọi các hàm view tiêu chuẩn tại block `132894582`:
  - `name()`: `"Global Dollar"`
  - `symbol()`: `"USDG"`
  - `decimals()`: `6`
  - `totalSupply()`: `57,301,240,000,000` raw units (= **57,301,240 USDG**).
  - `owner()`: `0x3a5b30d74e90e08f0e576cf9f6f2457e44af38b3`
  - `supplyControl()`: `0x4549bb98c667aab626627c118102c28065e8f54c` (selector `0x4a254dfe`)

### 3.3. Cơ chế kiểm soát Mint & Phân quyền
- **[FACT]** Kiểm tra mã nguồn Solidity đã verify tại `contracts/PaxosTokenClaimableRewards.sol` (dòng 263–298):
  ```solidity
  function increaseSupplyToAddress(uint256 value, address mintToAddress) public virtual returns (bool success) {
      if (_isAddrFrozen(mintToAddress)) revert AddressFrozen();
      supplyControl.canMintToAddress(mintToAddress, value, msg.sender);

      totalSupply_ += value;

      // Update aggregated balance if this address has a payout address
      TokenAccountData memory wallet = _getBalanceData(mintToAddress);
      uint256 newBalance = uint256(wallet.balance) + value;

      // Update wallet with payout group (handles invalid payout cleanup internally)
      uint40 currentTime = uint40(block.timestamp);
      _updateWalletWithPayoutGroup(mintToAddress, wallet, newBalance, currentTime);

      emit SupplyIncreased(mintToAddress, value);
      emit Transfer(address(0), mintToAddress, value);
      return true;
  }

  function mint(address account, uint256 amount) public {
      increaseSupplyToAddress(amount, account);
  }
  ```
  Hàm `increaseSupplyToAddress` và `mint` bắt buộc phải gọi `supplyControl.canMintToAddress(...)` với tham số `msg.sender`.
- **[FACT]** Hợp đồng `supplyControl` (`0x4549bb98c667aab626627c118102c28065e8f54c`):
  - Implementation: `0xC804f2e8AE84f6CFA01d9d33EF107323bf0F9a59` (`SupplyControl`, verified).
  - Hàm `canMintToAddress` có modifier `onlySupplyController(sender)`, nếu sender không có role sẽ revert với lỗi `AccountMissingSupplyControllerRole(address)`.
  - Selector hàm lỗi: `bytes4(keccak256("AccountMissingSupplyControllerRole(address)"))` = `0xdcae1750`.
  - Hàm `getAllSupplyControllerAddresses()` trả về đúng 4 địa chỉ:
    1. `0x7339d29a058a853e7c171c581d53ef14167e5aba` (EOA, code 0 bytes)
    2. `0x54de1f4c0530b28720b227c501fd245fc7051d33` (Hợp đồng `OFTWrapperUpgradeable` của LayerZero)
    3. `0x343fad2bb3a6bfb0cb814effb1a88a5cbd247e4b` (EOA, code 0 bytes)
    4. `0xe3ac6fed0d9eaa2357b3c9266f6962647e61c38e` (EOA, code 0 bytes)
  - **[ASSUMPTION]** Ba địa chỉ EOA trên được giả định là các ví quản trị hoặc hệ thống tự động của Paxos do nắm giữ quyền hạn tối cao đối với cung tiền USDG, nhưng không có nhãn định danh chính thức trên Explorer.

### 3.4. Phân bổ Cung tiền (Top Token Holders)
- **[FACT]** Dữ liệu Blockscout API (`/api/v2/tokens/0x7E955252E15c84f5768B83c41a71F9eba181802F/holders`):
  - Tổng số lượng ví đang nắm giữ: **4,351+ ví**.
  - Top 4 ví nắm giữ lớn nhất (chiếm 88.14% tổng cung):
    1. `0x545FA0D7993929FEf64158F68799E6fAdfbEb983`: `29,199,500 USDG` (50.96%).
    2. `0x54b83d1e6Ee818FFB96D260Fc3E4dfc3Aaf03f79`: `9,998,902 USDG` (17.45%).
    3. `0xbb9b227DDCdaE7A5B01b9B737C8d9659e14a92BF`: `7,197,734 USDG` (12.56%).
    4. `0x7253Aa1F10E7d8fbEeb2437bA92Bf8166a2e4a0F`: `4,108,232 USDG` (7.17%).
- **[ASSUMPTION]** Ví `0x545FA0D7993929FEf64158F68799E6fAdfbEb983` nắm giữ 50.96% tổng cung được suy luận là ví Kho bạc (Treasury) của Paxos trên mạng Robinhood Testnet, tuy nhiên Explorer Blockscout không có nhãn chính thức xác nhận chủ sở hữu.

### 3.5. Bằng chứng On-Chain về Ví Phát tán Faucet (`0xcc96...`)
- **[ASSUMPTION] (Bằng chứng bổ sung từ on-chain transfers):**
  - Trong giai đoạn từ 2026-10-07 đến 2026-10-11, dữ liệu ghi nhận có **154 giao dịch chuyển đúng 100 USDG** (`100,000,000` raw units) trên mạng 46630.
  - Trong đó có tới **143 giao dịch** xuất phát từ cùng một địa chỉ: `0xcc9644EC26A647de0B9b86f1560d5180232f70a3` (lần chuyển gần nhất ghi nhận vào 2026-10-11 01:13 UTC).
  - Địa chỉ `0xcc96...` là ví EOA (code = 0 bytes), nhận nguồn USDG trực tiếp từ giao dịch mint (`increaseSupplyToAddress`) với hai khoản 1,000,000 USDG và 100,000 USDG vào ngày 2026-10-01.
  - Các phát hiện này khớp mạnh mẽ với giả thuyết `0xcc96...` chính là ví phát tán token (faucet dispenser wallet) đang hoạt động thực tế của Paxos Faucet trên Robinhood Testnet 46630. Tuy nhiên, vì Paxos không công bố công khai địa chỉ ví phát, thông tin này được phân loại là giả định có căn cứ on-chain.
  - Nguồn dữ liệu: Blockscout API `/api/v2/tokens/0x7E95.../transfers` và `/api/v2/addresses/0xcc96.../token-transfers`.

---

## 4. Scope B: Khảo sát Nguồn Faucet Chính Thức của Paxos

### 4.1. Tài liệu Hướng dẫn của Paxos
- **[FACT]** Tài liệu nhà phát triển của Paxos tại `https://docs.paxos.com/guides/developer/fund-sandbox-with-test-crypto` (cập nhật 2026-08-27T11:32:19Z, mục ➋ Source Test Assets) khẳng định:
  > *"The Paxos Testnet Faucet (https://faucet.paxos.com) is the recommended source for Paxos-issued test assets including USDP, PAXG, PYUSD, and USDG across supported networks."*
- **[FACT]** Trong bảng "Public Faucets by Network" của trang tài liệu trên:
  - Hàng mạng `Robinhood Chain` liệt kê vòi nước là `https://faucet.testnet.chain.robinhood.com` (phục vụ lấy native testnet ETH).
  - Trang tài liệu không liệt kê trực tiếp cặp mạng Robinhood với USDG và không chứa địa chỉ contract `0x7E95...802F`. Việc hỗ trợ mạng Robinhood cho token USDG được cấu hình và thực thi trực tiếp tại ứng dụng Faucet production.

### 4.2. Bằng chứng Trích xuất từ Production Config & Client Bundle của Paxos Faucet
- **[FACT]** Tệp cấu hình production chính thức tải về từ `https://faucet.paxos.com/features.json`:
  ```json
  {
    "TOKENS_CONFIG": {
      "USDG": {
        "networks": ["SOLANA", "ETHEREUM", "XLAYER", "ARBITRUM_ONE", "INK", "ROBINHOOD", "MANTLE"]
      },
      "PYUSD": {
        "networks": ["SOLANA", "ETHEREUM", "ARBITRUM_ONE", "STELLAR", "XLAYER", "INK", "POLYGON_POS", "STABLE"]
      },
      "USDP": {
        "networks": ["SOLANA", "ETHEREUM"]
      }
    },
    "API_DOMAIN": "https://api.sandbox.paxos.com"
  }
  ```
  Xác nhận mạng `ROBINHOOD` nằm trong danh sách các mạng được hỗ trợ chính thức cho USDG.
- **[FACT]** Kiểm tra tệp Javascript thực thi tại `https://faucet.paxos.com/assets/index-Cnwrg2YM.js` (541,479 bytes):
  1. **Định nghĩa Mạng Robinhood:**
     ```javascript
     ROBINHOOD: {
       name: 'Robinhood Chain Testnet',
       testnetLink: 'https://explorer.testnet.chain.robinhood.com/address/[address]',
       iconName: 'robinhood',
       customClass: 'w-[22px]'
     }
     ```
  2. **Địa chỉ Hợp đồng USDG được Ghim (Pinned Contract):**
     ```javascript
     ['ROBINHOOD_USDG', 'https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F']
     ```
     Khớp chính xác 100% với địa chỉ USDG mà Robex đang sử dụng trên mạng 46630!
  3. **Số lượng cấp phát (Amount):**
     Hằng số hiển thị nút bấm: `GT = 100` → `Send 100 Tokens` (tương ứng **100 USDG** mỗi lượt) **[FACT - Client UI]**.
  4. **Giới hạn thời gian (Rate Limit):**
     Dòng chữ hiển thị trên giao diện: `"Limit 1 request per wallet per day"`. Client có logic chặn bấm lại nếu cách lần bấm trước dưới 60 giây (`diff(e, 'second') < 60`) **[FACT - Client UI]**.
  5. **Endpoint Backend Phục vụ Faucet:**
     Trong bundle, hàm gọi tới `${VT()}/v2/treasury/faucet/transfers` với `VT() = globalThis.config.API_DOMAIN`, lấy từ `features.json` là `https://api.sandbox.paxos.com`.
     Endpoint backend thực tế là:
     `POST https://api.sandbox.paxos.com/v2/treasury/faucet/transfers`
     Payload gửi đi:
     ```json
     {
       "token": "USDG",
       "network": "ROBINHOOD",
       "address": "<wallet_address>"
     }
     ```
  6. **Quy trình Xác thực & Phí:**
     - Client không yêu cầu KYC, không có trường nhập mật khẩu, request không đính kèm Authorization header **[FACT - Client Bundle]**.
     - Giới hạn rate limit 24h và các điều kiện chặn gian lận phía backend: **[ASSUMPTION - Chưa gửi request thực tế theo quy tắc an toàn (not proven phía server)]**.

---

## 5. Scope C: Các nguồn khác & Cầu nối LayerZero OFT

### 5.1. Cầu nối LayerZero Omnichain Fungible Token (OFT)
- **[FACT]** Địa chỉ `0x54de1f4c0530b28720b227c501fd245fc7051d33` là một `SupplyController` của USDG trên 46630.
- **[FACT]** Hợp đồng này là `OFTWrapperUpgradeable` của LayerZero (Implementation: `0x878cb5e363e9e8d9781656540f25845b694fdabe`, verified tại slot EIP-1967 `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`):
  - `paxosToken()`: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
  - `endpoint()`: `0x3acaaf60502791d199a5a5f0b173d78229ebfe32` (LayerZero EndpointV2 trên 46630, EID 40451)
  - Peer cho Endpoint ID `40161` (Ethereum Sepolia):
    `0x000000000000000000000000fb0633ec2fac799224b63ecb45bb542ed45e3f94`
- **[ASSUMPTION]** Cơ chế hoạt động: Khi người dùng chuyển USDG từ Ethereum Sepolia sang Robinhood Testnet qua LayerZero, hợp đồng này nhận tin nhắn và gọi mint nội bộ trên 46630. Tuy nhiên, việc bridge thực tế từ Sepolia sang 46630 **chưa được kiểm chứng qua giao dịch on-chain (not proven)**.

### 5.2. Paxos Developer Sandbox Dashboard
- **[FACT]** Paxos cung cấp môi trường Sandbox Console tại `https://dashboard.sandbox.paxos.com`. Tài liệu "Create Sandbox Deposit" của Paxos chỉ định endpoint API là:
  `POST https://api.paxos.com/v2/sandbox/profiles/{profile_id}/deposit` (yêu cầu Bearer token).
- Nút "Fund" hoặc API này phục vụ nạp số dư giả lập vào **profile/tài khoản lưu ký nội bộ Paxos Sandbox** (B2B Sandbox profile).
- **[ASSUMPTION - Chưa chứng minh (not proven cho ví trên 46630)]**: Khả năng rút số dư từ profile Sandbox nội bộ này ra trực tiếp ví cá nhân EVM trên mạng Robinhood 46630 là chưa có tài liệu hay bằng chứng thực tế xác nhận.

### 5.3. Faucet riêng của Robinhood (`faucet.testnet.chain.robinhood.com`)
- **[FACT]** Faucet của Robinhood Chain tại `https://faucet.testnet.chain.robinhood.com/` phân phối 0.01 testnet ETH và 5 token của mỗi mã cổ phiếu thử nghiệm: **TSLA, AMZN, PLTR, NFLX, AMD** mỗi 24 giờ. Faucet này **không hỗ trợ và không phân phối USDG**.

---

## 6. Hướng dẫn từng bước để Owner tự nhận 100 USDG testnet

Vì việc nhận token yêu cầu nhập địa chỉ ví cá nhân của Owner và theo quy tắc an toàn Builder tuyệt đối không nhập thông tin cá nhân hay tương tác thay Owner, Owner có thể tự thực hiện theo các bước sau:

### Các bước thao tác (Mất khoảng 1 phút):
1. **Bước 1:** Mở trình duyệt web và truy cập vào trang Faucet chính thức của Paxos:
   👉 **[https://faucet.paxos.com/](https://faucet.paxos.com/)**
2. **Bước 2 (Chọn Token):** Ở danh sách biểu tượng token phía trên, bấm chọn **USDG** (Global Dollar).
3. **Bước 3 (Chọn Mạng):** Trong ô thả xuống **Network**, chọn **Robinhood Chain Testnet** (biểu tượng cánh cung màu xanh/đen của Robinhood).
   *(Giao diện sẽ hiển thị link "View USDG smart contract address" trỏ đúng về `0x7E95...802F` trên Blockscout).*
4. **Bước 4 (Dán địa chỉ ví):** Trong ô **Send to (Wallet Address)**, dán địa chỉ ví EVM của Owner (ví dụ ví MetaMask, OKX hoặc Coinbase Wallet đang dùng để test Robex).
5. **Bước 5 (Nhận token):** Bấm nút **"Send 100 Tokens"**.
6. **Bước 6 (Kiểm tra kết quả):** Hệ thống sẽ hiện thông báo thành công kèm link mở trang chi tiết địa chỉ ví của Owner trên Explorer:
   `https://explorer.testnet.chain.robinhood.com/address/<địa_chỉ_ví_của_Owner>`
   Đợi khoảng 1–2 phút để mạng 46630 xác nhận giao dịch và kiểm tra số dư USDG trong ví.

---

## 7. Các phương án thay thế & Đánh đổi (Trade-offs)

Nếu Owner cần lượng thanh khoản USDG cho các thử nghiệm tiếp theo (ví dụ nạp thanh khoản vào pool Uniswap v4 theo Plan 006):

| Phương án | Cách thực hiện | Ưu điểm | Đánh đổi / Hạn chế |
| :--- | :--- | :--- | :--- |
| **Phương án 1 (Khuyến nghị): Faucet Paxos định kỳ hàng ngày** | Dùng 1 ví nhận 100 USDG/ngày từ `faucet.paxos.com` | Tuân thủ đúng quy định rate limit của bên phát hành, không cần tài khoản trên UI, giao dịch do backend chi trả phí gas [ASSUMPTION]. | Giới hạn 100 USDG mỗi 24h (cần tích lũy qua vài ngày nếu muốn có 300–500 USDG). |
| **Phương án 2: Bridge qua LayerZero từ Ethereum Sepolia** | Nhận USDG Sepolia từ Faucet Paxos (chọn mạng Sepolia), sau đó dùng LayerZero bridge sang 46630 | Khai thác được nguồn token USDG dồi dào trên Sepolia. | Phức tạp hơn: cần testnet ETH Sepolia để trả gas bridge; cơ chế bridge chưa được kiểm chứng end-to-end trên testnet. |
| **Phương án 3: Liên hệ trực tiếp với đối tác Paxos** | Đăng ký tài khoản đối tác doanh nghiệp trên Paxos Developer Sandbox để yêu cầu cấp hạn mức lớn | Có thể được cấp lượng token USDG lớn phục vụ thử nghiệm chính thức. | Yêu cầu thủ tục đăng ký tài khoản doanh nghiệp B2B với Paxos; việc rút token on-chain ra 46630 chưa được chứng minh. |
| **Phương án 4: Swap ETH lấy USDG trên Pool v4 hiện tại** | Dùng ETH testnet (nhận từ faucet Robinhood) swap sang USDG qua Robex UI | Thực hiện được ngay lập tức trên app Robex. | **Không giúp tăng thanh khoản pool:** Swap này rút USDG ra khỏi pool, làm pool càng cạn USDG hơn (đi ngược lại mục tiêu Plan 006). |

*(Ghi chú: Đã loại bỏ phương án sử dụng nhiều ví phụ để lách giới hạn rate limit 24h của bên phát hành theo khuyến nghị C-01, nhằm tuân thủ tinh thần sử dụng dịch vụ và phòng tránh rủi ro bị chặn).*

---

## 8. Hướng dẫn tái lập độc lập (Replay Instructions cho Claude Code QA)

Để Claude Code tiến hành Independent QA kiểm chứng các phát hiện on-chain trong tài liệu này, chạy script Node.js sau trực tiếp từ terminal:

```bash
node -e "
(async () => {
  const RPC = 'https://rpc.testnet.chain.robinhood.com';
  const USDG = '0x7E955252E15c84f5768B83c41a71F9eba181802F';

  async function call(to, data) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
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

  console.log('\n=== 3. KIỂM TRA LAYERZERO OFT WRAPPER PEER ===');
  const OFT = '0x54de1f4c0530b28720b227c501fd245fc7051d33';
  // peers(uint32) selector: 0xbb0b6a53, EID 40161 = 0x9ce1
  const peerData = '0xbb0b6a53' + (40161).toString(16).padStart(64, '0');
  const peerRes = await call(OFT, peerData);
  const peer = '0x' + peerRes.result.slice(26);
  console.log('Peer EID 40161 (Ethereum Sepolia):', peer);
  console.log('Khớp 0xfb0633ec2fac799224b63ecb45bb542ed45e3f94?', peer.toLowerCase() === '0xfb0633ec2fac799224b63ecb45bb542ed45e3f94');

  console.log('\n=== 4. KIỂM TRA OFT WRAPPER IMPLEMENTATION SLOT ===');
  const oftImplRes = await (await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getStorageAt', params: [OFT, implSlot, 'latest'] })
  })).json();
  const oftImpl = '0x' + oftImplRes.result.slice(26);
  console.log('OFT Implementation address:', oftImpl);
  console.log('Khớp 0x878cb5e363e9e8d9781656540f25845b694fdabe?', oftImpl.toLowerCase() === '0x878cb5e363e9e8d9781656540f25845b694fdabe');
})();
"
```
Kỳ vọng kết quả terminal:
- Implementation address: `0xf0863d7a29a55d0c4263c11bfac754312ff078df` (`true`)
- SupplyControl address: `0x4549bb98c667aab626627c118102c28065e8f54c` (`true`)
- LayerZero Sepolia peer: `0xfb0633ec2fac799224b63ecb45bb542ed45e3f94` (`true`)
- OFT Implementation address: `0x878cb5e363e9e8d9781656540f25845b694fdabe` (`true`)
