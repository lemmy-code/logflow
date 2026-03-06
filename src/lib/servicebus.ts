import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { ServiceBusError as AppServiceBusError } from '../errors/index.js';

const QUEUE_NAME = 'logflow-ingest';

let client: ServiceBusClient | null = null;
let sender: ServiceBusSender | null = null;

function getSender(): ServiceBusSender {
  if (sender) return sender;

  const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('SERVICE_BUS_CONNECTION_STRING is not configured');
  }

  client = new ServiceBusClient(connectionString);
  sender = client.createSender(QUEUE_NAME);
  return sender;
}

export async function sendToQueue(
  body: Record<string, unknown>,
  correlationId: string
): Promise<void> {
  try {
    await getSender().sendMessages({
      body,
      correlationId,
      contentType: 'application/json',
    });
  } catch (error) {
    throw new AppServiceBusError(
      `Failed to send message to queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      correlationId
    );
  }
}

export async function isHealthy(): Promise<boolean> {
  try {
    getSender();
    return true;
  } catch {
    return false;
  }
}
