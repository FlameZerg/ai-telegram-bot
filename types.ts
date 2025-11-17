// types.ts - 类型定义

/**
 * MCP工具调用请求
 */
export interface MCPToolRequest {
  model: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  stream: boolean;
}

/**
 * MCP SSE响应事件
 */
export interface MCPStreamEvent {
  type: "content_block_delta" | "message_stop" | "error";
  delta?: {
    type: "text_delta";
    text: string;
  };
  error?: {
    message: string;
  };
}

/**
 * 环境变量配置
 */
export interface BotConfig {
  botToken: string;
  webhookDomain: string;
  mcpApiUrl: string;
  geminiApiKey: string;  // Gemini API密钥
  geminiApiUrl: string;  // Gemini API基础URL
  geminiModel: string;   // Gemini模型名称
}
