import { createMiddleware } from 'hono/factory'
import type { Env } from '../types'

/** 单个 IP 的限流记录 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

/** 限流配置 */
interface RateLimitOptions {
  /** 时间窗口 (毫秒) */
  windowMs: number
  /** 时间窗口内最大请求数 */
  maxRequests: number
}

/**
 * 基于 IP 的简单内存限流中间件
 * 注意: Cloudflare Workers 可能会在不同实例间重启, 此限流为尽力而为
 * 对于生产环境, 建议使用 Cloudflare 自带的 Rate Limiting 规则
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, maxRequests } = options

  // 内存存储: IP -> 限流记录
  const store = new Map<string, RateLimitEntry>()

  // 定期清理过期记录, 防止内存泄漏
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(ip)
      }
    }
  }, windowMs)

  // Workers 环境下不需要清理定时器, 但防止引用丢失
  if (typeof clearInterval === 'function') {
    // 保持 interval 引用, 防止被 GC
    globalThis.__flareLogCleanupInterval = cleanupInterval
  }

  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown'
    const now = Date.now()

    let entry = store.get(ip)

    // 如果记录不存在或已过期, 创建新记录
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(ip, entry)
    }

    entry.count++

    // 设置响应头, 让客户端了解限流状态
    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > maxRequests) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return c.json(
        { success: false, error: 'Too many requests, please try again later' },
        429,
      )
    }

    await next()
  })
}

// 扩展 globalThis 类型以存储清理定时器引用
declare global {
  // eslint-disable-next-line no-var
  var __flareLogCleanupInterval: ReturnType<typeof setInterval> | undefined
}
