# AGENTS.md

**FlareLog** — 轻量级 Cloudflare Workers + D1 日志接收与查询服务

这是一个专为 Cloudflare 边缘环境设计的轻量日志系统, 目标是提供简单、快速、低成本的结构化日志服务。

## 项目目标

- 构建一个可在 Cloudflare 上完全部署的轻量日志服务 (Worker + D1)
- 支持结构化 JSON 日志接收 (单个或批量)
- 提供基本的查询接口 (按时间、level、service、trace_id 等过滤)
- 保持极致轻量, 适合个人项目、中小型应用使用
- 代码风格清晰、可维护, 优先使用 TypeScript + Hono
- 支持基本的权限认证 (基于 API Key)
- 包含一个简单的前端界面 (用于查看日志)
- 其它人部署时只需要在 Cloudflare 配置好 Worker 和 D1 数据库即可, 无需修改代码
- 未来逐步提升兼容性 (OpenTelemetry OTLP Logs 等), 设计时需要提前考虑兼容性和扩展性

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
    ├── query.ts              # 日志查询接口 (GET /, GET /:id)
    └── manage.ts             # 日志删除接口 (DELETE /, DELETE /:id)
public/
└── index.html                # 前端日志查看器 (暗色主题, 单文件 SPA)
migrations/
├── 0001_initial.sql          # 初始表结构和基础索引
└── 0002_add_composite_indexes.sql  # 复合索引 (优化常见查询场景)
```

## 部署方式

部署时无需修改任何代码, 只需在 Cloudflare Dashboard 中完成以下配置:

1. 创建 D1 数据库
2. 在 Worker 的 Settings > Bindings 中绑定 D1 数据库, 变量名设为 `DB`
3. 在 Worker 的 Settings > Environment Variables 中添加 `API_KEY` 环境变量
4. 使用 `npm run deploy` 或 `wrangler deploy` 部署

部署命令会自动上传 `public/` 目录中的前端页面和 Worker 代码。数据库表结构会在首次请求时自动创建, 无需手动执行 SQL。

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| `GET` | `/` | 服务信息 | 否 |
| `POST` | `/api/logs` | 接收单条日志 | 是 |
| `POST` | `/api/logs/batch` | 批量接收日志 (≤100条) | 是 |
| `GET` | `/api/logs` | 查询日志 (支持过滤+分页+排序) | 是 |
| `GET` | `/api/logs/:id` | 查询单条日志 | 是 |
| `DELETE` | `/api/logs/:id` | 删除单条日志 | 是 |
| `DELETE` | `/api/logs` | 批量清理日志 (按 service/before) | 是 |

认证方式: `Authorization: Bearer <key>` 或 `X-API-Key: <key>`

### 限流配置

- `POST /api/logs`: 每分钟 60 次/IP
- `POST /api/logs/batch`: 每分钟 20 次/IP

### 请求约束

- 单条日志请求体最大 1MB, 批量最大 5MB
- `service` 最长 128 字符, `message` 最长 65536 字符
- `trace_id` 最长 128 字符, `metadata` 序列化后最长 65536 字符
- 批量接口最多 100 条/次

### 查询参数 (GET /api/logs)

| 参数 | 说明 |
|------|------|
| `level` | 单个日志级别 (debug/info/warn/error) |
| `levels` | 多个级别, 逗号分隔 (如 `error,warn`) |
| `service` | 按服务名精确匹配 |
| `trace_id` | 按链路追踪 ID 精确匹配 |
| `message` | 消息内容模糊搜索 |
| `start_time` / `end_time` | 时间范围过滤 (ISO 8601) |
| `limit` | 每页条数 1-200, 默认 50 |
| `offset` | 分页偏移, 默认 0 |
| `sort` | 排序字段: `timestamp` / `created_at`, 默认 `timestamp` |
| `order` | 排序方向: `asc` / `desc`, 默认 `desc` |

## 代码规范

### 通用
- 代码文件行数太大的话最好按对应语言的最佳实践分拆文件, 特别是超过 1000 行的文件

### 文档
- 文档中的说明尽量使用中文
- 如果修改了文档中提及的内容, 需要及时更新文档

### 注释
- 新增代码时, 所有超过 8 行代码的函数或者方法以及代码块, 必须添加注释, 并且注释必须清晰明了
- 新增代码在关键的逻辑处记得添加注释
- 已有的注释如果没有错误, 不要删除

### 提交代码
- 除非有我的指令, 否则不能提交代码
- 提交代码时, message 必须清晰明了
- 提交代码时, 前后端分别用不同的 commit 提交, 例如 `feat(frontend):xxxx` 和 `feat(backend):xxxx`, 不要执行 push

### 逗号
- 除了字符串中的内容, 尽量使用英文逗号 (包括注释, 全中文描述)
