const MASK = (1n << 64n) - 1n;

const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
] as const;

const ROTATION = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44] as const;
const PI_LANE = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1] as const;

function rotl(value: bigint, bits: number): bigint {
  const shift = BigInt(bits);
  return ((value << shift) | (value >> (64n - shift))) & MASK;
}

function keccakF(state: bigint[]): void {
  const column = new Array<bigint>(5);
  for (let round = 0; round < 24; round += 1) {
    for (let x = 0; x < 5; x += 1) {
      column[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const mixed = column[(x + 4) % 5] ^ rotl(column[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) state[y + x] = (state[y + x] ^ mixed) & MASK;
    }

    let current = state[1];
    for (let i = 0; i < 24; i += 1) {
      const nextLane = PI_LANE[i];
      const next = state[nextLane];
      state[nextLane] = rotl(current, ROTATION[i]);
      current = next;
    }

    for (let y = 0; y < 25; y += 5) {
      const saved = state.slice(y, y + 5);
      for (let x = 0; x < 5; x += 1) {
        state[y + x] = (saved[x] ^ ((~saved[(x + 1) % 5] & MASK) & saved[(x + 2) % 5])) & MASK;
      }
    }

    state[0] = (state[0] ^ ROUND_CONSTANTS[round]) & MASK;
  }
}

function readLane(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i += 1) value |= BigInt(bytes[offset + i] ?? 0) << BigInt(8 * i);
  return value;
}

function writeLane(bytes: Uint8Array, offset: number, value: bigint): void {
  let rest = value;
  for (let i = 0; i < 8; i += 1) {
    bytes[offset + i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
}

/** Ethereum Keccak-256. This is not NIST SHA3-256. */
export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136;
  const state = new Array<bigint>(25).fill(0n);
  let offset = 0;
  while (offset + rate <= input.length) {
    for (let lane = 0; lane < rate / 8; lane += 1) state[lane] ^= readLane(input, offset + lane * 8);
    keccakF(state);
    offset += rate;
  }

  const block = new Uint8Array(rate);
  block.set(input.subarray(offset));
  block[input.length - offset] ^= 0x01;
  block[rate - 1] ^= 0x80;
  for (let lane = 0; lane < rate / 8; lane += 1) state[lane] ^= readLane(block, lane * 8);
  keccakF(state);

  const out = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane += 1) writeLane(out, lane * 8, state[lane]);
  return out;
}

export function keccak256Hex(input: Uint8Array): string {
  return `0x${Array.from(keccak256(input), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
