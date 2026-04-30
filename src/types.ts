/** 日志级别类型 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 接收日志时的请求体结构 */
export interface LogEntry {
  level: LogLevel
  service: string
  message: string
  timestamp?: string
  trace_id?: string
  metadata?: Record<string, unknown>
}

/** 从数据库读取的完整日志结构 */
export interface StoredLog extends LogEntry {
  id: number
  timestamp: string
  created_at: string
}

/** 批量接收日志的请求体结构 */
export interface BatchLogPayload {
  logs: LogEntry[]
}

/** 查询日志时的过滤参数 */
export interface LogQueryParams {
  level?: LogLevel
  levels?: string
  service?: string
  trace_id?: string
  message?: string
  start_time?: string
  end_time?: string
  limit?: number
  offset?: number
  sort?: 'timestamp' | 'created_at'
  order?: 'asc' | 'desc'
}

/** 分页响应结构 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

/** 统一 API 响应结构 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** Cloudflare Workers 环境变量绑定, 部署时在 Cloudflare Dashboard 中配置 */
type Env = {
  DB: D1Database
  API_KEY: string
}

export type { Env }
