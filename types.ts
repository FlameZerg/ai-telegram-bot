// types.ts - 类型定义

/**
 * AI模型配置
 */
export interface AIModel {
  name: string;      // 模型名称（如"ZhipuAI/GLM-4.6"）
  priority: number;  // 优先级（1=最高）
}

/**
 * Bot环境变量配置
 */
export interface BotConfig {
  botToken: string;      // Telegram Bot Token
  webhookDomain: string; // Webhook域名
  geminiApiKey: string;  // AI API密钥
  geminiApiUrl: string;  // AI API基础URL
  geminiModel: string;   // 默认AI模型名称
  aiModels?: AIModel[];  // 多模型配置列表（按优先级排序）
}
