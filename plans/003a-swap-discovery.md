# Plan 003A — Swap Infrastructure Discovery

Status: research spec only.

This document records what was read on Robinhood Chain Testnet. It does not change network config, quote code, or on-chain state.

Base: `origin/main` at `22b7e38c159f6aec762810f1044e81798240a04e` (`feat(home): add lazy scroll-linked 3D hero`).

Reads were taken on 2026-10-08. The testnet head during the canonical pair scan was block `130839864`, timestamp `1791425916` (`0x6ac6fd7c`). No `eth_sendTransaction` was submitted.

## 1. Goal

Verify the infrastructure required for a real Swap on Robinhood Chain Testnet (chain ID `46630`), and name one token pair that Swap V1 can quote.

## 2. Why this plan exists

Plan 001 quotes through `ConstantProductSimulationAdapter` (`SIMULATED_FOUNDATION`). Plan 002 connects a wallet and reads network state. A real quote needs a protocol, a quoter, and a pool that exist on chain `46630`.

```text
Foundation
  ↓
Real wallet + network state          Plan 002
  ↓
Swap infrastructure discovery        Plan 003A  ← this spec
  ↓
Read-only quote on one proven pool   Plan 003B, only if section 14 is met
  ↓
Transaction execution                later plan
```

## 3. Scope

- Compare repo network config with Robinhood's published endpoints and with live RPC reads.
- Identify the liquidity protocol, router, quoter, tokens, and pools that have bytecode on testnet.
- Prove addresses with `eth_getCode`, `eth_call`, `eth_getLogs`, or the testnet explorer. Mainnet deployment files are a candidate list only.
- Choose one Swap V1 pair.
- Record evidence, limits, risks, and the conditions for Plan 003B.

## 4. Non-goals

- No Swap UI, quote adapter, or calldata.
- No network-config edit and no `.env` edit.
- No transaction, approval, liquidity add, or faucet claim.
- No mainnet activation.
- No change to `NetworkContracts`. The type still has optional `multicall`, `routerPlaceholder`, and `weth` only.

## 5. Network config audit

Sources for the official values:

- https://docs.robinhood.com/chain/connecting
- https://docs.robinhood.com/chain/protocol-contracts
- `eth_chainId` on `https://rpc.testnet.chain.robinhood.com` returned `0xb626` (`46630`).
- `eth_chainId` on `https://rpc.mainnet.chain.robinhood.com` returned `0x1237` (`4663`).

Repo values below are the defaults in `packages/config/src/networks/robinhood-testnet.ts`, `packages/config/src/networks/robinhood-mainnet.ts`, and `.env.example`.

### 5.1 Values that match

| Field | Repo | Evidence |
| --- | --- | --- |
| Testnet chain ID | `46630` | Docs and `eth_chainId` `0xb626` |
| Testnet name | `Robinhood Chain Testnet` | Docs use the same name |
| Native symbol / decimals | `ETH` / `18` | Docs: ETH gas token |
| Testnet is the default | `isTestnet: true`; mainnet throws unless `ALLOW_MAINNET=true` | `getActiveNetworkConfig` |
| Active quote chain | Quote service rejects a chain ID other than the active testnet | `apps/api/src/services/quote.service.ts` |

`nativeCurrency.name` is the local label `Testnet Ether`. The docs specify the symbol `ETH`. The label is not a chain-ID or RPC field.

### 5.2 Wrong values

| Field | Repo default | Official value | What this research observed |
| --- | --- | --- | --- |
| Testnet RPC | `https://rpc.testnet.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` | TLS handshake failure (`ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE`). The official URL answered JSON-RPC. |
| Testnet RPC fallback | `https://rpc-backup.testnet.robinhood.com` | Public fallback in the docs is the delayed sequencer feed, not this host | Same TLS handshake failure. The host is absent from the public-endpoint table. |
| Testnet explorer | `https://explorer.testnet.robinhood.com` | `https://explorer.testnet.chain.robinhood.com` | Same TLS handshake failure. The official explorer API returned contract metadata. |
| Mainnet chain ID | `46600` | `4663` | `eth_chainId` `0x1237` |
| Mainnet RPC | `https://rpc.robinhood.com` | `https://rpc.mainnet.chain.robinhood.com` | TLS handshake failure. The official URL answered `eth_chainId`. |
| Mainnet explorer | `https://explorer.robinhood.com` | `https://robinhoodchain.blockscout.com` | Docs name the Blockscout host |

`packages/config/test/network.test.ts` expects `isSupportedChain(46600)` and expects `DEFAULT_CHAIN_ID=46600` without `ALLOW_MAINNET` to throw. Replacing `46600` with `4663` is a separate change. This plan does not do it.

The docs also list provider RPCs (Alchemy, Chainstack, QuickNode, and others). Those need an account. The public Robinhood URLs above are documented as rate-limited.

### 5.3 Placeholder contract fields

`eth_getCode` on testnet, at the same head:

| Field | Repo address | Bytecode | Address that does have code |
| --- | --- | --- | --- |
| `contracts.multicall` | `0x1234567890123456789012345678901234567890` | 0 | Official L2 multicall `0xa432504b6F04Cafe775b09D8AA92e8dbe41Ec7a8`, 3339 bytes |
| `contracts.routerPlaceholder` | `0x0000000000000000000000000000000000000001` | 0 | No execution router is approved in this spec. See section 8.4. |
| `contracts.weth` | `0x0000000000000000000000000000000000000002` | 0 | Official testnet L2 WETH `0x7943e237c7F95DA44E0301572D358911207852Fa`, 2202 bytes |

`validateNetworkConfig` checks chain ID, name, 18 decimals, and that `rpcUrl` and `explorerUrl` are non-empty strings. A placeholder address and an unreachable host both pass that check.

### 5.4 Block time

`blockTimeMs` is `2000` on both network configs.

Sample: blocks `130839844` through `130839864` (20 intervals) spanned 2 seconds. Average `100 ms`. This is one sample on a public RPC, not a protocol constant. `2000` does not describe that sample.

## 6. What Robex quotes today

`apps/api/src/adapters/constant-product-simulation-adapter.ts` is a local constant-product formula with a 0.30% fee factor (`997/1000`). Its source type is `SIMULATED_FOUNDATION`. The file states that it is not an external protocol claim. Plan 003A leaves that adapter in place.

There is no `ethers`, `viem`, or quoter dependency on `origin/main`. `NetworkContracts` has no field for a pool manager, quoter, state view, or permit contract.

## 7. Evidence methods

| Method | Use |
| --- | --- |
| `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber` | Chain identity and the block-time sample |
| `eth_getCode` | Bytecode present or absent |
| `eth_call` | ERC-20 metadata, `poolManager()`, `WETH9()`, `permit2()`, `StateView.getSlot0`, `StateView.getLiquidity`, `V4Quoter.quoteExactInputSingle` |
| `eth_getLogs` | Uniswap v4 `Initialize` events on one PoolManager |
| Explorer `GET /api/v2/smart-contracts/{address}` | Name, verification flag, compiler, file |
| GitHub contents API | Whether Uniswap publishes a `46630` deployment file |

`eth_getLogs` on this public RPC rejects a range above 10,000,000 blocks (`-32602`). The canonical pair scan used 3,000,000-block chunks from block 0 through `130839864`.

## 8. Protocol on testnet

### 8.1 Uniswap publishes chain 4663 only

`GET https://api.github.com/repos/Uniswap/contracts/contents/deployments` on 2026-10-08 lists `4663.md` and does not list `46630.md`.

`deployments/4663.md` is the Robinhood Chain mainnet manifest (chain ID `4663`). The same document's current Universal Router is `0x204FAca1764B154221e35c0d20aBb3c525710498`. An older May 2026 router in that history is `0x248a454ac3584c2a48d1fcb28d3910a6b6ea00af`. Both have **0 bytes** on testnet. They are mainnet records.

Addresses from that manifest were checked on testnet individually. Same-address presence is evidence. Absence of a file named `46630.md` is evidence that Uniswap does not publish a testnet manifest. It is not, by itself, proof that no contract exists.

### 8.2 Present on testnet and linked to one PoolManager

| Contract | Address | Code bytes | Link proved this session |
| --- | --- | --- | --- |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | 24009 | Explorer: verified `PoolManager.sol`, compiler `v0.8.26+commit.8a97fa7a`. This is the address in the 4663 manifest. |
| StateView | `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` | 3531 | `poolManager()` returns the PoolManager above |
| V4Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` | 6118 | `poolManager()` returns the same PoolManager. Explorer name `V4Quoter`, file `src/lens/V4Quoter.sol`, compiler `v0.8.26+commit.8a97fa7a`, ABI contains `quoteExactInputSingle`. `is_verified` is **false**. |
| PositionManager | `0x58daec3116aae6D93017bAAea7749052E8a04fA7` | 23877 | Explorer: verified `PositionManager.sol`. `poolManager()` returns the same PoolManager. `permit2()` returns canonical Permit2. |
| PositionDescriptor | `0x9639443158E8C5efa35Bd45287bf2EFfd3D8dC06` | 752 | Bytecode only. Not decoded. |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9152 | Explorer: verified `Permit2.sol`, compiler `v0.8.17+commit.8df45f5f`. Same address is in the Robinhood L2 misc table for testnet and mainnet. |

`PositionManager.WETH9()` returns `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`. That is the **mainnet** L2 WETH in the Robinhood protocol-contract table. `eth_getCode` on testnet is 0 bytes. Wrap and unwrap through this PositionManager field have no contract behind them. Native ETH in v4 is `address(0)` and does not use that field.

Explorer search shows other verified contracts named PoolManager. Identity in this spec comes from the address plus `poolManager()` / constructor linkage, not from the name.

### 8.3 Absent on testnet at the 4663 manifest addresses

`eth_getCode` returned 0 for:

| Manifest role | Address |
| --- | --- |
| Current Universal Router | `0x204FAca1764B154221e35c0d20aBb3c525710498` |
| May 2026 Universal Router | `0x248a454ac3584c2a48d1fcb28d3910a6b6ea00af` |
| SwapRouter02 | `0xcaf681a66d020601342297493863e78c959e5cb2` |
| V2 factory | `0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f` |
| V2 router | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` |
| V3 factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
| QuoterV2 | `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` |
| V3 NonfungiblePositionManager | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| Mainnet L2 WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

v2 and v3 at these addresses are not deployed on testnet. This does not prove that some other v2 or v3 factory is absent. No other factory was promoted, because no official testnet manifest names one.

### 8.4 Older router bytecode

`0x8876789976decbfcbbbe364623c63652db8c0904` has 24546 bytes on testnet. A case-insensitive scan of that runtime bytecode found:

- PoolManager `8366a39cc670b4001a1121b8f6a443a643e40951`
- Permit2 `000000000022d473030f116ddee9f6b43ac78ba3`
- mainnet WETH `0bd7d308f8e1639fab988df18a8011f41eacad73`

It did not find official testnet WETH `7943e237c7f95da44e0301572d358911207852fa`.

This address is not the current router in `deployments/4663.md`. Source verification was not established. Plan 003B does not get an execution router from this finding. The embedded WETH is the empty mainnet address.

## 9. Tokens that are safe to name

### 9.1 Native ETH

Currency `0x0000000000000000000000000000000000000000`. Gas token. Symbol `ETH`, 18 decimals, per the Robinhood connecting doc and the repo's native-currency field.

### 9.2 Official testnet L2 WETH

| Field | Value |
| --- | --- |
| Address | `0x7943e237c7F95DA44E0301572D358911207852Fa` |
| Source | Robinhood protocol-contracts, testnet L2 WETH row |
| Explorer | Verified `TransparentUpgradeableProxy`, compiler `v0.8.16+commit.07a7930e` |
| `eth_call` | name `WETH`, symbol `WETH`, decimals `18` |
| `totalSupply` | `2189348490824983812910` (about 2189.35 WETH) |
| PoolManager `balanceOf` | `125378515229959338448` (about 125.38 WETH) |

The PoolManager balance is custody across every pool in that singleton. It is not the reserve of one pool.

A second contract, not the official bridge WETH, also uses the symbol WETH on this chain. It is not an allowlist candidate. Official WETH is the proxy above.

### 9.3 Paxos testnet USDG

| Field | Value |
| --- | --- |
| Address | `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| Source | https://docs.paxos.com/guides/stablecoin/usdg/testnet, row "Robinhood Testnet" |
| Code | 170 bytes (proxy-sized) |
| `eth_call` | name `Global Dollar`, symbol `USDG`, decimals `6` |
| `totalSupply` | `57301240000000` (57,301,240 USDG) |
| PoolManager `balanceOf` | `65668327715` (65,668.327715 USDG) |

Paxos states that testnet tokens have no value. The PoolManager balance is singleton custody, not one pool.

### 9.4 Tokens that are not the V1 allowlist

The broad `Initialize` scan saw pools whose other currency used stock-ticker symbols. Those addresses are not listed here.

- Robinhood's stock-token documentation describes mainnet assets. It was not used as a testnet token list.
- The public faucet page was not used as an address source.
- Explorer name search returns many contracts with the same symbol.

Swap V1 allowlist is native ETH, official testnet WETH, and the Paxos USDG address above.

## 10. Pools

Pool search was `Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)` on PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`, blocks `0` through `130839864`, chunks of 3,000,000. Topic order is currency0, then currency1, after the pool id. v4 sorts the two currencies by address, so each pair was queried in that order only.

`StateView.getSlot0(bytes32)` returns `sqrtPriceX96`, `tick`, `protocolFee`, `lpFee`. Pool id was recomputed as `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))` and matched the log topic.

### 10.1 Official WETH / USDG

`PAIR_COUNT WETH/USDG 0`.

No Initialize event for official WETH `0x7943…` against Paxos USDG `0x7E95…` exists on this PoolManager through block `130839864`.

### 10.2 Native ETH / USDG

Two pools.

| | Selected pool | Rejected pool |
| --- | --- | --- |
| Pool id | `0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669` | `0x3bb9f1c58dbfc63341951eded3ed55bbac2e1ae04fd3cf86afc4be6e0a64047f` |
| currency0 | native ETH | native ETH |
| currency1 | Paxos USDG | Paxos USDG |
| fee | `3000` (static 0.30%) | `8388608` (`0x800000`, dynamic-fee flag) |
| tickSpacing | `60` | `60` |
| hooks | `0x0000000000000000000000000000000000000000` | `0x089dfb78d67963d5461c9a009529b6d8c9c76880` |
| Initialize block | `129486568` | `121529024` |
| Initialize tx | `0x30c631988a1fde12b69bebb54e24c3a6dc86eb18d625505915f87ee120307dbc` | `0x2f1cc38cf97809c355f57b177164aa1a647ad0f5c90ab8f8168eebf6be160173` |
| Recomputed id | matches | not rechecked |
| sqrtPriceX96 | `3759471235661676040702346` | not re-read in the final pass |
| tick | `-199127` | |
| protocolFee | `0` | |
| lpFee | `3000` | |
| liquidity | `103923048454` | `0` at the earlier StateView read, head `130838168` |

Human spot price from `sqrtPriceX96`, adjusting 18-decimal ETH against 6-decimal USDG:

`2251.616202441057` USDG per 1 ETH.

That figure is the spot at the read. It is not a reserve.

### 10.3 Quote proof for the selected pool

`eth_call` to V4Quoter `quoteExactInputSingle` at the head above.

| Input | Value |
| --- | --- |
| poolKey | native ETH, Paxos USDG, fee `3000`, tickSpacing `60`, hooks `address(0)` |
| zeroForOne | `true` (ETH → USDG) |
| exactAmount | `100000000000000` wei (`0.0001` ETH) |
| hookData | empty |

Return data:

| Word | Value |
| --- | --- |
| amountOut | `214711` (0.214711 USDG) |
| gasEstimate | `42376` (the quoter's returned estimate, not a separate `eth_estimateGas`) |

Fee-adjusted spot for the same input, with no price impact: `0.0001 * 2251.616202441057 * 0.997 = 0.224486135383` USDG (`224486` raw units after integer truncation).

The quote `214711` is about 4.35% below that fee-adjusted spot. The gap is price impact inside the active liquidity. `0.0001` ETH is already large relative to this pool.

`getLiquidity` is the in-range liquidity only. Token amounts in other ticks were not read. A larger swap can cross into ticks that have no liquidity.

### 10.4 Native ETH / official WETH

Seven Initialize events. They are a wrap-like market, not the V1 pair. Official WETH already exposes deposit and withdraw on its own contract. The hookless 0.30% pool was read so it is not confused with the USDG pool:

| Field | Value |
| --- | --- |
| Pool id | `0xa5ed3a24efad9e9409501721d793e9f144664962d5675aaa946948ce13051551` |
| fee / tickSpacing / hooks | `3000` / `60` / `address(0)` |
| Initialize block / tx | `115018544` / `0xa76a1f943c9489f9845558179bbaa1febc6d9ac5be85de5d486b9e7be5d8a69a` |
| sqrtPriceX96 / tick | `78427878044423283678457647807` / `-204` |
| protocolFee / lpFee | `0` / `3000` |
| liquidity | `495000000000000` |
| Spot | about `0.9799` WETH per 1 ETH |

The other six use a hook (`0xcef7e7d49a75688a5ed19c9684c797a782de40c0` at block `93471585`) or a fee other than the standard 0.30% tier (`500`, `5555`, `32250`, `34374`, `43126`). Their reserves were not promoted.

## 11. Swap V1 pair

**Native ETH / Paxos USDG**, one pool:

```text
PoolManager   0x8366a39CC670B4001A1121B8F6A443A643e40951
poolId        0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669
currency0     0x0000000000000000000000000000000000000000   native ETH
currency1     0x7E955252E15c84f5768B83c41a71F9eba181802F   USDG
fee           3000
tickSpacing   60
hooks         0x0000000000000000000000000000000000000000
```

Why this pair:

- Both assets have a primary source: ETH is the chain gas token, USDG is the Paxos Robinhood Testnet row.
- The pool is hookless, so the quote is standard v4 math.
- Pool id recomputation matches the Initialize topic.
- `V4Quoter.quoteExactInputSingle` returned a finite amountOut for `0.0001` ETH, and that amount sits near the StateView spot after the 0.30% fee and a visible impact.
- The path does not read `PositionManager.WETH9()` and does not need the empty mainnet WETH.

The pool is thin. Swap V1 is a quote target for this key. It is not a deep market. See section 15 for the size cap.

ETH/WETH and WETH/TSLA-style pools were observed and were not selected. There is no official WETH/USDG pool to select.

## 12. Limitations

- Public RPC is rate-limited. A wider scan in this session received HTTP `429` and `log query timed out` inside blocks `90000000`–`98999999` for some non-canonical token filters. The three pair counts in section 10 were a second, complete scan and did not hit those errors.
- `eth_getLogs` cannot span more than 10,000,000 blocks.
- One 20-block timing sample. Head and pool state move.
- V4Quoter metadata has a compiler, file, and ABI, and `is_verified` is false.
- In-range liquidity is known. Liquidity outside the current tick is not.
- Singleton `balanceOf` is not a pool reserve.
- The older router bytecode includes the PoolManager address. That is linkage evidence for a later execution plan. It is not a tested `execute` call. No execute call was made.
- Stock-ticker tokens were not allowlisted.
- Mainnet chain ID `46600` remains in the repo. This spec does not change it.
- `validateNetworkConfig` still accepts the placeholder addresses and the unreachable default hosts.

## 13. Risks

- Same symbol, different contract. A USDG or WETH address chosen by name can be a different token. 003B must pin the addresses in section 9.
- Many verified contracts share the names PoolManager, UniversalRouter, and V4Quoter. Selecting by explorer name is unsafe.
- Copying the rest of `deployments/4663.md` onto testnet points at empty code (section 8.3) or at mainnet WETH inside PositionManager.
- The embedded WETH in PositionManager and in the older router bytecode has no code on testnet. A wrap command to that address cannot succeed.
- Hooked pools and dynamic fees (`fee` high bit `0x800000`) do not match a static 0.30% quote.
- The selected pool moves about 4.35% on a `0.0001` ETH quote. A user-sized trade can exhaust in-range liquidity.
- Placeholder config currently validates. A future change that treats `routerPlaceholder` as a live router would call `0x…0001`.
- `blockTimeMs = 2000` will mis-state confirmation time if a later feature waits on it.
- Public RPC rate limits will make production indexing fail if it scans from block 0.
- Paxos testnet USDG has no value. Display must not imply a redeemable dollar balance.
- Official stock tokens and any testnet ticker tokens are a different product and a different legal surface. They stay out of V1.

## 14. Conditions to implement 003B

003B may start as a **read-only quote** for the single pool in section 11. All of the following are required.

1. Stay on chain `46630`. Do not set `ALLOW_MAINNET`. Do not retarget the client at chain `4663`.
2. Keep `ConstantProductSimulationAdapter` until a test shows the new adapter calling `V4Quoter.quoteExactInputSingle` for this exact pool key. The quote source must not stay `SIMULATED_FOUNDATION`.
3. Reproduce, in that test or in a recorded fixture, an ETH → USDG quote whose pool key is section 11. The discovery result (`0.0001` ETH → `214711` USDG raw) is a point-in-time measurement. The test must read a fresh `getSlot0` / `getLiquidity` or fail closed when the pool has no liquidity. It must not hard-code `214711` as a permanent expected output.
4. Pin the allowlist to native ETH `address(0)`, official WETH `0x7943e237c7F95DA44E0301572D358911207852Fa`, and Paxos USDG `0x7E955252E15c84f5768B83c41a71F9eba181802F`. Reject every other address, including same-symbol contracts.
5. Quote this pool only: fee `3000`, tickSpacing `60`, hooks `address(0)`, pool id `0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669`. Refuse a key whose recomputed id differs. Refuse hooks other than `address(0)`. Refuse the dynamic-fee ETH/USDG pool.
6. Show price impact. Cap the quoted input so it stays inside the active range, or refuse the quote. `0.0001` ETH already moved the price by about 4.35% at this read. Do not present the pool as deep liquidity.
7. Extend `NetworkContracts` before storing `poolManager`, `quoter`, or `stateView`. Do not write those addresses into `routerPlaceholder`.
8. Any replacement of `contracts.weth` or `contracts.multicall` uses the official testnet addresses in section 5.3, after a new `eth_getCode` check. Do not replace them with mainnet addresses.
9. Do not send a swap, approval, or liquidity transaction in 003B. Execution needs a later plan.
10. Do not call `PositionManager.WETH9()` or a Universal Router wrap/unwrap path. Both known router candidates that embed a WETH address embed `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, which has no code on testnet.
11. Fixing mainnet chain ID `46600` → `4663`, the RPC hosts, and `blockTimeMs` is a config change with test updates (`network.test.ts` currently expects `46600`). It can ship beside 003B only as its own scoped change. It is not required to quote the pool, and it is not authorized by this spec alone.
12. Use the official public RPC or a provider RPC. The repo default `https://rpc.testnet.robinhood.com` failed TLS in this research. The public endpoint is rate-limited. Log queries must stay within 10,000,000 blocks.

Execution, whenever a later plan starts, additionally needs a router whose bytecode and a successful quoted-call simulation are tied to this PoolManager, and whose WETH field is either unused or equal to official testnet WETH. That router is not proven here.

## 15. Acceptance for 003A

- This file is the only product change.
- Network config and Swap code are unchanged.
- Every address in sections 8 and 9 was checked with `eth_getCode` or comes from the Robinhood or Paxos page cited next to it.
- The recommended pair is one hookless pool, with a matching pool id, a StateView read, and one successful quoter `eth_call`.
- No transaction was sent.

## 16. Source index

| Source | What it settled |
| --- | --- |
| https://docs.robinhood.com/chain/connecting | Chain IDs `4663` / `46630`, explorers, public RPCs |
| https://docs.robinhood.com/chain/protocol-contracts | Testnet L2 WETH, L2 multicall, Permit2, mainnet L2 WETH |
| https://docs.paxos.com/guides/stablecoin/usdg/testnet | Robinhood Testnet USDG address |
| https://github.com/Uniswap/contracts/blob/main/deployments/4663.md | Mainnet manifest. No `46630.md` in the deployments directory listing. |
| `eth_chainId` / `eth_getCode` / `eth_call` / `eth_getLogs` on `https://rpc.testnet.chain.robinhood.com` | Testnet proof in this file |
| `eth_chainId` on `https://rpc.mainnet.chain.robinhood.com` | Mainnet chain ID `4663` |
| https://explorer.testnet.chain.robinhood.com/api/v2/smart-contracts/ | Verification flags for PoolManager, PositionManager, Permit2, WETH proxy, V4Quoter |
