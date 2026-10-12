import { parseAbi, parseAbiParameters } from 'viem';

/**
 * Universal Router Command Constants
 *
 * Source: Uniswap Universal Router Commands.sol
 * https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const COMMANDS = {
  /**
   * Command 0x10: V4_SWAP executes Uniswap v4 actions through the v4-periphery router.
   */
  V4_SWAP: '0x10',
} as const;

/**
 * Uniswap v4-periphery Action Constants
 *
 * Source: Uniswap v4-periphery Actions.sol
 * https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/Actions.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const ACTIONS = {
  /**
   * Action 0x06: SWAP_EXACT_IN_SINGLE performs a single-pool exact input swap.
   */
  SWAP_EXACT_IN_SINGLE: 0x06,

  /**
   * Action 0x0c: SETTLE_ALL settles an input currency obligation to PoolManager using msg.value or balance.
   */
  SETTLE_ALL: 0x0c,

  /**
   * Action 0x0f: TAKE_ALL takes an output currency credit from PoolManager to recipient (msg.sender).
   */
  TAKE_ALL: 0x0f,
} as const;

/**
 * Pinned action byte sequence for native ETH -> USDG single swap:
 * 0x06 (SWAP_EXACT_IN_SINGLE) -> 0x0c (SETTLE_ALL ETH) -> 0x0f (TAKE_ALL USDG).
 * Source: plans/004-c0-execution-discovery.md §4.1
 */
export const ACTIONS_ETH_TO_USDG_HEX = '0x060c0f' as const;

/**
 * Universal Router execute ABI
 * function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
 * Selector: 0x3593564c
 *
 * Source: Uniswap Universal Router IUniversalRouter.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const UNIVERSAL_ROUTER_EXECUTE_ABI = parseAbi([
  'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable',
]);

/**
 * Universal Router V4_SWAP inputs[0] tuple ABI parameters: (bytes actions, bytes[] params)
 *
 * Source: Uniswap v4-periphery IV4Router.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const V4_SWAP_INPUT_ABI_PARAMS = parseAbiParameters('bytes actions, bytes[] params');

/**
 * ExactInputSingleParams ABI layout for Action 0x06:
 * struct ExactInputSingleParams {
 *     PoolKey poolKey;
 *     bool zeroForOne;
 *     uint128 amountIn;
 *     uint128 amountOutMinimum;
 *     bytes hookData;
 * }
 * where PoolKey is:
 * struct PoolKey {
 *     Currency currency0;
 *     Currency currency1;
 *     uint24 fee;
 *     int24 tickSpacing;
 *     IHooks hooks;
 * }
 *
 * Source: Uniswap v4-periphery IV4Router.sol and Uniswap v4-core PoolKey.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const EXACT_INPUT_SINGLE_ABI_PARAMS = parseAbiParameters(
  '((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)'
);

/**
 * SETTLE_ALL ABI layout for Action 0x0c:
 * (address currency, uint256 maxAmount)
 *
 * Source: Uniswap v4-periphery IV4Router.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const SETTLE_ALL_ABI_PARAMS = parseAbiParameters('(address currency, uint256 maxAmount)');

/**
 * TAKE_ALL ABI layout for Action 0x0f:
 * (address currency, uint256 minAmount)
 *
 * Source: Uniswap v4-periphery IV4Router.sol
 * Cited in plans/004-c0-execution-discovery.md §4.1
 */
export const TAKE_ALL_ABI_PARAMS = parseAbiParameters('(address currency, uint256 minAmount)');

/**
 * Known revert errors in Uniswap v4 execution:
 * - V4TooLittleReceived(uint256 minAmountOut, uint256 amountOut): selector 0x8b063d73
 *   Source: Uniswap v4-periphery V4CustomErrors.sol and plans/004-c0-execution-discovery.md §4.3
 * - ExecutionFailed(uint256 commandIndex, bytes message): selector 0x2c4029e9
 *   Source: Universal Router Dispatcher.sol
 * - TransactionDeadlinePassed(): selector 0x5bf6f916
 *   Source: Universal Router Dispatcher.sol (live router ABI)
 * - Standard Error(string): selector 0x08c379a0
 * - Panic(uint256): selector 0x4e487b71
 */
export const EXECUTION_REVERT_ERRORS_ABI = parseAbi([
  'error V4TooLittleReceived(uint256 minAmountOut, uint256 amountOut)',
  'error ExecutionFailed(uint256 commandIndex, bytes message)',
  'error TransactionDeadlinePassed()',
  'error Error(string message)',
  'error Panic(uint256 code)',
]);
