// types.ts - 类型定义

/**
 * Bot环境变量配置
 */
export interface BotConfig {
  botToken: string;      // Telegram Bot Token
  webhookDomain: string; // Webhook域名
  mcpApiUrl: string;     // MCP工具服务器URL（预留，未来用于function calling）
  geminiApiKey: string;  // Gemini API密钥
  geminiApiUrl: string;  // Gemini API基础URL
  geminiModel: string;   // Gemini模型名称
}
