import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { isHealthy as isCosmosHealthy } from '../lib/cosmosdb.js';
import { isHealthy as isServiceBusHealthy } from '../lib/servicebus.js';

async function healthHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const [cosmosOk, serviceBusOk] = await Promise.all([
    isCosmosHealthy(),
    isServiceBusHealthy(),
  ]);

  const healthy = cosmosOk && serviceBusOk;

  return {
    status: healthy ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
    jsonBody: {
      status: healthy ? 'healthy' : 'degraded',
      checks: {
        cosmosDb: cosmosOk ? 'ok' : 'unavailable',
        serviceBus: serviceBusOk ? 'ok' : 'unavailable',
      },
      timestamp: new Date().toISOString(),
    },
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});
