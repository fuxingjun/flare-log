-- 优化按时间范围 + service 过滤的查询场景
CREATE INDEX IF NOT EXISTS idx_logs_service_timestamp ON logs(service, timestamp DESC);

-- 优化按时间范围 + level 过滤的查询场景
CREATE INDEX IF NOT EXISTS idx_logs_level_timestamp ON logs(level, timestamp DESC);

-- 优化按 trace_id 查询 (通常配合时间排序)
CREATE INDEX IF NOT EXISTS idx_logs_trace_id_timestamp ON logs(trace_id, timestamp DESC);

-- 优化按 service + level + 时间范围的复合查询
CREATE INDEX IF NOT EXISTS idx_logs_service_level_timestamp ON logs(service, level, timestamp DESC);
