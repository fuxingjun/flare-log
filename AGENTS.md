# AGENTS.md

**FlareLog** — 轻量级 Cloudflare Workers + D1 日志接收与查询服务

这是一个专为 Cloudflare 边缘环境设计的轻量日志系统，目标是提供简单、快速、低成本的结构化日志服务。

## 项目目标

- 构建一个可在 Cloudflare 上完全部署的轻量日志服务（Worker + D1）
- 支持结构化 JSON 日志接收（单个或批量）
- 提供基本的查询接口（按时间、level、service、trace_id 等过滤）
- 保持极致轻量，适合个人项目、中小型应用使用
- 未来逐步提升兼容性（OpenTelemetry OTLP Logs 等）
- 代码风格清晰、可维护，优先使用 TypeScript + Hono

## 技术栈

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono (推荐)
- **语言**: TypeScript（严格模式）
- **部署工具**: Wrangler
