import { RateLimitError } from '../errors/index.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  windowMs: number;
}

const buckets = new Map<string, TokenBucket>();

const CONFIGS: Record<string, RateLimiterConfig> = {
  ingest: { maxTokens: 100, refillRate: 100 / 60, windowMs: 60_000 },
  query: { maxTokens: 200, refillRate: 200 / 60, windowMs: 60_000 },
};

function refillBucket(bucket: TokenBucket, config: RateLimiterConfig): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + elapsed * config.refillRate);
  bucket.lastRefill = now;
}

export function checkRateLimit(
  apiKey: string,
  endpoint: string,
  correlationId: string
): { limit: number; remaining: number; reset: number } {
  const config = CONFIGS[endpoint] || CONFIGS.query;
  const bucketKey = `${apiKey}:${endpoint}`;

  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: Date.now() };
    buckets.set(bucketKey, bucket);
  }

  refillBucket(bucket, config);

  const resetTime = Math.ceil(Date.now() / 1000) + Math.ceil(config.windowMs / 1000);

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / config.refillRate);
    throw new RateLimitError(retryAfter, correlationId);
  }

  bucket.tokens -= 1;

  return {
    limit: config.maxTokens,
    remaining: Math.floor(bucket.tokens),
    reset: resetTime,
  };
}

export function rateLimitHeaders(info: {
  limit: number;
  remaining: number;
  reset: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(info.remaining),
    'X-RateLimit-Reset': String(info.reset),
  };
}
