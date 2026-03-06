import { HttpRequest } from '@azure/functions';
import { AuthenticationError } from '../errors/index.js';
import * as crypto from 'crypto';

export function validateApiKey(request: HttpRequest, correlationId: string): void {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logAuthFailure(request, correlationId);
    throw new AuthenticationError(correlationId);
  }

  const providedKey = authHeader.slice(7);
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    throw new AuthenticationError(correlationId);
  }

  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    logAuthFailure(request, correlationId);
    throw new AuthenticationError(correlationId);
  }
}

function logAuthFailure(request: HttpRequest, correlationId: string): void {
  const partialKey = request.headers.get('authorization')?.slice(7, 11) || 'none';
  console.warn('[AUTH_FAILURE]', {
    correlationId,
    timestamp: new Date().toISOString(),
    partialKeyHash: crypto.createHash('sha256').update(partialKey).digest('hex').slice(0, 8),
    url: request.url,
  });
}
