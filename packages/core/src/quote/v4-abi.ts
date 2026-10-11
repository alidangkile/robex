import { keccak256, keccak256Hex } from '../crypto/keccak256.js';

const ETH = '0x0000000000000000000000000000000000000000';
const USDG = '0x7E955252E15c84f5768B83c41a71F9eba181802F';

export interface PoolKey {
  currency0: string;
  currency1: string;
  feePips: number;
  tickSpacing: number;
  hooks: string;
}

export const ETH_USDG_POOL_KEY: PoolKey = {
  currency0: ETH,
  currency1: USDG,
  feePips: 3000,
  tickSpacing: 60,
  hooks: ETH,
};

function signatureSelector(signature: string): Uint8Array {
  return keccak256(new TextEncoder().encode(signature)).subarray(0, 4);
}

export const SELECTOR = {
  quoteExactInputSingle: signatureSelector('quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))'),
  poolManager: signatureSelector('poolManager()'),
  getSlot0: signatureSelector('getSlot0(bytes32)'),
  getLiquidity: signatureSelector('getLiquidity(bytes32)'),
  decimals: signatureSelector('decimals()'),
} as const;

export function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex bytes');
  }
  const raw = hex.slice(2);
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function addressWord(address: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid address');
  const word = new Uint8Array(32);
  word.set(hexToBytes(address), 12);
  return word;
}

function uintWord(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 256n) throw new Error('ABI word is out of range');
  const word = new Uint8Array(32);
  let rest = value;
  for (let i = 31; i >= 0; i -= 1) {
    word[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return word;
}

export function encodePoolKey(key: PoolKey = ETH_USDG_POOL_KEY): Uint8Array {
  const encoded = new Uint8Array(160);
  encoded.set(addressWord(key.currency0), 0);
  encoded.set(addressWord(key.currency1), 32);
  encoded.set(uintWord(BigInt(key.feePips)), 64);
  encoded.set(uintWord(BigInt(key.tickSpacing)), 96);
  encoded.set(addressWord(key.hooks), 128);
  return encoded;
}

export function computePoolId(key: PoolKey = ETH_USDG_POOL_KEY): string {
  return keccak256Hex(encodePoolKey(key));
}

export function encodeQuoteExactInputSingle(amountIn: bigint, key: PoolKey = ETH_USDG_POOL_KEY): string {
  if (amountIn <= 0n || amountIn >= 1n << 128n) throw new Error('exactAmount must fit uint128');
  const words = [
    uintWord(0x20n),
    addressWord(key.currency0),
    addressWord(key.currency1),
    uintWord(BigInt(key.feePips)),
    uintWord(BigInt(key.tickSpacing)),
    addressWord(key.hooks),
    uintWord(1n),
    uintWord(amountIn),
    uintWord(0x100n),
    uintWord(0n),
  ];
  const data = new Uint8Array(4 + words.length * 32);
  data.set(SELECTOR.quoteExactInputSingle, 0);
  words.forEach((word, index) => data.set(word, 4 + index * 32));
  return bytesToHex(data);
}

export function encodeWordCall(selector: Uint8Array, wordHex: string): string {
  return `${bytesToHex(selector)}${wordHex.replace(/^0x/, '').toLowerCase()}`;
}

export function decodeWord(hex: string, index: number): bigint {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  const start = index * 64;
  if (!/^[0-9a-fA-F]+$/.test(raw) || raw.length < start + 64) throw new Error('ABI word is missing');
  return BigInt(`0x${raw.slice(start, start + 64)}`);
}

export function decodeSignedWord(word: bigint): bigint {
  return word >= 1n << 255n ? word - (1n << 256n) : word;
}

export function decodeAddress(word: bigint): string {
  return `0x${(word & ((1n << 160n) - 1n)).toString(16).padStart(40, '0')}`;
}
