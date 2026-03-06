# LogFlow

Serverless log aggregation pipeline built on Azure -- ingest, process, query, and analyze application logs at scale with zero server management.

---

## Architecture

```
                         +--------------------------+
                         |        Client App        |
                         +------------+-------------+
                                      |
                                POST /api/logs
                                      |
                    +-----------------v------------------+
                    |     Ingest Function (HTTP)         |
                    |                                    |
                    |  Middleware Pipeline:               |
                    |    correlationId -> apiKey auth     |
                    |    -> rate limiter -> handler       |
                    |                                    |
                    |  Zod validation -> enrich payload  |
                    |  -> publish to Service Bus         |
                    |  -> 202 Accepted                   |
                    +-----------------+------------------+
                                      |
                                  publish
                                      |
                    +-----------------v------------------+
                    |        Azure Service Bus           |
                    |                                    |
                    |  queue: logflow-ingest              |
                    |  maxDeliveryCount: 3                |
                    |  DLQ on failure                     |
                    +-----------------+------------------+
                                      |
                                  trigger
                                      |
                    +-----------------v------------------+
                    |   Processor Function (SB Trigger)  |
                    |                                    |
                    |  Normalize level, add metadata     |
                    |  (processedAt, region, TTL)        |
                    |  -> write to CosmosDB              |
                    +-----------------+------------------+
                                      |
                                   write
                                      |
                    +-----------------v------------------+
                    |          Azure CosmosDB            |
                    |                                    |
                    |  database: logflow                  |
                    |  container: logs                    |
                    |  partition key: /appId              |
                    |  TTL: 30 days                       |
                    +-----------------+------------------+
                                      |
                                   read
                                      |
                    +-----------------v------------------+
                    |    Query Functions (HTTP)           |
                    |                                    |
                    |  GET /api/logs         (filtered)   |
                    |  GET /api/logs/:id     (by id)      |
                    |  GET /api/apps/:appId/stats         |
                    |  GET /api/health                    |
                    +------------------------------------+
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Azure Functions v4, Node.js 20 |
| Message Queue | Azure Service Bus |
| Database | Azure CosmosDB (NoSQL) |
| Validation | Zod |
| Infrastructure | Azure Bicep (modular) |
| CI/CD | GitHub Actions |
| Local Dev | Docker Compose + Azurite |

---

## API Reference

All endpoints (except `/api/health`) require API key authentication via the `Authorization` header.

### POST /api/logs -- Ingest a log entry

Accepts a log entry and queues it for async processing. Returns immediately with `202 Accepted`.

```bash
curl -X POST https://your-app.azurewebsites.net/api/logs \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "payment-service",
    "level": "error",
    "message": "Payment gateway timeout after 30s",
    "metadata": {
      "orderId": "ORD-7829",
      "gateway": "stripe",
      "latencyMs": 30000
    }
  }'
```

**Success Response (202):**

```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "accepted",
    "correlationId": "req-550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Headers included in every response:**

```
X-Request-Id: req-550e8400-e29b-41d4-a716-446655440000
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1709726460
X-Content-Type-Options: nosniff
```

### GET /api/logs -- Query logs (filtered list)

```bash
curl "https://your-app.azurewebsites.net/api/logs?appId=payment-service&level=error&from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z&limit=10" \
  -H "Authorization: Bearer your-api-key"
```

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "appId": "payment-service",
      "level": "error",
      "message": "Payment gateway timeout after 30s",
      "metadata": { "orderId": "ORD-7829", "gateway": "stripe" },
      "receivedAt": "2026-01-15T10:30:00.000Z",
      "processedAt": "2026-01-15T10:30:00.450Z",
      "region": "eastus",
      "correlationId": "req-550e8400-e29b-41d4-a716-446655440000",
      "ttl": 2592000
    }
  ],
  "pagination": {
    "limit": 10,
    "hasMore": true,
    "continuationToken": "eyJjb21wb3NpdGVUb2tlbiI6..."
  }
}
```

**Fetching the next page:**

```bash
curl "https://your-app.azurewebsites.net/api/logs?appId=payment-service&level=error&limit=10&continuationToken=eyJjb21wb3NpdGVUb2tlbiI6..." \
  -H "Authorization: Bearer your-api-key"
```

### GET /api/logs/:id -- Get a single log

Requires `appId` as a query parameter (used as the partition key for efficient point reads).

```bash
curl "https://your-app.azurewebsites.net/api/logs/a1b2c3d4-e5f6-7890-abcd-ef1234567890?appId=payment-service" \
  -H "Authorization: Bearer your-api-key"
```

**Success Response (200):**

```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "payment-service",
    "level": "error",
    "message": "Payment gateway timeout after 30s",
    "metadata": { "orderId": "ORD-7829", "gateway": "stripe" },
    "receivedAt": "2026-01-15T10:30:00.000Z",
    "processedAt": "2026-01-15T10:30:00.450Z",
    "region": "eastus",
    "correlationId": "req-550e8400-e29b-41d4-a716-446655440000",
    "ttl": 2592000
  }
}
```

### GET /api/apps/:appId/stats -- Aggregated stats per application

```bash
curl "https://your-app.azurewebsites.net/api/apps/payment-service/stats" \
  -H "Authorization: Bearer your-api-key"
```

**Success Response (200):**

```json
{
  "data": {
    "appId": "payment-service",
    "total": 1523,
    "byLevel": {
      "error": 42,
      "warn": 201,
      "info": 1280,
      "debug": 0
    },
    "lastSeen": "2026-01-15T10:30:00.000Z"
  }
}
```

### GET /api/health -- Health check

No authentication required. Returns `200` when all dependencies are reachable, `503` when any check fails.

```bash
curl "https://your-app.azurewebsites.net/api/health"
```

**Healthy Response (200):**

```json
{
  "status": "healthy",
  "checks": {
    "cosmosDb": "ok",
    "serviceBus": "ok"
  },
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

**Degraded Response (503):**

```json
{
  "status": "degraded",
  "checks": {
    "cosmosDb": "ok",
    "serviceBus": "unavailable"
  },
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

---

## Error Handling

### Error Hierarchy

All application errors extend a base `AppError` class that standardizes HTTP responses:

```
AppError (base)
  |-- ValidationError         400   VALIDATION_FAILED
  |-- AuthenticationError     401   AUTHENTICATION_FAILED
  |-- NotFoundError           404   NOT_FOUND
  |-- RateLimitError          429   RATE_LIMIT_EXCEEDED
  |-- ServiceBusError         502   SERVICE_BUS_UNAVAILABLE
  |-- CosmosDbError           502   COSMOS_DB_UNAVAILABLE
  |-- InternalError           500   INTERNAL_ERROR
```

### Consistent Error Format

Every error response follows the same envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid log payload",
    "correlationId": "req-550e8400-e29b-41d4-a716-446655440000",
    "details": [
      { "field": "level", "issue": "level must be one of: error, warn, info, debug" },
      { "field": "message", "issue": "message is required" }
    ]
  }
}
```

The `details` array is included only for validation errors, providing field-level feedback. The `correlationId` is present in every error response, making it possible to trace issues across the ingest-process-query pipeline.

### Rate Limit Error

When the token bucket is exhausted, the response includes a `Retry-After` header:

```bash
# Response: 429
# Retry-After: 3
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "correlationId": "req-..."
  }
}
```

---

## Database Design

### Partition Key: `/appId`

The partition key is set to `/appId` because:

- **Query locality** -- logs are almost always queried by application. Having all logs for one app in the same partition means single-partition queries, which are cheaper and faster.
- **Write distribution** -- in a multi-tenant log system, writes naturally distribute across partitions since different apps produce logs independently.
- **Point reads** -- fetching a single log by `id` + `appId` is a direct partition key lookup (1 RU).

### Indexing Policy

The container uses a custom indexing policy to minimize RU cost:

| Indexed Paths | Reason |
|---|---|
| `/appId/?` | Partition key, always queried |
| `/level/?` | Filter by log level |
| `/receivedAt/?` | Date range queries, ORDER BY |

| Excluded Paths | Reason |
|---|---|
| `/metadata/*` | Arbitrary user data, never queried directly -- saves write RUs |
| `/message/?` | Free-text log messages, not filtered on -- saves write RUs |
| `/_etag/?` | System field, not needed in queries |

**Composite Index:** `(appId ASC, receivedAt DESC)` -- supports the primary query pattern of fetching recent logs for an app sorted by time, without requiring a costly cross-partition sort.

### TTL

Documents automatically expire after 30 days (`defaultTtl: 2592000` seconds). This keeps storage costs bounded and eliminates the need for manual cleanup jobs.

### Pagination

Uses CosmosDB's native continuation token pattern. The client sends the opaque `continuationToken` from a previous response to fetch the next page. This avoids the performance pitfalls of OFFSET-based pagination on large datasets.

### Estimated RU Costs

| Operation | Estimated Cost |
|---|---|
| Point read (by id + appId) | ~1 RU |
| Write (single log document) | ~6-10 RU |
| Query (filtered, single partition) | ~3-5 RU per page |
| Stats aggregation (COUNT + GROUP BY) | ~10-20 RU |

---

## Security

### API Key Authentication

All endpoints (except `/api/health`) require a `Bearer` token in the `Authorization` header. Key comparison uses `crypto.timingSafeEqual` to prevent timing attacks. Failed authentication attempts are logged with a partial SHA-256 hash of the provided key for auditability without exposing secrets.

### Rate Limiting

Token bucket algorithm, tracked per API key and endpoint:

| Endpoint | Bucket Size | Refill Rate |
|---|---|---|
| `ingest` | 100 requests | ~1.67/sec (100/min) |
| `query` | 200 requests | ~3.33/sec (200/min) |

Rate limit state is communicated via standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Input Validation and Sanitization

All input is validated and sanitized through Zod schemas:

- `appId` -- alphanumeric with hyphens/underscores only, max 128 chars
- `message` -- max 10,000 chars, trimmed
- `metadata` -- max nesting depth of 3 levels
- Query date ranges -- max 90 days, `to` must be after `from`
- `limit` -- integer between 1 and 100, defaults to 50

### Security Headers

Every response includes:

- `X-Content-Type-Options: nosniff` -- prevents MIME type sniffing
- `X-Request-Id` -- correlation ID for request tracing
- HTTPS enforced via `httpsOnly: true` in infrastructure
- Minimum TLS 1.2, FTPS disabled

---

## Infrastructure

The infrastructure is defined in modular Azure Bicep templates with environment parameterization for `dev` and `prod`.

### Bicep Modules

| Module | Resources Created | Key Differences (dev vs prod) |
|---|---|---|
| `storage.bicep` | Storage Account | -- |
| `appInsights.bicep` | Application Insights + Log Analytics Workspace | -- |
| `serviceBus.bicep` | Service Bus Namespace + Queue | Basic SKU (dev) vs Standard (prod) |
| `cosmosDb.bicep` | CosmosDB Account + Database + Container | Serverless (dev) vs Provisioned (prod), zone redundancy in prod |
| `functionApp.bicep` | App Service Plan (Consumption) + Function App | NODE_ENV set per environment |

`infra/main.bicep` orchestrates all modules and wires outputs (connection strings, keys) between them. Secrets are marked with `@secure()` to prevent them from appearing in deployment logs.

---

## CI/CD

The GitHub Actions pipeline (`.github/workflows/deploy.yml`) runs on every push to `main`:

```
1. Checkout code
2. Setup Node.js 20.x (with npm cache)
3. npm ci (clean install)
4. Lint (ESLint with TypeScript rules)
5. Build (tsc)
6. Azure Login (service principal credentials)
7. Deploy Infrastructure (Bicep -> ARM)
8. Deploy Azure Functions (zip deploy)
```

**Required GitHub Secrets:**

| Secret | Purpose |
|---|---|
| `AZURE_CREDENTIALS` | Service principal JSON for Azure login |
| `API_KEY` | API key passed to Bicep as a secure parameter |

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Azure Functions Core Tools v4

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/logflow.git
cd logflow

# 2. Install dependencies
npm install

# 3. Create local configuration
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your Service Bus and CosmosDB credentials
# (or use the Azure CosmosDB emulator)

# 4. Start Azurite (Azure Storage emulator)
docker compose up -d

# 5. Build and start the Functions runtime
npm start

# Functions available at http://localhost:7071
```

### Docker Compose Services

| Service | Ports | Purpose |
|---|---|---|
| Azurite | 10000, 10001, 10002 | Azure Storage emulator (Blob, Queue, Table) |

### Test it locally

```bash
# Ingest a log
curl -X POST http://localhost:7071/api/logs \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"appId": "test-app", "level": "info", "message": "Hello from local dev"}'

# Check health
curl http://localhost:7071/api/health
```

---

## Deployment

### Deploy infrastructure and application to Azure

```bash
# 1. Create a resource group
az group create --name logflow-rg --location eastus

# 2. Deploy all infrastructure (Service Bus, CosmosDB, Functions, etc.)
az deployment group create \
  --resource-group logflow-rg \
  --template-file infra/main.bicep \
  --parameters environment=prod apiKey=your-secret-api-key

# 3. Build the project
npm run build

# 4. Deploy the function code
func azure functionapp publish logflow-prod-func
```

---

## Environment Variables

| Variable | Description | Required | Default |
|---|---|---|---|
| `SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus connection string | Yes | -- |
| `COSMOS_ENDPOINT` | CosmosDB account endpoint URL | Yes | -- |
| `COSMOS_KEY` | CosmosDB primary key | Yes | -- |
| `COSMOS_DATABASE` | CosmosDB database name | No | `logflow` |
| `COSMOS_CONTAINER` | CosmosDB container name | No | `logs` |
| `API_KEY` | Secret key for API authentication | Yes | -- |
| `AZURE_REGION` | Region label added to processed logs | No | `local` |
| `NODE_ENV` | Environment mode (`development` / `production`) | No | -- |
| `AzureWebJobsStorage` | Azure Storage connection (use `UseDevelopmentStorage=true` locally) | Yes | -- |
| `FUNCTIONS_WORKER_RUNTIME` | Must be `node` | Yes | -- |

---

## Project Structure

```
logflow/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD pipeline
│
├── infra/
│   ├── main.bicep                  # Orchestrator — wires all modules
│   └── modules/
│       ├── storage.bicep           # Storage Account
│       ├── appInsights.bicep       # Application Insights + Log Analytics
│       ├── serviceBus.bicep        # Service Bus Namespace + Queue
│       ├── cosmosDb.bicep          # CosmosDB Account + Database + Container
│       └── functionApp.bicep       # App Service Plan + Function App
│
├── src/
│   ├── functions/
│   │   ├── ingest.ts               # POST /api/logs — async log ingestion
│   │   ├── processor.ts            # Service Bus trigger — process + store
│   │   ├── query.ts                # GET endpoints — query + stats
│   │   └── health.ts               # GET /api/health — dependency checks
│   │
│   ├── middleware/
│   │   ├── pipeline.ts             # Composable middleware chain
│   │   ├── apiKey.ts               # Bearer token auth (timing-safe)
│   │   ├── rateLimiter.ts          # Token bucket rate limiting
│   │   ├── correlationId.ts        # Request tracing via X-Request-Id
│   │   └── errorHandler.ts         # Centralized error-to-HTTP mapping
│   │
│   ├── lib/
│   │   ├── cosmosdb.ts             # CosmosDB client + CRUD operations
│   │   └── servicebus.ts           # Service Bus sender + health check
│   │
│   ├── schemas/
│   │   └── log.schema.ts           # Zod schemas (payload + query params)
│   │
│   ├── errors/
│   │   └── index.ts                # Custom error hierarchy
│   │
│   └── types/
│       └── index.ts                # TypeScript interfaces
│
├── docker-compose.yml              # Azurite for local dev
├── host.json                       # Azure Functions runtime config
├── local.settings.json.example     # Template for local settings
├── package.json
├── tsconfig.json
└── .eslintrc.json
```

---

## Key Concepts Demonstrated

- **Async message processing** -- fire-and-forget HTTP ingest with Service Bus decoupling
- **Dead letter queue (DLQ)** -- automatic retry (3x) with failed message isolation
- **Partition key design** -- CosmosDB partition strategy optimized for multi-tenant query patterns
- **Custom indexing policy** -- selective indexing to reduce write RU costs
- **Continuation token pagination** -- CosmosDB-native cursor-based pagination
- **TTL auto-expiry** -- documents self-delete after 30 days with zero maintenance
- **Middleware pipeline** -- composable request processing (auth, rate limit, correlation, errors)
- **Token bucket rate limiting** -- per-key, per-endpoint rate control
- **Timing-safe authentication** -- constant-time key comparison to prevent timing attacks
- **Custom error hierarchy** -- typed error classes with consistent API error envelope
- **Input validation with Zod** -- runtime type checking with structured error details
- **Correlation ID tracing** -- request tracking across the async pipeline
- **Infrastructure as Code** -- modular Bicep with dev/prod parameterization
- **CI/CD automation** -- lint, build, infrastructure deploy, and function deploy in one pipeline
- **Health check endpoint** -- dependency probing for monitoring and load balancers
- **Security hardening** -- HTTPS-only, TLS 1.2+, FTPS disabled, nosniff headers
