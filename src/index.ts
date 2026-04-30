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
 * 同时检查 D1 绑定是否配置
 */
app.use('*', async (c, next) => {
  if (!c.env.DB) {
    return c.json(
      {
        success: false,
        error: 'D1 database not bound',
        detail: 'Please add a D1 binding named "DB" in Cloudflare Dashboard > Worker Settings > Bindings.',
      },
      500,
    )
  }
  try {
    await initDatabase(c.env.DB)
  } catch (err) {
    console.error('Database initialization failed:', err)
    return c.json(
      {
        success: false,
        error: 'Database initialization failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    )
  }
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
  return c.json({ success: false, error: 'Not Found', detail: `${c.req.method} ${c.req.path} does not exist` }, 404)
})

/**
 * 全局错误处理
 * - HTTPException: Hono 框架抛出的 HTTP 异常, 保留其状态码和消息
 * - TypeError: 通常是请求体解析失败, 返回 400
 * - 其它异常: 记录日志后返回 500
 * 环境变量缺失 (DB/API_KEY) 已在中间件层面主动检查, 不会走到这里
 */
app.onError((err, c) => {
  if (err instanceof Error && 'status' in err) {
    const httpErr = err as { status: number; message: string }
    const status = httpErr.status || 500
    if (status >= 400 && status < 500) {
      return c.json({ success: false, error: httpErr.message || 'Bad Request' }, status as 400)
    }
  }

  if (err instanceof TypeError) {
    return c.json({ success: false, error: 'Invalid request', detail: err.message }, 400)
  }

  console.error('Unhandled error:', err)
  return c.json({ success: false, error: 'Internal Server Error', detail: err instanceof Error ? err.message : undefined }, 500)
})

export default app
