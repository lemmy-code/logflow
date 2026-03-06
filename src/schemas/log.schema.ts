import { z } from 'zod';

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_APP_ID_LENGTH = 128;
const MAX_METADATA_DEPTH = 3;
const MAX_QUERY_LIMIT = 100;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_DATE_RANGE_DAYS = 90;

function checkDepth(obj: unknown, currentDepth: number = 0): boolean {
  if (currentDepth > MAX_METADATA_DEPTH) return false;
  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj).every((v) => checkDepth(v, currentDepth + 1));
  }
  return true;
}

export const logPayloadSchema = z.object({
  appId: z
    .string()
    .trim()
    .min(1, 'appId is required')
    .max(MAX_APP_ID_LENGTH, `appId must be at most ${MAX_APP_ID_LENGTH} characters`)
    .regex(/^[a-zA-Z0-9_-]+$/, 'appId must be alphanumeric with hyphens or underscores'),
  level: z.enum(['error', 'warn', 'info', 'debug'], {
    errorMap: () => ({ message: 'level must be one of: error, warn, info, debug' }),
  }),
  message: z
    .string()
    .trim()
    .min(1, 'message is required')
    .max(MAX_MESSAGE_LENGTH, `message must be at most ${MAX_MESSAGE_LENGTH} characters`),
  metadata: z
    .record(z.unknown())
    .optional()
    .default({})
    .refine((val) => checkDepth(val), {
      message: `metadata nesting must not exceed ${MAX_METADATA_DEPTH} levels`,
    }),
});

export const logQuerySchema = z.object({
  appId: z
    .string()
    .trim()
    .min(1, 'appId is required'),
  level: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  from: z.string().datetime({ message: 'from must be a valid ISO 8601 date' }).optional(),
  to: z.string().datetime({ message: 'to must be a valid ISO 8601 date' }).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_QUERY_LIMIT)
    .default(DEFAULT_QUERY_LIMIT),
  continuationToken: z.string().optional(),
}).refine(
  (data) => {
    if (data.from && data.to) {
      const diffMs = new Date(data.to).getTime() - new Date(data.from).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= MAX_DATE_RANGE_DAYS;
    }
    return true;
  },
  { message: `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days and 'to' must be after 'from'` }
);

export type LogPayloadInput = z.infer<typeof logPayloadSchema>;
export type LogQueryInput = z.infer<typeof logQuerySchema>;
