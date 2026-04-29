import { Hono } from 'hono'
import type { Env, LogQueryParams, PaginatedResponse, StoredLog, ApiResponse } from '../types'
import { rowToStoredLog } from './ingest'

const app = new Hono<{ Bindings: Env }>()

/**
 * 查询日志列表
 * 支持按 level, service, trace_id, 时间范围过滤, 支持分页
 * 查询参数: level, service, trace_id, start_time, end_time, limit(1-200, 默认50), offset(默认0)
 */
app.get('/', async (c) => {
  const params: LogQueryParams = {
    level: c.req.query('level') as LogQueryParams['level'],
    service: c.req.query('service'),
    trace_id: c.req.query('trace_id'),
    start_time: c.req.query('start_time'),
    end_time: c.req.query('end_time'),
    // limit 范围限制在 1-200, 默认 50
    limit: Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200),
    offset: Math.max(Number(c.req.query('offset')) || 0, 0),
  }

  // 动态构建 WHERE 条件和绑定参数
  const conditions: string[] = []
  const bindings: unknown[] = []

  if (params.level) {
    conditions.push('level = ?')
    bindings.push(params.level)
  }
  if (params.service) {
    conditions.push('service = ?')
    bindings.push(params.service)
  }
  if (params.trace_id) {
    conditions.push('trace_id = ?')
    bindings.push(params.trace_id)
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

  // 先查总数用于分页计算
  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM logs ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ total: number }>()

  const total = countResult?.total ?? 0

  // 查询当前页数据, 按时间倒序排列
  const rows = await c.env.DB.prepare(
    `SELECT * FROM logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
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
})

/** 根据 ID 查询单条日志 */
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))

  if (isNaN(id)) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid log id' }, 400)
  }

  const row = await c.env.DB.prepare('SELECT * FROM logs WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>()

  if (!row) {
    return c.json<ApiResponse>({ success: false, error: 'Log not found' }, 404)
  }

  return c.json<ApiResponse<StoredLog>>({ success: true, data: rowToStoredLog(row) })
})

export { app as query }
