import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withMiddleware } from '../middleware/pipeline.js';
import { logQuerySchema } from '../schemas/log.schema.js';
import { ValidationError } from '../errors/index.js';
import { queryLogs, getLogById, getAppStats } from '../lib/cosmosdb.js';

async function queryLogsHandler(
  request: HttpRequest,
  context: InvocationContext,
  correlationId: string
): Promise<HttpResponseInit> {
  const rawParams = {
    appId: request.query.get('appId'),
    level: request.query.get('level') || undefined,
    from: request.query.get('from') || undefined,
    to: request.query.get('to') || undefined,
    limit: request.query.get('limit') || undefined,
    continuationToken: request.query.get('continuationToken') || undefined,
  };

  const parsed = logQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      issue: issue.message,
    }));
    throw new ValidationError('Invalid query parameters', correlationId, details);
  }

  const result = await queryLogs(parsed.data, correlationId);

  context.log('[QUERY]', { correlationId, appId: parsed.data.appId, results: result.documents.length });

  return {
    status: 200,
    jsonBody: {
      data: result.documents,
      pagination: {
        limit: parsed.data.limit,
        hasMore: !!result.continuationToken,
        ...(result.continuationToken && { continuationToken: result.continuationToken }),
      },
    },
  };
}

async function getLogByIdHandler(
  request: HttpRequest,
  context: InvocationContext,
  correlationId: string
): Promise<HttpResponseInit> {
  const id = request.params.id;
  const appId = request.query.get('appId');

  if (!id || !appId) {
    throw new ValidationError(
      'Both id (path) and appId (query) are required',
      correlationId,
      [
        ...(!id ? [{ field: 'id', issue: 'id path parameter is required' }] : []),
        ...(!appId ? [{ field: 'appId', issue: 'appId query parameter is required' }] : []),
      ]
    );
  }

  const document = await getLogById(id, appId, correlationId);

  return {
    status: 200,
    jsonBody: { data: document },
  };
}

async function appStatsHandler(
  request: HttpRequest,
  context: InvocationContext,
  correlationId: string
): Promise<HttpResponseInit> {
  const appId = request.params.appId;

  if (!appId) {
    throw new ValidationError('appId is required', correlationId, [
      { field: 'appId', issue: 'appId path parameter is required' },
    ]);
  }

  const stats = await getAppStats(appId, correlationId);

  return {
    status: 200,
    jsonBody: { data: stats },
  };
}

app.http('queryLogs', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'logs',
  handler: withMiddleware(queryLogsHandler, { endpoint: 'query' }),
});

app.http('getLogById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'logs/{id}',
  handler: withMiddleware(getLogByIdHandler, { endpoint: 'query' }),
});

app.http('appStats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'apps/{appId}/stats',
  handler: withMiddleware(appStatsHandler, { endpoint: 'query' }),
});
