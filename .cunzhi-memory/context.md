# 项目上下文信息

- Telegram Bot项目 - 基于Deno + Grammy + MCP AI服务。技术栈：grammy库处理消息，SSE模式调用MCP API实现AI对话。支持私聊自动回复和群聊@提及检测。部署到Deno Deploy。
- 已完成MCP客户端重构：使用官方@modelcontextprotocol/sdk，支持SSE和StreamableHTTP双模式，自动检测传输类型，代码从250行优化至220行，遵循KISS/YAGNI/SOLID原则。
