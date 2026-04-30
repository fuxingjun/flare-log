import { Hono } from 'hono'
import type { Env, LogQueryParams, PaginatedResponse, StoredLog, ApiResponse, LogLevel } from '../types'
import { rowToStoredLog, isValidLevel } from '../utils'

const VALID_SORT_FIELDS = new Set(['timestamp', 'created_at'])
const VALID_ORDER_DIRS = new Set(['asc', 'desc'])

const app = new Hono<{ Bindings: Env }>()

/**
 * 解析 levels 参数 (逗号分隔的 level 列表)
 * 例如: "error,warn" -> ['error', 'warn']
 * 无效的 level 值会被忽略
 */
function parseLevels(levelsStr: string | undefined): LogLevel[] {
  if (!levelsStr) return []
  return levelsStr
    .split(',')
    .map((l) => l.trim().toLowerCase())
    .filter((l): l is LogLevel => isValidLevel(l))
}

/**
 * 查询日志列表
 * 支持按 level, levels(多选), service, trace_id, message(模糊搜索), 时间范围过滤
 * 支持分页, 排序字段和方向可配置
 */
app.get('/', async (c) => {
  const rawLevel = c.req.query('level')
  const rawLevels = c.req.query('levels')
  const rawService = c.req.query('service')
  const rawTraceId = c.req.query('trace_id')
  const rawMessage = c.req.query('message')
  const rawStartTime = c.req.query('start_time')
  const rawEndTime = c.req.query('end_time')
  const rawSort = c.req.query('sort') || 'timestamp'
  const rawOrder = c.req.query('order') || 'desc'

  if (rawLevel && !isValidLevel(rawLevel)) {
    return c.json<ApiResponse>(
      { success: false, error: `Invalid level: ${rawLevel}. Valid values: debug, info, warn, error` },
      400,
    )
  }

  const levels = parseLevels(rawLevels)
  const effectiveLevels: LogLevel[] = rawLevel
    ? [...new Set([rawLevel as LogLevel, ...levels])]
    : levels

  if (!VALID_SORT_FIELDS.has(rawSort)) {
    return c.json<ApiResponse>(
      { success: false, error: `Invalid sort field: ${rawSort}. Valid values: timestamp, created_at` },
      400,
    )
  }
  if (!VALID_ORDER_DIRS.has(rawOrder)) {
    return c.json<ApiResponse>(
      { success: false, error: `Invalid order: ${rawOrder}. Valid values: asc, desc` },
      400,
    )
  }

  const params: LogQueryParams = {
    service: rawService,
    trace_id: rawTraceId,
    message: rawMessage,
    start_time: rawStartTime,
    end_time: rawEndTime,
    limit: Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200),
    offset: Math.max(Number(c.req.query('offset')) || 0, 0),
    sort: rawSort as 'timestamp' | 'created_at',
    order: rawOrder as 'asc' | 'desc',
  }

  const conditions: string[] = []
  const bindings: unknown[] = []

  if (effectiveLevels.length > 0) {
    const placeholders = effectiveLevels.map(() => '?').join(', ')
    conditions.push(`level IN (${placeholders})`)
    bindings.push(...effectiveLevels)
  }
  if (params.service) {
    conditions.push('service = ?')
    bindings.push(params.service)
  }
  if (params.trace_id) {
    conditions.push('trace_id = ?')
    bindings.push(params.trace_id)
  }
  if (params.message) {
    conditions.push('message LIKE ?')
    bindings.push(`%${params.message}%`)
  }
  if (params.start_time) {
    conditions.push('timestamp >= ?')
    bindings.push(params.start_time)
  }
  if (params.end_time) {
    conditions.push('timestamp <= ?')
    bindings.push(params.end_time)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM logs ${whereClause}`,
    )
      .bind(...bindings)
      .first<{ total: number }>()

    const total = countResult?.total ?? 0

    const rows = await c.env.DB.prepare(
      `SELECT * FROM logs ${whereClause} ORDER BY ${params.sort} ${params.order === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
    )
      .bind(...bindings, params.limit, params.offset)
      .all<Record<string, unknown>>()

    const data: StoredLog[] = (rows.results || []).map(rowToStoredLog)

    const response: PaginatedResponse<StoredLog> = {
      data,
      total,
      limit: params.limit!,
      offset: params.offset!,
      has_more: params.offset! + data.length < total,
    }

    return c.json<ApiResponse<PaginatedResponse<StoredLog>>>({ success: true, data: response })
  } catch (err) {
    console.error('Query error:', err)
    return c.json<ApiResponse>(
      { success: false, error: 'Failed to query logs', detail: err instanceof Error ? err.message : undefined },
      500,
    )
  }
})

/** 根据 ID 查询单条日志 */
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))

  if (isNaN(id) || id <= 0) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid log id', detail: `Received: ${c.req.param('id')}` }, 400)
  }

  try {
    const row = await c.env.DB.prepare('SELECT * FROM logs WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>()

    if (!row) {
      return c.json<ApiResponse>({ success: false, error: 'Log not found' }, 404)
    }

    return c.json<ApiResponse<StoredLog>>({ success: true, data: rowToStoredLog(row) })
  } catch (err) {
    console.error('Query by ID error:', err)
    return c.json<ApiResponse>(
      { success: false, error: 'Failed to query log', detail: err instanceof Error ? err.message : undefined },
      500,
    )
  }
})

export { app as query }
