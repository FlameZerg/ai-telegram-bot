// types.ts - 类型定义

/**
 * MCP传输模式类型
 */
export type MCPTransportMode = 'sse' | 'streamable_http' | 'auto';

/**
 * Bot环境变量配置
 */
export interface BotConfig {
  botToken: string;      // Telegram Bot Token
  webhookDomain: string; // Webhook域名
  mcpApiUrl: string;     // MCP工具服务器URL
  mcpTransportMode?: MCPTransportMode; // MCP传输模式（默认auto自动检测）
  geminiApiKey: string;  // Gemini API密钥
  geminiApiUrl: string;  // Gemini API基础URL
  geminiModel: string;   // Gemini模型名称
}
