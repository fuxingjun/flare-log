import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './types'
import { auth } from './middleware/auth'
import { rateLimit } from './middleware/rateLimit'
import { initDatabase } from './db'
import { ingest } from './routes/ingest'
import { query } from './routes/query'
import { manage } from './routes/manage'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())
app.use('*', logger())

/**
 * 数据库自动初始化中间件
 * 首次请求时自动创建表和索引, 后续请求跳过
 */
app.use('*', async (c, next) => {
  await initDatabase(c.env.DB)
  await next()
})

// API 写入接口限流: 每分钟最多 60 次请求
app.use('/api/logs', rateLimit({ windowMs: 60_000, maxRequests: 60 }))
app.use('/api/logs/batch', rateLimit({ windowMs: 60_000, maxRequests: 20 }))

app.use('/api/*', auth)

app.get('/', (c) => {
  return c.json({
    name: 'FlareLog',
    version: '0.2.0',
    description: 'Lightweight log service on Cloudflare Workers + D1',
  })
})

/** API 文档页面, 重定向到静态 HTML 文件, 无需认证 */
app.get('/docs', (c) => {
  return c.redirect('/docs.html')
})

app.route('/api/logs', ingest)
app.route('/api/logs', query)
app.route('/api/logs', manage)

app.notFound((c) => {
  return c.json({ success: false, error: 'Not Found' }, 404)
})

/**
 * 全局错误处理
 * - HTTPException: Hono 框架抛出的 HTTP 异常, 保留其状态码和消息
 * - TypeError: 通常是请求体解析失败或绑定缺失, 返回 400 或 500
 * - 其它异常: 记录日志后返回 500, 开发环境下附带错误信息
 */
app.onError((err, c) => {
  if (err instanceof Error && 'status' in err) {
    const httpErr = err as { status: number; message: string }
    const status = httpErr.status || 500
    if (status >= 400 && status < 500) {
      return c.json({ success: false, error: httpErr.message || 'Bad Request' }, status as 400)
    }
  }

  // TypeError 可能是 D1 绑定缺失 (Cannot read properties of undefined)
  if (err instanceof TypeError) {
    const msg = err.message
    if (msg.includes('undefined') || msg.includes('null')) {
      console.error('Binding error (likely missing D1 or env var):', err)
      return c.json(
        { success: false, error: 'Server configuration error - check D1 binding and environment variables' },
        500,
      )
    }
    return c.json({ success: false, error: 'Invalid request' }, 400)
  }

  console.error('Unhandled error:', err)
  return c.json({ success: false, error: 'Internal Server Error' }, 500)
})

export default app
