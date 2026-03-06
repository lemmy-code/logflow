export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogPayload {
  appId: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogDocument {
  id: string;
  appId: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown>;
  receivedAt: string;
  processedAt: string;
  region: string;
  correlationId: string;
  ttl: number;
}

export interface ApiSuccessResponse<T> {
  data: T;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  limit: number;
  hasMore: boolean;
  continuationToken?: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: Array<{ field: string; issue: string }>;
  };
}

export interface LogQueryParams {
  appId: string;
  level?: LogLevel;
  from?: string;
  to?: string;
  limit?: number;
  continuationToken?: string;
}

export interface AppStats {
  appId: string;
  total: number;
  byLevel: Record<LogLevel, number>;
  lastSeen: string | null;
}
