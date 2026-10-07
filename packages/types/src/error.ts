export type ErrorCode =
  | 'USER_ERROR'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'QUOTE_ERROR'
  | 'LIQUIDITY_ERROR'
  | 'SECURITY_ERROR'
  | 'CHAIN_ERROR'
  | 'UNKNOWN_ERROR';

export interface RobexError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface ApiErrorResponse {
  error: RobexError;
}
