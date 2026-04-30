import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

/**
 * API Key 认证中间件
 * 支持两种认证方式: Authorization: Bearer <key> 或 X-API-Key: <key>
 * API_KEY 需在 Cloudflare Dashboard 的 Worker 环境变量中配置
 */
export const auth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const apiKey = c.env.API_KEY

  if (!apiKey) {
    return c.json(
      { success: false, error: 'API_KEY not configured. Please add API_KEY in Worker Settings > Environment Variables.' },
      500,
    )
  }

  // 优先从 Authorization header 获取, 其次从 X-API-Key 获取
  const authHeader = c.req.header('Authorization')
  const xApiKey = c.req.header('X-API-Key')

  let providedKey: string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7)
  } else if (xApiKey) {
    providedKey = xApiKey
  }

  if (!providedKey || providedKey !== apiKey) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  await next()
})
