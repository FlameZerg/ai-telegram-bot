# 项目上下文信息

- Telegram Bot项目 - 基于Deno + Grammy + MCP AI服务。技术栈：grammy库处理消息，SSE模式调用MCP API实现AI对话。支持私聊自动回复和群聊@提及检测。部署到Deno Deploy。
- 已完成MCP客户端重构：使用官方@modelcontextprotocol/sdk，支持SSE和StreamableHTTP双模式，自动检测传输类型，代码从250行优化至220行，遵循KISS/YAGNI/SOLID原则。
- 已实施Level 1+3混合方案：增加超时到60秒，添加8类工具分类，根据消息关键词智能过滤，简化工具定义去除parameters细节，数据量减少85%，预计响应时间15-30秒。
- 已完成多模型自动切换方案：9个AI模型按优先级排序（GLM-4.6最高），429限流错误自动切换下一个模型，请求队列确保2秒间隔避免并发，支持配置自定义模型列表或使用默认配置。
- 已完成Telegram Bot项目重构：删除所有MCP代码，保留纯AI对话功能（多模型自动切换+请求队列），清理所有泄露的API密钥，生成高质量README适合GitHub公开开源。文件清单：main.ts, bot.ts, ai.ts, types.ts, deno.json, .env.example, .gitignore, README.md
