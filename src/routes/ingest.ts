import { Hono } from 'hono'
import type { Env, LogEntry, BatchLogPayload, ApiResponse, StoredLog } from '../types'

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error'])

/**
 * 将外部传入的 LogEntry 标准化为数据库写入格式
 * - level 不合法时降级为 info
 * - timestamp 缺失时使用当前时间
 * - metadata 对象序列化为 JSON 字符串
 */
function normalizeLog(entry: LogEntry): {
  level: string
  service: string
  message: string
  timestamp: string
  trace_id: string | null
  metadata: string | null
} {
  const level = VALID_LEVELS.has(entry.level) ? entry.level : 'info'
  const timestamp = entry.timestamp || new Date().toISOString()
  const trace_id = entry.trace_id || null
  const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null

  return {
    level,
    service: entry.service,
    message: entry.message,
    timestamp,
    trace_id,
    metadata,
  }
}

/** 将数据库行记录转换为 StoredLog 结构, metadata 从 JSON 字符串反序列化为对象 */
function rowToStoredLog(row: Record<string, unknown>): StoredLog {
  return {
    id: row.id as number,
    level: row.level as StoredLog['level'],
    service: row.service as string,
    message: row.message as string,
    timestamp: row.timestamp as string,
    trace_id: row.trace_id as string | undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    created_at: row.created_at as string,
  }
}

const app = new Hono<{ Bindings: Env }>()

/** 接收单条日志并写入 D1 */
app.post('/', async (c) => {
  const body = await c.req.json<LogEntry>()

  if (!body.service || !body.message) {
    return c.json<ApiResponse>(
      { success: false, error: 'service and message are required' },
      400,
    )
  }

  const log = normalizeLog(body)

  const result = await c.env.DB.prepare(
    'INSERT INTO logs (level, service, message, timestamp, trace_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(log.level, log.service, log.message, log.timestamp, log.trace_id, log.metadata)
    .run()

  if (!result.success) {
    return c.json<ApiResponse>({ success: false, error: 'Failed to insert log' }, 500)
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
  const body = await c.req.json<BatchLogPayload>()

  if (!body.logs || !Array.isArray(body.logs) || body.logs.length === 0) {
    return c.json<ApiResponse>(
      { success: false, error: 'logs array is required and must not be empty' },
      400,
    )
  }

  // 限制单次批量大小, 防止 D1 请求超时
  if (body.logs.length > 100) {
    return c.json<ApiResponse>(
      { success: false, error: 'Batch size must not exceed 100' },
      400,
    )
  }

  // 预校验所有条目的必填字段
  for (const entry of body.logs) {
    if (!entry.service || !entry.message) {
      return c.json<ApiResponse>(
        { success: false, error: 'Each log entry must have service and message' },
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

export { app as ingest, rowToStoredLog }
