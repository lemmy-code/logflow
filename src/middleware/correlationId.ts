import { HttpRequest } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';

export function getCorrelationId(request: HttpRequest): string {
  return request.headers.get('x-request-id') || uuidv4();
}
