import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getCorrelationId } from './correlationId.js';
import { validateApiKey } from './apiKey.js';
import { checkRateLimit, rateLimitHeaders } from './rateLimiter.js';
import { handleError } from './errorHandler.js';

interface PipelineOptions {
  endpoint: string;
  skipAuth?: boolean;
}

type HandlerFn = (
  request: HttpRequest,
  context: InvocationContext,
  correlationId: string
) => Promise<HttpResponseInit>;

export function withMiddleware(
  handler: HandlerFn,
  options: PipelineOptions
): (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit> {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const correlationId = getCorrelationId(request);

    try {
      if (!options.skipAuth) {
        validateApiKey(request, correlationId);
      }

      const rateInfo = checkRateLimit(
        request.headers.get('authorization')?.slice(7) || 'anonymous',
        options.endpoint,
        correlationId
      );

      const response = await handler(request, context, correlationId);

      return {
        ...response,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': correlationId,
          'X-Content-Type-Options': 'nosniff',
          ...rateLimitHeaders(rateInfo),
          ...response.headers,
        },
      };
    } catch (error) {
      return handleError(error, correlationId, context);
    }
  };
}
