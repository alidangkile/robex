import type { Request, Response, NextFunction } from 'express';
import { RobexAppError } from '@robex/core';
import type { ApiErrorResponse } from '@robex/types';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void {
  if (err instanceof RobexAppError) {
    const status = err.code === 'USER_ERROR' || err.code === 'QUOTE_ERROR' ? 400 : 500;
    res.status(status).json({
      error: err.toJSON(),
    });
    return;
  }

  const fallbackError = new RobexAppError(
    'UNKNOWN_ERROR',
    err instanceof Error ? err.message : 'An unexpected server error occurred'
  );

  res.status(500).json({
    error: fallbackError.toJSON(),
  });
}
