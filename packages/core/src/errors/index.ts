import type { ErrorCode, RobexError } from '@robex/types';

export class RobexAppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: number;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RobexAppError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }

  public toJSON(): RobexError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}
