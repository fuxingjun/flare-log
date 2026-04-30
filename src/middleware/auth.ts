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
      {
        success: false,
        error: 'API_KEY not configured',
        detail: 'Please add API_KEY in Cloudflare Dashboard > Worker Settings > Environment Variables.',
      },
      500,
    )
  }

  // 优先从 Authorization header 获取, 其次从 X-API-Key 获取
  const authHeader = c.req.header('Authorization')
  const xApiKey = c.req.header('X-API-Key')

  let providedKey: string | undefined
  let authMethod = ''

  if (authHeader?.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7)
    authMethod = 'Authorization: Bearer'
  } else if (xApiKey) {
    providedKey = xApiKey
    authMethod = 'X-API-Key'
  }

  if (!providedKey) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: missing authentication',
        detail: 'Provide API key via Authorization: Bearer <key> or X-API-Key: <key> header.',
      },
      401,
    )
  }

  if (providedKey !== apiKey) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: invalid API key',
        detail: `The key provided via ${authMethod} does not match the configured API_KEY.`,
      },
      401,
    )
  }

  await next()
})
