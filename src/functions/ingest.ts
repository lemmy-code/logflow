import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withMiddleware } from '../middleware/pipeline.js';
import { logPayloadSchema } from '../schemas/log.schema.js';
import { ValidationError } from '../errors/index.js';
import { sendToQueue } from '../lib/servicebus.js';
import { LogPayload } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

async function ingestHandler(
  request: HttpRequest,
  context: InvocationContext,
  correlationId: string
): Promise<HttpResponseInit> {
  const rawBody = await request.json();
  const parsed = logPayloadSchema.safeParse(rawBody);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      issue: issue.message,
    }));
    throw new ValidationError('Invalid log payload', correlationId, details);
  }

  const payload: LogPayload = parsed.data;

  const enrichedMessage = {
    id: uuidv4(),
    ...payload,
    metadata: payload.metadata || {},
    receivedAt: new Date().toISOString(),
    correlationId,
  };

  await sendToQueue(enrichedMessage, correlationId);

  context.log('[INGEST]', { correlationId, appId: payload.appId, level: payload.level });

  return {
    status: 202,
    jsonBody: {
      data: {
        id: enrichedMessage.id,
        status: 'accepted',
        correlationId,
      },
    },
  };
}

app.http('ingest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'logs',
  handler: withMiddleware(ingestHandler, { endpoint: 'ingest' }),
});
