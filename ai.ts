// ai.ts - AI服务模块（多模型自动切换 + 请求队列）

import type { BotConfig, AIModel } from "./types.ts";

/**
 * 默认AI模型配置列表（按优先级排序）
 */
const DEFAULT_AI_MODELS: AIModel[] = [
  { name: "ZhipuAI/GLM-4.6", priority: 1 },
  { name: "ZhipuAI/GLM-4.5", priority: 2 },
  { name: "MiniMax/MiniMax-M2", priority: 3 },
  { name: "MiniMax/MiniMax-M1-80k", priority: 4 },
  { name: "Qwen/Qwen3-Coder-480B-A35B-Instruct", priority: 5 },
  { name: "Qwen/Qwen3-VL-235B-A22B-Instruct", priority: 6 },
  { name: "Qwen/Qwen3-Next-80B-A3B-Instruct", priority: 7 },
  { name: "deepseek-ai/DeepSeek-V3.2-Exp", priority: 8 },
  { name: "deepseek-ai/DeepSeek-V3.1", priority: 9 },
];

/**
 * 请求队列管理器（确保同一时间只有一个请求）
 */
class RequestQueue {
  private queue: Promise<any> = Promise.resolve();
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL = 2000; // 最小请求间隔（2秒）

  /**
   * 将请求加入队列，确保顺序执行且间隔足够
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const task = async (): Promise<T> => {
      // 计算需要等待的时间
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.MIN_INTERVAL - timeSinceLastRequest);

      if (waitTime > 0) {
        console.log(`[RequestQueue] 等待${waitTime}ms避免并发...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      this.lastRequestTime = Date.now();
      return await fn();
    };

    // 将任务加入队列
    const result = this.queue.then(task);
    this.queue = result.catch(() => {}); // 失败不影响后续队列
    return result;
  }
}

// 全局请求队列实例
const requestQueue = new RequestQueue();

/**
 * AI API响应类型
 */
interface AIResponse {
  choices?: Array<{
    message: {
      role: string;
      content?: string | null;
    };
    finish_reason?: string;
  }>;
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

/**
 * 调用AI API（带队列管理）
 * @param modelName 模型名称
 * @param requestBody 请求体
 * @param config Bot配置
 * @returns AI响应
 */
async function callAIWithQueue(
  modelName: string,
  requestBody: Record<string, unknown>,
  config: BotConfig
): Promise<AIResponse> {
  return await requestQueue.enqueue(async () => {
    console.log(`[AI] 调用模型: ${modelName}`);
    
    const response = await fetch(config.geminiApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.geminiApiKey}`,
      },
      body: JSON.stringify({ ...requestBody, model: modelName }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AI API错误 (${response.status}): ${errorText}`
      );
    }

    return await response.json() as AIResponse;
  });
}

/**
 * 多模型自动切换调用（429错误自动切换下一个）
 * @param requestBody 请求体
 * @param config Bot配置
 * @returns AI响应
 */
async function callAIWithFallback(
  requestBody: Record<string, unknown>,
  config: BotConfig
): Promise<AIResponse> {
  // 获取模型列表（优先使用配置的，否则使用默认）
  const models = config.aiModels && config.aiModels.length > 0
    ? config.aiModels
    : DEFAULT_AI_MODELS;

  let lastError: Error | null = null;

  // 按优先级依次尝试每个模型
  for (const model of models) {
    try {
      const response = await callAIWithQueue(model.name, requestBody, config);
      
      // 检查响应中的错误
      if (response.error) {
        const errorCode = response.error.code;
        const errorMsg = response.error.message;
        
        // 1302或429表示限流，切换下一个模型
        if (errorCode === "1302" || errorMsg.includes("429") || errorMsg.includes("并发")) {
          console.warn(`[AI] 模型 ${model.name} 达到限流，切换下一个...`);
          lastError = new Error(`模型 ${model.name} 限流: ${errorMsg}`);
          continue;
        }
        
        // 其他错误直接抛出
        throw new Error(`模型 ${model.name} 错误: ${errorMsg}`);
      }

      // 成功返回
      console.log(`[AI] 模型 ${model.name} 调用成功`);
      return response;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 检测429错误
      if (errorMsg.includes("429") || errorMsg.includes("限流") || errorMsg.includes("1302")) {
        console.warn(`[AI] 模型 ${model.name} 限流，尝试下一个...`);
        lastError = error instanceof Error ? error : new Error(errorMsg);
        continue;
      }
      
      // 其他错误直接抛出
      throw error;
    }
  }

  // 所有模型都失败
  throw new Error(`所有AI模型都不可用。最后错误: ${lastError?.message || "未知"}`);
}

/**
 * 调用AI服务获取回复（纯文本对话）
 * @param userMessage 用户消息
 * @param config Bot配置
 * @returns AI回复文本
 */
export async function getAIResponse(userMessage: string, config: BotConfig): Promise<string> {
  // 超时60秒强制返回（Deno Deploy免费套餐上限）
  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error("AI调用超时60秒")), 60000);
  });

  const mainTask = async (): Promise<string> => {
    try {
      // 构建AI API请求体
      const requestBody: Record<string, unknown> = {
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
      };

      // 发起API请求（多模型自动切换）
      console.log("[AI] 发送AI请求（多模型自动切换）...");
      const data = await callAIWithFallback(requestBody, config);
      const assistantMessage = data.choices?.[0]?.message;

      // 提取回复文本
      const replyText = assistantMessage?.content;
      
      // 如果AI返回空文本，使用默认消息（避免Telegram消息编辑失败）
      if (!replyText || replyText.trim() === "") {
        console.warn("[AI] AI返回空文本，使用默认消息");
        return "❌ AI未能生成有效回复，请重新描述您的问题或稍后再试。";
      }

      console.log("[AI] 对话完成");
      return replyText.trim();
    } catch (error) {
      console.error("[AI] AI API调用失败:", error);
      throw error;
    }
  };

  try {
    return await Promise.race([mainTask(), timeoutPromise]);
  } catch (error) {
    console.error("[AI] 调用最终失败:", error);
    return "抱歉，AI服务响应超时或不可用。请稍后再试。";
  }
}
