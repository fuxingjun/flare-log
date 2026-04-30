/**
 * 数据库自动初始化模块
 * 在 Worker 首次收到请求时自动创建表和索引, 无需手动执行 SQL
 * 所有 DDL 均使用 IF NOT EXISTS, 确保幂等安全
 */

/** D1 的 exec() 一次只能执行一条 SQL, 需要将多条语句拆开 */
const INIT_STATEMENTS = [
  // 建表
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL DEFAULT 'info',
    service TEXT NOT NULL,
    message TEXT NOT NULL,
    trace_id TEXT,
    metadata TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // 基础索引
  'CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)',
  'CREATE INDEX IF NOT EXISTS idx_logs_service ON logs(service)',
  'CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id)',
  'CREATE INDEX IF NOT EXISTS idx_logs_service_level ON logs(service, level)',
  // 复合索引, 优化常见查询场景
  'CREATE INDEX IF NOT EXISTS idx_logs_service_timestamp ON logs(service, timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_logs_level_timestamp ON logs(level, timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_logs_trace_id_timestamp ON logs(trace_id, timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_logs_service_level_timestamp ON logs(service, level, timestamp DESC)',
]

/**
 * 初始化数据库: 创建表和索引
 * 使用全局标记避免重复执行, 同一 Worker 实例只会初始化一次
 * 即使多个实例并发执行, IF NOT EXISTS 也保证了幂等性
 */
export async function initDatabase(db: D1Database): Promise<void> {
  if (globalThis.__flareLogInitialized) return

  try {
    // D1 的 exec() 一次只能执行一条 SQL, 逐条执行
    for (const sql of INIT_STATEMENTS) {
      await db.exec(sql)
    }
    globalThis.__flareLogInitialized = true
    console.log('FlareLog: database initialized successfully')
  } catch (err) {
    console.error('FlareLog: database initialization failed:', err)
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __flareLogInitialized: boolean | undefined
}
