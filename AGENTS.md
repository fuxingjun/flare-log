# AGENTS.md

**FlareLog** — 轻量级 Cloudflare Workers + D1 日志接收与查询服务

## 技术栈

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono
- **语言**: TypeScript
- **部署工具**: Wrangler (仅开发阶段使用)

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

## 关键架构约定

- `wrangler.jsonc` 配置了 `run_worker_first: true` 和 `binding: "ASSETS"`, Worker 优先处理所有请求, 未匹配的路径通过 `env.ASSETS.fetch()` 转发到静态资源层
- `not_found_handling` 设为 `none`, SPA fallback 由 Worker 代码手动实现
- `keep_vars` 设为 `true`, 部署时保留 Dashboard 中手动配置的环境变量, 不会被覆盖
- 数据库表结构在首次请求时自动创建 (`db.ts`), 无需手动执行 SQL
- 部署方式为 Cloudflare Git 集成自动部署, 非 `wrangler deploy`

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
