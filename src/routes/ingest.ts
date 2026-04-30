import { Hono } from 'hono'
import type { Env, LogEntry, BatchLogPayload, ApiResponse } from '../types'
import { normalizeLog } from '../utils'

/** 单条日志请求体的最大允许大小 (1MB) */
const MAX_SINGLE_BODY_SIZE = 1024 * 1024

/** 批量日志请求体的最大允许大小 (5MB) */
const MAX_BATCH_BODY_SIZE = 5 * 1024 * 1024

/** service 字段最大长度 */
const MAX_SERVICE_LENGTH = 128

/** message 字段最大长度 */
const MAX_MESSAGE_LENGTH = 65536

/** trace_id 字段最大长度 */
const MAX_TRACE_ID_LENGTH = 128

/** metadata JSON 最大长度 */
const MAX_METADATA_LENGTH = 65536

/**
 * 安全地解析请求体 JSON
 * - 检查 Content-Type
 * - 检查请求体大小
 * - 捕获 JSON 解析异常, 返回友好的 400 错误
 */
async function safeParseJson<T>(c: import('hono').Context<{ Bindings: Env }>, maxSize: number): Promise<T | Response> {
  const contentType = c.req.header('Content-Type')
  if (!contentType?.includes('application/json')) {
    return c.json<ApiResponse>(
      { success: false, error: 'Content-Type must be application/json', detail: `Received: ${contentType || '(none)'}` },
      415,
    )
  }

  const contentLength = c.req.header('Content-Length')
  if (contentLength && Number(contentLength) > maxSize) {
    return c.json<ApiResponse>(
      { success: false, error: 'Request body too large', detail: `Max size: ${maxSize} bytes, received: ${contentLength} bytes` },
      413,
    )
  }

  try {
    return await c.req.json<T>()
  } catch (parseErr) {
    return c.json<ApiResponse>(
      { success: false, error: 'Invalid JSON in request body', detail: parseErr instanceof Error ? parseErr.message : undefined },
      400,
    )
  }
}

/** 校验单条日志条目的字段合法性 */
function validateLogEntry(entry: Partial<LogEntry>): string | null {
  if (!entry.service || typeof entry.service !== 'string') {
    return 'service is required and must be a string'
  }
  if (entry.service.length > MAX_SERVICE_LENGTH) {
    return `service must not exceed ${MAX_SERVICE_LENGTH} characters`
  }
  if (!entry.message || typeof entry.message !== 'string') {
    return 'message is required and must be a string'
  }
  if (entry.message.length > MAX_MESSAGE_LENGTH) {
    return `message must not exceed ${MAX_MESSAGE_LENGTH} characters`
  }
  if (entry.trace_id !== undefined && entry.trace_id !== null) {
    if (typeof entry.trace_id !== 'string') {
      return 'trace_id must be a string'
    }
    if (entry.trace_id.length > MAX_TRACE_ID_LENGTH) {
      return `trace_id must not exceed ${MAX_TRACE_ID_LENGTH} characters`
    }
  }
  if (entry.metadata !== undefined && entry.metadata !== null) {
    if (typeof entry.metadata !== 'object' || Array.isArray(entry.metadata)) {
      return 'metadata must be a JSON object'
    }
    try {
      const serialized = JSON.stringify(entry.metadata)
      if (serialized.length > MAX_METADATA_LENGTH) {
        return `metadata must not exceed ${MAX_METADATA_LENGTH} characters when serialized`
      }
    } catch {
      return 'metadata must be serializable to JSON'
    }
  }
  if (entry.timestamp !== undefined && entry.timestamp !== null) {
    if (typeof entry.timestamp !== 'string') {
      return 'timestamp must be a string'
    }
    if (isNaN(Date.parse(entry.timestamp))) {
      return 'timestamp must be a valid ISO 8601 date string'
    }
  }
  return null
}

const app = new Hono<{ Bindings: Env }>()

/** 接收单条日志并写入 D1 */
app.post('/', async (c) => {
  const parsed = await safeParseJson<LogEntry>(c, MAX_SINGLE_BODY_SIZE)
  if (parsed instanceof Response) return parsed

  const body = parsed
  const validationError = validateLogEntry(body)
  if (validationError) {
    return c.json<ApiResponse>({ success: false, error: validationError }, 400)
  }

  const log = normalizeLog(body)

  const result = await c.env.DB.prepare(
    'INSERT INTO logs (level, service, message, timestamp, trace_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(log.level, log.service, log.message, log.timestamp, log.trace_id, log.metadata)
    .run()

  if (!result.success) {
    return c.json<ApiResponse>(
      { success: false, error: 'Failed to insert log', detail: `D1 insert returned success=false for service="${log.service}"` },
      500,
    )
  }

  return c.json<ApiResponse<{ id: number }>>(
    { success: true, data: { id: result.meta.last_row_id as number } },
    201,
  )
})

/**
 * 批量接收日志并写入 D1
 * - 单次最多 100 条
 * - 使用 D1 batch API 在同一事务中写入, 保证原子性
 */
app.post('/batch', async (c) => {
  const parsed = await safeParseJson<BatchLogPayload>(c, MAX_BATCH_BODY_SIZE)
  if (parsed instanceof Response) return parsed

  const body = parsed

  if (!body.logs || !Array.isArray(body.logs) || body.logs.length === 0) {
    return c.json<ApiResponse>(
      { success: false, error: 'logs array is required and must not be empty' },
      400,
    )
  }

  if (body.logs.length > 100) {
    return c.json<ApiResponse>(
      { success: false, error: 'Batch size must not exceed 100' },
      400,
    )
  }

  // 预校验所有条目的字段合法性
  for (let i = 0; i < body.logs.length; i++) {
    const validationError = validateLogEntry(body.logs[i])
    if (validationError) {
      return c.json<ApiResponse>(
        { success: false, error: `logs[${i}]: ${validationError}` },
        400,
      )
    }
  }

  const stmt = c.env.DB.prepare(
    'INSERT INTO logs (level, service, message, timestamp, trace_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
  )

  const batch = body.logs.map((entry) => {
    const log = normalizeLog(entry)
    return stmt.bind(log.level, log.service, log.message, log.timestamp, log.trace_id, log.metadata)
  })

  const results = await c.env.DB.batch(batch)
  const insertedIds = results.map((r) => r.meta.last_row_id as number)

  return c.json<ApiResponse<{ inserted: number; ids: number[] }>>(
    { success: true, data: { inserted: insertedIds.length, ids: insertedIds } },
    201,
  )
})

export { app as ingest }
