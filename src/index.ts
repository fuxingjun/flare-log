import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './types'
import { auth } from './middleware/auth'
import { ingest } from './routes/ingest'
import { query } from './routes/query'

const app = new Hono<{ Bindings: Env }>()

// 全局中间件
app.use('*', cors())
app.use('*', logger())

// API 路由需要认证
app.use('/api/*', auth)

// 服务信息, 无需认证
app.get('/', (c) => {
  return c.json({
    name: 'FlareLog',
    version: '0.1.0',
    description: 'Lightweight log service on Cloudflare Workers + D1',
  })
})

// 注册业务路由
app.route('/api/logs', ingest)
app.route('/api/logs', query)

app.notFound((c) => {
  return c.json({ success: false, error: 'Not Found' }, 404)
})

app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ success: false, error: 'Internal Server Error' }, 500)
})

export default app
