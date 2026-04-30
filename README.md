# FlareLog

Lightweight log service on Cloudflare Workers + D1.

## Quick Start

```txt
npm install
npm run dev
```

## Deploy

```txt
npm run deploy
```

## Cloudflare Configuration

1. Create a D1 database
2. Bind D1 database in Worker Settings > Bindings, variable name: `DB`
3. Add `API_KEY` environment variable in Worker Settings > Environment Variables

Database tables and indexes are automatically created on the first request. No manual SQL execution needed.

## API

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/` | Service info | No |
| `POST` | `/api/logs` | Ingest single log | Yes |
| `POST` | `/api/logs/batch` | Batch ingest logs (≤100) | Yes |
| `GET` | `/api/logs` | Query logs (filter + pagination) | Yes |
| `GET` | `/api/logs/:id` | Get single log | Yes |
| `DELETE` | `/api/logs/:id` | Delete single log | Yes |
| `DELETE` | `/api/logs` | Batch delete logs (by service/before) | Yes |

Auth: `Authorization: Bearer <key>` or `X-API-Key: <key>`

### Query Parameters (GET /api/logs)

| Param | Type | Description |
|-------|------|-------------|
| `level` | string | Filter by single level (debug/info/warn/error) |
| `levels` | string | Filter by multiple levels, comma-separated (e.g. "error,warn") |
| `service` | string | Filter by service name |
| `trace_id` | string | Filter by trace ID |
| `message` | string | Fuzzy search in message |
| `start_time` | string | Start time (ISO 8601) |
| `end_time` | string | End time (ISO 8601) |
| `limit` | number | Page size (1-200, default 50) |
| `offset` | number | Pagination offset (default 0) |
| `sort` | string | Sort field: timestamp or created_at (default timestamp) |
| `order` | string | Sort direction: asc or desc (default desc) |

### Batch Delete Parameters (DELETE /api/logs)

| Param | Type | Description |
|-------|------|-------------|
| `service` | string | Delete logs by service name |
| `before` | string | Delete logs before this time (ISO 8601) |

At least one parameter is required to prevent accidental deletion of all logs.

## Web UI

Access the root URL of your Worker to use the built-in log viewer. Configure the API Base URL and API Key in the Settings panel.

## Type Generation

```txt
npm run cf-typegen
```
