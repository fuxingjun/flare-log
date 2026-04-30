# FlareLog API 文档

FlareLog 是一个轻量级日志接收与查询服务, 基于 Cloudflare Workers + D1 构建。

- **Base URL**: `https://your-worker.workers.dev` (替换为你的 Worker 域名)
- **协议**: HTTPS
- **数据格式**: JSON

---

## 目录

- [认证](#认证)
- [限流](#限流)
- [统一响应格式](#统一响应格式)
- [接口列表](#接口列表)
  - [服务信息](#1-服务信息)
  - [写入单条日志](#2-写入单条日志)
  - [批量写入日志](#3-批量写入日志)
  - [查询日志列表](#4-查询日志列表)
  - [查询单条日志](#5-查询单条日志)
  - [删除单条日志](#6-删除单条日志)
  - [批量删除日志](#7-批量删除日志)
- [数据结构](#数据结构)
- [错误码参考](#错误码参考)
- [最佳实践](#最佳实践)

---

## 认证

所有 `/api/*` 接口均需认证。支持两种方式 (任选其一):

**方式一: Authorization Header (推荐)**

```http
Authorization: Bearer <API_KEY>
```

**方式二: X-API-Key Header**

```http
X-API-Key: <API_KEY>
```

未认证或 Key 错误时返回:

```json
HTTP/1.1 401 Unauthorized

{
  "success": false,
  "error": "Unauthorized"
}
```

---

## 限流

写入接口有基于 IP 的频率限制:

| 接口 | 限制 |
|------|------|
| `POST /api/logs` | 60 次/分钟 |
| `POST /api/logs/batch` | 20 次/分钟 |

每次请求都会返回以下响应头, 可据此调整调用频率:

| 响应头 | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 时间窗口内最大请求数 |
| `X-RateLimit-Remaining` | 剩余可用请求数 |
| `X-RateLimit-Reset` | 限流窗口重置时间 (Unix 时间戳, 秒) |

触发限流时返回:

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

---

## 统一响应格式

所有接口均返回 JSON, 遵循统一结构:

**成功:**

```json
{
  "success": true,
  "data": { ... }
}
```

**失败:**

```json
{
  "success": false,
  "error": "错误描述信息"
}
```

---

## 接口列表

### 1. 服务信息

获取服务名称和版本号, 无需认证。

```
GET /api
```

**响应示例:**

```json
{
  "name": "FlareLog",
  "version": "0.2.0",
  "description": "Lightweight log service on Cloudflare Workers + D1"
}
```

---

### 2. 写入单条日志

```
POST /api/logs
```

**请求头:**

| Header | 值 |
|--------|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <API_KEY>` |

**请求体:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `service` | string | **是** | 服务名称, 最长 128 字符 |
| `message` | string | **是** | 日志消息, 最长 65536 字符 |
| `level` | string | 否 | 日志级别: `debug` / `info` / `warn` / `error`, 默认 `info` |
| `timestamp` | string | 否 | 日志时间 (ISO 8601), 缺省使用服务器当前时间 |
| `trace_id` | string | 否 | 链路追踪 ID, 最长 128 字符 |
| `metadata` | object | 否 | 附加元数据, 必须是 JSON 对象, 序列化后最长 65536 字符 |

> **注意**: `level` 传入无效值时不会报错, 会自动降级为 `info`。

**请求示例:**

```json
{
  "level": "error",
  "service": "api-gateway",
  "message": "Connection timeout to database",
  "timestamp": "2025-04-30T10:00:00.000Z",
  "trace_id": "abc-123-def",
  "metadata": {
    "host": "db-primary",
    "port": 5432,
    "retry_count": 3
  }
}
```

**成功响应 (201):**

```json
{
  "success": true,
  "data": {
    "id": 1
  }
}
```

`id` 为日志的唯一标识, 可用于后续查询和删除。

---

### 3. 批量写入日志

批量写入多条日志, 在同一事务中执行, 保证原子性 (全部成功或全部失败)。

```
POST /api/logs/batch
```

**请求头:**

同单条接口, 请求体最大 5MB。

**请求体:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `logs` | LogEntry[] | **是** | 日志数组, 1-100 条 |

每条 LogEntry 的字段与单条接口相同。

**请求示例:**

```json
{
  "logs": [
    {
      "level": "info",
      "service": "auth-service",
      "message": "User login successful",
      "trace_id": "req-001"
    },
    {
      "level": "warn",
      "service": "auth-service",
      "message": "Rate limit approaching",
      "trace_id": "req-001"
    },
    {
      "level": "error",
      "service": "db-service",
      "message": "Query execution failed",
      "trace_id": "req-002",
      "metadata": {
        "query": "SELECT * FROM users WHERE id = ?",
        "error_code": "SQLITE_BUSY"
      }
    }
  ]
}
```

**成功响应 (201):**

```json
{
  "success": true,
  "data": {
    "inserted": 3,
    "ids": [2, 3, 4]
  }
}
```

**校验失败示例 (400):**

```json
{
  "success": false,
  "error": "logs[2]: service is required and must be a string"
}
```

> 错误信息中会标注具体是数组中第几条 (从 0 开始) 校验失败。

---

### 4. 查询日志列表

```
GET /api/logs
```

**查询参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `level` | string | - | 按单个级别过滤: `debug` / `info` / `warn` / `error` |
| `levels` | string | - | 按多个级别过滤, 逗号分隔, 如 `error,warn` |
| `service` | string | - | 按服务名称精确匹配 |
| `trace_id` | string | - | 按链路追踪 ID 精确匹配 |
| `message` | string | - | 消息内容模糊搜索 (包含即匹配) |
| `start_time` | string | - | 起始时间 (ISO 8601, 包含边界) |
| `end_time` | string | - | 结束时间 (ISO 8601, 包含边界) |
| `limit` | number | 50 | 每页条数, 范围 1-200 |
| `offset` | number | 0 | 分页偏移量 |
| `sort` | string | `timestamp` | 排序字段: `timestamp` 或 `created_at` |
| `order` | string | `desc` | 排序方向: `asc` 或 `desc` |

> `level` 和 `levels` 可以同时使用, 结果会自动合并去重。

**请求示例:**

```
GET /api/logs?level=error&service=api-gateway&limit=20&offset=0
```

**成功响应:**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": 1,
        "level": "error",
        "service": "api-gateway",
        "message": "Connection timeout to database",
        "timestamp": "2025-04-30T10:00:00.000Z",
        "trace_id": "abc-123-def",
        "metadata": {
          "host": "db-primary",
          "port": 5432,
          "retry_count": 3
        },
        "created_at": "2025-04-30T10:00:01.000Z"
      }
    ],
    "total": 42,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

**分页说明:**

| 字段 | 说明 |
|------|------|
| `total` | 符合条件的日志总数 |
| `limit` | 当前页大小 |
| `offset` | 当前偏移量 |
| `has_more` | 是否还有更多数据 (用于判断是否继续翻页) |

翻页公式: `offset += limit`, 直到 `has_more` 为 `false`。

---

### 5. 查询单条日志

```
GET /api/logs/:id
```

**路径参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 日志 ID (写入时返回) |

**成功响应:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "level": "error",
    "service": "api-gateway",
    "message": "Connection timeout to database",
    "timestamp": "2025-04-30T10:00:00.000Z",
    "trace_id": "abc-123-def",
    "metadata": {
      "host": "db-primary",
      "port": 5432
    },
    "created_at": "2025-04-30T10:00:01.000Z"
  }
}
```

---

### 6. 删除单条日志

```
DELETE /api/logs/:id
```

**路径参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | number | 日志 ID |

**成功响应:**

```json
{
  "success": true,
  "data": {
    "deleted": 1
  }
}
```

`deleted` 为实际删除的条数 (0 或 1)。

---

### 7. 批量删除日志

按条件批量删除日志, **至少需要提供一个参数**, 以防误操作清空所有数据。

```
DELETE /api/logs
```

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `service` | string | 否* | 按服务名称删除 |
| `before` | string | 否* | 删除该时间之前的日志 (ISO 8601) |

> *两个参数至少提供一个, 可同时使用 (取 AND 条件)。

**请求示例:**

```
DELETE /api/logs?service=api-gateway&before=2025-04-01T00:00:00.000Z
```

含义: 删除 `api-gateway` 服务在 `2025-04-01` 之前的所有日志。

**成功响应:**

```json
{
  "success": true,
  "data": {
    "deleted": 15
  }
}
```

---

## 数据结构

### LogEntry (写入时的日志条目)

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `service` | string | 是 | 服务名称, 最长 128 字符 |
| `message` | string | 是 | 日志消息, 最长 65536 字符 |
| `level` | string | 否 | `debug` / `info` / `warn` / `error`, 默认 `info` |
| `timestamp` | string | 否 | ISO 8601 格式, 默认服务器当前时间 |
| `trace_id` | string | 否 | 链路追踪 ID, 最长 128 字符 |
| `metadata` | object | 否 | JSON 对象, 序列化后最长 65536 字符 |

### StoredLog (查询返回的日志条目)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 日志唯一 ID |
| `level` | string | 日志级别 |
| `service` | string | 服务名称 |
| `message` | string | 日志消息 |
| `timestamp` | string | 日志时间 (调用方指定或自动生成) |
| `trace_id` | string \| null | 链路追踪 ID |
| `metadata` | object \| null | 附加元数据 |
| `created_at` | string | 日志入库时间 (服务器生成) |

> `timestamp` 是日志事件发生的时间 (由调用方指定), `created_at` 是日志写入数据库的时间 (服务器自动生成)。两者可能不同。

---

## 错误码参考

| HTTP 状态码 | 含义 | 常见原因 |
|:-----------:|------|----------|
| 400 | 请求参数错误 | 缺少必填字段, 字段类型错误, 参数格式无效 |
| 401 | 未认证 | 未提供 API Key, Key 格式错误, Key 不匹配 |
| 404 | 资源不存在 | 查询/删除的日志 ID 不存在 |
| 413 | 请求体过大 | 单条超过 1MB, 批量超过 5MB |
| 415 | Content-Type 错误 | 未设置 `application/json` |
| 429 | 请求频率超限 | 超过限流阈值, 参见 `Retry-After` 响应头 |
| 500 | 服务器内部错误 | 数据库操作失败等, 可重试 |

---

## 最佳实践

### 日志写入

1. **使用批量接口**: 需要写入多条日志时, 优先使用 `POST /api/logs/batch`, 减少网络开销
2. **指定 timestamp**: 建议在写入时明确指定 `timestamp`, 避免因网络延迟导致时间偏差
3. **利用 trace_id**: 为同一请求链路上的日志设置相同的 `trace_id`, 方便后续关联查询
4. **合理使用 metadata**: 将结构化信息放入 `metadata` (如错误码、耗时、请求参数等), 而非拼入 `message`

### 日志查询

1. **缩小查询范围**: 始终指定 `start_time` / `end_time`, 减少扫描数据量, 提升查询速度
2. **使用 has_more 翻页**: 通过 `has_more` 字段判断是否继续请求下一页, 而非自行计算
3. **按需选择排序字段**: `timestamp` 按日志事件时间排序, `created_at` 按入库时间排序

### 日志清理

1. **定期清理**: 使用 `DELETE /api/logs?before=<date>` 定期清理过期日志, 控制 D1 存储用量
2. **先查后删**: 不确定数据量时, 可先 `GET /api/logs` 查看总数, 再执行删除

### 调用示例 (curl)

```bash
# 写入单条日志
curl -X POST https://your-worker.workers.dev/api/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"level":"error","service":"my-app","message":"Something went wrong"}'

# 查询最近错误日志
curl "https://your-worker.workers.dev/api/logs?level=error&limit=10" \
  -H "Authorization: Bearer your-api-key"

# 按 trace_id 关联查询
curl "https://your-worker.workers.dev/api/logs?trace_id=req-001" \
  -H "Authorization: Bearer your-api-key"

# 清理 30 天前的日志
curl -X DELETE "https://your-worker.workers.dev/api/logs?before=2025-03-31T00:00:00.000Z" \
  -H "Authorization: Bearer your-api-key"
```
