import { CosmosClient, Container, SqlQuerySpec, JSONValue } from '@azure/cosmos';
import { LogDocument, LogQueryParams, AppStats, LogLevel } from '../types/index.js';
import { CosmosDbError, NotFoundError } from '../errors/index.js';

let container: Container | null = null;

function getContainer(): Container {
  if (container) return container;

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const database = process.env.COSMOS_DATABASE || 'logflow';
  const containerName = process.env.COSMOS_CONTAINER || 'logs';

  if (!endpoint || !key) {
    throw new Error('CosmosDB configuration missing: COSMOS_ENDPOINT and COSMOS_KEY required');
  }

  const client = new CosmosClient({ endpoint, key });
  container = client.database(database).container(containerName);
  return container;
}

export async function createLog(
  document: LogDocument,
  correlationId: string
): Promise<void> {
  try {
    await getContainer().items.create(document);
  } catch (error) {
    throw new CosmosDbError(
      `Failed to create log document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      correlationId
    );
  }
}

export async function getLogById(
  id: string,
  appId: string,
  correlationId: string
): Promise<LogDocument> {
  try {
    const { resource } = await getContainer().item(id, appId).read<LogDocument>();
    if (!resource) {
      throw new NotFoundError('Log entry', correlationId);
    }
    return resource;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new CosmosDbError(
      `Failed to read log document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      correlationId
    );
  }
}

export async function queryLogs(
  params: LogQueryParams,
  correlationId: string
): Promise<{ documents: LogDocument[]; continuationToken?: string }> {
  try {
    const conditions: string[] = ['c.appId = @appId'];
    const parameters: Array<{ name: string; value: JSONValue }> = [
      { name: '@appId', value: params.appId },
    ];

    if (params.level) {
      conditions.push('c.level = @level');
      parameters.push({ name: '@level', value: params.level });
    }
    if (params.from) {
      conditions.push('c.receivedAt >= @from');
      parameters.push({ name: '@from', value: params.from });
    }
    if (params.to) {
      conditions.push('c.receivedAt <= @to');
      parameters.push({ name: '@to', value: params.to });
    }

    const querySpec: SqlQuerySpec = {
      query: `SELECT * FROM c WHERE ${conditions.join(' AND ')} ORDER BY c.receivedAt DESC`,
      parameters,
    };

    const { resources, continuationToken } = await getContainer()
      .items.query<LogDocument>(querySpec, {
        maxItemCount: params.limit || 50,
        continuationToken: params.continuationToken,
        partitionKey: params.appId,
      })
      .fetchNext();

    return {
      documents: resources || [],
      continuationToken: continuationToken || undefined,
    };
  } catch (error) {
    throw new CosmosDbError(
      `Failed to query logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      correlationId
    );
  }
}

export async function getAppStats(
  appId: string,
  correlationId: string
): Promise<AppStats> {
  try {
    const countQuery: SqlQuerySpec = {
      query: 'SELECT c.level, COUNT(1) as count FROM c WHERE c.appId = @appId GROUP BY c.level',
      parameters: [{ name: '@appId', value: appId }],
    };

    const lastSeenQuery: SqlQuerySpec = {
      query: 'SELECT TOP 1 c.receivedAt FROM c WHERE c.appId = @appId ORDER BY c.receivedAt DESC',
      parameters: [{ name: '@appId', value: appId }],
    };

    const [countResult, lastSeenResult] = await Promise.all([
      getContainer()
        .items.query<{ level: LogLevel; count: number }>(countQuery, { partitionKey: appId })
        .fetchAll(),
      getContainer()
        .items.query<{ receivedAt: string }>(lastSeenQuery, { partitionKey: appId })
        .fetchAll(),
    ]);

    const byLevel: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 };
    let total = 0;

    for (const item of countResult.resources) {
      byLevel[item.level] = item.count;
      total += item.count;
    }

    return {
      appId,
      total,
      byLevel,
      lastSeen: lastSeenResult.resources[0]?.receivedAt || null,
    };
  } catch (error) {
    throw new CosmosDbError(
      `Failed to get app stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
      correlationId
    );
  }
}

export async function isHealthy(): Promise<boolean> {
  try {
    await getContainer().read();
    return true;
  } catch {
    return false;
  }
}
