import { HttpResponseInit, InvocationContext } from '@azure/functions';
import { AppError, InternalError, RateLimitError } from '../errors/index.js';

export function handleError(
  error: unknown,
  correlationId: string,
  context: InvocationContext
): HttpResponseInit {
  if (error instanceof AppError) {
    context.warn(`[${error.code}] ${error.message}`, { correlationId });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': correlationId,
      'X-Content-Type-Options': 'nosniff',
    };

    if (error instanceof RateLimitError) {
      headers['Retry-After'] = String(error.retryAfter);
    }

    return {
      status: error.statusCode,
      headers,
      jsonBody: error.toResponse(),
    };
  }

  context.error('[UNHANDLED_ERROR]', error, { correlationId });

  const internalError = new InternalError(correlationId);
  const body = internalError.toResponse();

  if (process.env.NODE_ENV === 'development' && error instanceof Error) {
    body.error.message = error.message;
    (body as Record<string, unknown>).stack = error.stack;
  }

  return {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': correlationId,
      'X-Content-Type-Options': 'nosniff',
    },
    jsonBody: body,
  };
}
