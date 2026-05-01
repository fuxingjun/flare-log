# FlareLog

轻量级 Cloudflare Workers + D1 日志接收与查询服务。

## 特性

- 结构化 JSON 日志接收 (单条 / 批量)
- 按时间、level、service、trace_id 等多维度过滤查询
- 内置 Web UI 日志查看器 + API 文档页面
- API Key 认证 + IP 限流
- 数据库自动初始化, 零配置部署
- 极致轻量, 适合个人项目与中小型应用

## 技术栈

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono
- **语言**: TypeScript
- **部署工具**: Wrangler (仅开发阶段使用, 生产部署时直接从 git 拉取代码配置环境变量等, 全程在 Cloudflare 即可完成)

## 项目结构

```
src/
├── index.ts                  # 应用入口, 路由注册, 中间件挂载, 全局错误处理
├── types.ts                  # TypeScript 类型定义 (LogEntry, StoredLog, LogQueryParams, Env 等)
├── db.ts                     # 数据库自动初始化 (建表 + 索引, 幂等安全)
├── utils.ts                  # 工具函数 (日志标准化, 行记录转换, level 校验)
├── middleware/
│   ├── auth.ts               # API Key 认证 (Bearer / X-API-Key)
│   └── rateLimit.ts          # 基于 IP 的内存限流 (尽力而为, 生产建议用 CF 自带规则)
└── routes/
    ├── ingest.ts             # 日志写入接口 (POST /, POST /batch)
    ├── query.ts              # 日志查询接口 (GET /, GET /services, GET /:id)
    └── manage.ts             # 日志删除接口 (DELETE /, DELETE /:id)
public/
├── index.html                # 前端日志查看器 (暗色主题, 单文件 SPA)
└── docs.html                 # API 文档页面
migrations/
├── 0001_initial.sql          # 初始表结构和基础索引
└── 0002_add_composite_indexes.sql  # 复合索引 (优化常见查询场景)
```

## 快速开始

```bash
npm install
npm run dev
```

## 部署

通过 Cloudflare 的 Git 集成部署, Fork 项目后修改配置, 后续推送代码会自动部署。

### 步骤

1. **Fork 本项目** 到你自己的 GitHub 仓库
2. **创建 D1 数据库**: 在 Cloudflare Dashboard > Workers & Pages > D1 中创建数据库, 记录生成的 `database_id`
3. **修改配置**: 将 Fork 仓库中 `wrangler.jsonc` 的 `database_id` 替换为你自己的
4. **连接 Git 仓库**: 在 Cloudflare Dashboard > Workers & Pages 中创建 Worker, 选择 "Connect to Git", 关联你 Fork 的仓库
5. **配置环境变量**: 在 Worker 的 Settings > Environment Variables 中添加 `API_KEY` (你的 API 密钥)
6. **首次部署**: 连接完成后 Cloudflare 会自动触发首次部署, 之后每次推送代码到仓库都会自动部署

数据库表结构会在首次请求时自动创建, 无需手动执行 SQL。

> **注意**: `wrangler.jsonc` 中配置了 `keep_vars: true`, 部署时会保留 Dashboard 中手动配置的环境变量, 不会被覆盖。

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

> 完整的接口文档 (请求/响应示例、参数约束、错误码、最佳实践等) 请参阅 [docs/API.md](docs/API.md) 或访问 `/docs` 页面。

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
