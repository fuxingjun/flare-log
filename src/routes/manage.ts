import { Hono } from 'hono'
import type { Env, ApiResponse } from '../types'

const app = new Hono<{ Bindings: Env }>()

/**
 * 删除指定 ID 的日志
 * 路径: DELETE /api/logs/:id
 */
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))

  if (isNaN(id) || id <= 0) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid log id', detail: `Received: ${c.req.param('id')}` }, 400)
  }

  try {
    const result = await c.env.DB.prepare('DELETE FROM logs WHERE id = ?')
      .bind(id)
      .run()

    if (result.meta.changes === 0) {
      return c.json<ApiResponse>({ success: false, error: 'Log not found' }, 404)
    }

    return c.json<ApiResponse<{ deleted: number }>>(
      { success: true, data: { deleted: result.meta.changes as number } },
    )
  } catch (err) {
    console.error('Delete error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Failed to delete log', detail: err instanceof Error ? err.message : undefined }, 500)
  }
})

/**
 * 批量清理日志
 * 支持按时间范围和/或 service 清理
 * 路径: DELETE /api/logs
 * 查询参数: service, before (ISO 8601 时间戳, 删除该时间之前的日志)
 * 至少需要提供一个参数, 防止误操作清空所有日志
 */
app.delete('/', async (c) => {
  const service = c.req.query('service')
  const before = c.req.query('before')

  if (!service && !before) {
    return c.json<ApiResponse>(
      { success: false, error: 'At least one of service or before is required', detail: 'Provide ?service=<name> and/or ?before=<ISO8601> to specify which logs to delete.' },
      400,
    )
  }

  // 校验 before 参数格式
  if (before && isNaN(Date.parse(before))) {
    return c.json<ApiResponse>(
      { success: false, error: 'before must be a valid ISO 8601 date string', detail: `Received: ${before}` },
      400,
    )
  }

  const conditions: string[] = []
  const bindings: unknown[] = []

  if (service) {
    conditions.push('service = ?')
    bindings.push(service)
  }
  if (before) {
    conditions.push('timestamp < ?')
    bindings.push(before)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  try {
    const result = await c.env.DB.prepare(
      `DELETE FROM logs ${whereClause}`,
    )
      .bind(...bindings)
      .run()

    return c.json<ApiResponse<{ deleted: number }>>(
      { success: true, data: { deleted: result.meta.changes as number } },
    )
  } catch (err) {
    console.error('Batch delete error:', err)
    return c.json<ApiResponse>(
      { success: false, error: 'Failed to delete logs', detail: err instanceof Error ? err.message : undefined },
      500,
    )
  }
})

export { app as manage }
