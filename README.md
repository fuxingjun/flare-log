# FlareLog

轻量级 Cloudflare Workers + D1 日志接收与查询服务。

## 特性

- 结构化 JSON 日志接收 (单条 / 批量)
- 按时间、level、service、trace_id 等多维度过滤查询
- 内置 Web UI 日志查看器 + API 文档页面
- API Key 认证 + IP 限流
- 数据库自动初始化, 零配置部署
- 极致轻量, 适合个人项目与中小型应用

## 快速开始

```bash
npm install
npm run dev
```

## 部署

```bash
npm run deploy
```

部署时无需修改任何代码, 只需在 Cloudflare Dashboard 中完成以下配置:

1. 创建 D1 数据库
2. 在 Worker 的 Settings > Bindings 中绑定 D1 数据库, 变量名设为 `DB`
3. 在 Worker 的 Settings > Environment Variables 中添加 `API_KEY` 环境变量

数据库表和索引会在首次请求时自动创建, 无需手动执行 SQL。

## API 概览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| `GET` | `/api` | 服务信息 | 否 |
| `POST` | `/api/logs` | 接收单条日志 | 是 |
| `POST` | `/api/logs/batch` | 批量接收日志 (≤100条) | 是 |
| `GET` | `/api/logs` | 查询日志 (过滤 + 分页 + 排序) | 是 |
| `GET` | `/api/logs/:id` | 查询单条日志 | 是 |
| `DELETE` | `/api/logs/:id` | 删除单条日志 | 是 |
| `DELETE` | `/api/logs` | 批量清理日志 (按 service/before) | 是 |

认证方式: `Authorization: Bearer <key>` 或 `X-API-Key: <key>`

> 完整的接口文档 (请求/响应示例、参数约束、错误码、最佳实践等) 请参阅 [API.md](docs/API.md) 或访问 `/docs` 页面。

## 数据库表结构

```sql
CREATE TABLE logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL DEFAULT 'info',
  service    TEXT NOT NULL,
  message    TEXT NOT NULL,
  trace_id   TEXT,
  metadata   TEXT,          -- JSON 字符串
  timestamp  TEXT NOT NULL, -- 日志时间 (由调用方指定或自动生成)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))  -- 入库时间
);
```

已建索引: `timestamp`, `level`, `service`, `trace_id`, 以及 `(service, level)`, `(service, timestamp)`, `(level, timestamp)`, `(trace_id, timestamp)`, `(service, level, timestamp)` 等复合索引。

## Web UI

- **日志查看器**: 访问 Worker 根 URL, 在 Settings 面板配置 API Base URL 和 API Key 后即可查询日志
- **API 文档**: 访问 `/docs` 查看交互式 API 文档


