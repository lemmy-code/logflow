import { app, InvocationContext } from '@azure/functions';
import { createLog } from '../lib/cosmosdb.js';
import { LogDocument, LogLevel } from '../types/index.js';

const TTL_30_DAYS = 2_592_000;

function normalizeLevel(level: string): LogLevel {
  const normalized = level.toLowerCase().trim();
  const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];

  if (normalized === 'warning') return 'warn';
  if (validLevels.includes(normalized as LogLevel)) return normalized as LogLevel;
  return 'info';
}

interface IngestMessage {
  id: string;
  appId: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  receivedAt: string;
  correlationId: string;
}

async function processLog(message: IngestMessage, context: InvocationContext): Promise<void> {
  const correlationId = message.correlationId || 'unknown';

  context.log('[PROCESSOR] Processing log', {
    correlationId,
    appId: message.appId,
    deliveryCount: context.triggerMetadata?.deliveryCount,
  });

  const document: LogDocument = {
    id: message.id,
    appId: message.appId,
    level: normalizeLevel(message.level),
    message: message.message,
    metadata: message.metadata || {},
    receivedAt: message.receivedAt,
    processedAt: new Date().toISOString(),
    region: process.env.AZURE_REGION || 'local',
    correlationId,
    ttl: TTL_30_DAYS,
  };

  await createLog(document, correlationId);

  context.log('[PROCESSOR] Log saved', { correlationId, id: document.id });
}

app.serviceBusQueue('processor', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'logflow-ingest',
  handler: processLog,
});
