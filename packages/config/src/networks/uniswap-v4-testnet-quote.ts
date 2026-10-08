/**
 * Pinned Robinhood Chain testnet Uniswap v4 ETH → USDG quote.
 * Addresses are not environment-overridable. Bytecode digests were re-read
 * at block 130884439 and match Plan 003A. They are identity checks, not prices.
 */
export const UNISWAP_V4_TESTNET_QUOTE = {
  chainId: 46630,
  nativeEth: '0x0000000000000000000000000000000000000000',
  usdg: '0x7E955252E15c84f5768B83c41a71F9eba181802F',
  /** Allowlisted official testnet WETH. It is not the V1 quotable pair. */
  weth: '0x7943e237c7F95DA44E0301572D358911207852Fa',
  poolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
  v4Quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  poolId: '0xf76eb83b8bb6de286ef58daac9dc52ae5c22b1cf2b0cce47041b17375b0a1669',
  feePips: 3000,
  tickSpacing: 60,
  hooks: '0x0000000000000000000000000000000000000000',
  code: {
    poolManager: {
      bytes: 24009,
      keccak256: '0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626',
    },
    stateView: {
      bytes: 3531,
      keccak256: '0x7d9c591e0956fd89d98feb4ffcfe8bf1f7a62bd485edd979fa21d104b49878a6',
    },
    v4Quoter: {
      bytes: 6118,
      keccak256: '0xd707b1da8cb165e5ea35a3b4450d971eb562ec171e23492aa117036b78a868f6',
    },
    usdg: {
      bytes: 170,
      keccak256: '0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6',
    },
  },
} as const;

export type UniswapV4TestnetQuotePin = typeof UNISWAP_V4_TESTNET_QUOTE;
