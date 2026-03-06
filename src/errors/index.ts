export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly correlationId: string;
  public readonly details?: Array<{ field: string; issue: string }>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    correlationId: string = 'unknown',
    details?: Array<{ field: string; issue: string }>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }

  public toResponse(): {
    error: {
      code: string;
      message: string;
      correlationId: string;
      details?: Array<{ field: string; issue: string }>;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        correlationId: this.correlationId,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    correlationId?: string,
    details?: Array<{ field: string; issue: string }>
  ) {
    super(message, 400, 'VALIDATION_FAILED', correlationId, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(correlationId?: string) {
    super('Authentication failed', 401, 'AUTHENTICATION_FAILED', correlationId);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, correlationId?: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND', correlationId);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, correlationId?: string) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', correlationId);
    this.retryAfter = retryAfter;
  }
}

export class ServiceBusError extends AppError {
  constructor(message: string, correlationId?: string) {
    super(message, 502, 'SERVICE_BUS_UNAVAILABLE', correlationId);
  }
}

export class CosmosDbError extends AppError {
  constructor(message: string, correlationId?: string) {
    super(message, 502, 'COSMOS_DB_UNAVAILABLE', correlationId);
  }
}

export class InternalError extends AppError {
  constructor(correlationId?: string) {
    super('Internal server error', 500, 'INTERNAL_ERROR', correlationId);
  }
}
