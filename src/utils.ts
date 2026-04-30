import type { LogEntry, StoredLog } from './types'

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error'])

/** 校验日志级别是否合法 */
export function isValidLevel(level: string): boolean {
  return VALID_LEVELS.has(level)
}

/**
 * 将外部传入的 LogEntry 标准化为数据库写入格式
 * - level 不合法时降级为 info
 * - timestamp 缺失时使用当前时间
 * - metadata 对象序列化为 JSON 字符串
 */
export function normalizeLog(entry: LogEntry): {
  level: string
  service: string
  message: string
  timestamp: string
  trace_id: string | null
  metadata: string | null
} {
  const level = VALID_LEVELS.has(entry.level) ? entry.level : 'info'
  const timestamp = entry.timestamp || new Date().toISOString()
  const trace_id = entry.trace_id || null
  const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null

  return {
    level,
    service: entry.service,
    message: entry.message,
    timestamp,
    trace_id,
    metadata,
  }
}

/** 将数据库行记录转换为 StoredLog 结构, metadata 从 JSON 字符串反序列化为对象 */
export function rowToStoredLog(row: Record<string, unknown>): StoredLog {
  return {
    id: row.id as number,
    level: row.level as StoredLog['level'],
    service: row.service as string,
    message: row.message as string,
    timestamp: row.timestamp as string,
    trace_id: row.trace_id as string | undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    created_at: row.created_at as string,
  }
}
