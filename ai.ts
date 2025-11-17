// ai.ts - AI服务模块（多模型自动切换 + MCP工具 + 智能过滤）

import type { BotConfig, AIModel } from "./types.ts";
import { MCPSSEClient, type MCPTool } from "./mcp_client.ts";

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
 * MCP工具分类定义（用于智能过滤）
 */
const TOOL_CATEGORIES: Record<string, string[]> = {
  search: ['search', 'web', 'google', 'bing', 'exa', 'perplexity', 'browse', 'internet'],
  code: ['code', 'github', 'git', 'python', 'javascript', 'program', 'script'],
  data: ['database', 'sql', 'csv', 'json', 'xml', 'data', 'query'],
  file: ['file', 'read', 'write', 'download', 'upload', 'document'],
  image: ['image', 'photo', 'picture', 'screenshot', 'visual'],
  math: ['calculate', 'math', 'compute', 'number', 'formula'],
  time: ['time', 'date', 'calendar', 'schedule', 'clock'],
  general: ['get', 'fetch', 'retrieve', 'list', 'show'],
};

/**
 * 根据用户消息选择相关工具类别
 * @param message 用户消息
 * @returns 选中的工具类别
 */
function selectToolCategory(message: string): string[] {
  const msg = message.toLowerCase();
  const selected = new Set<string>();
  
  // 匹配关键词
  for (const [category, keywords] of Object.entries(TOOL_CATEGORIES)) {
    if (keywords.some(kw => msg.includes(kw))) {
      selected.add(category);
    }
  }
  
  // 默认包含search和general（最通用）
  if (selected.size === 0) {
    selected.add('search');
    selected.add('general');
  }
  
  return Array.from(selected);
}

/**
 * 根据类别过滤工具
 * @param tools 全部工具
 * @param categories 选中的类别
 * @returns 过滤后的工具
 */
function filterTools(tools: MCPTool[], categories: string[]): MCPTool[] {
  const filtered = tools.filter(tool => {
    const name = tool.name.toLowerCase();
    const desc = tool.description.toLowerCase();
    
    return categories.some(cat => 
      TOOL_CATEGORIES[cat]?.some(kw => 
        name.includes(kw) || desc.includes(kw)
      )
    );
  });
  
  // 如果过滤后太少，返回前50个工具
  if (filtered.length < 20) {
    console.log(`[AI] 过滤后工具较少（${filtered.length}），使用前50个通用工具`);
    return tools.slice(0, 50);
  }
  
  // 最多返回60个工具
  return filtered.slice(0, 60);
}

/**
 * 简化工具定义（Level 3动态加载）
 * 首次只发送工具名称+描述，不发送详细参数定义
 * @param tools 工具列表
 * @returns 简化后的工具定义
 */
function simplifyTools(tools: MCPTool[]) {
  return tools.map(tool => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      // 参数简化为空对象，大幅减少数据量
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  }));
}

/**
 * AI API响应类型（带Function Calling）
 */
interface AIResponse {
  choices?: Array<{
    message: {
      role: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string; // JSON字符串
        };
      }>;
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
 * 调用ZhipuAI/GLM-4.5服务获取回复（带MCP工具集成）
 * @param userMessage 用户消息
 * @param config Bot配置（包含GLM-4.5和MCP配置）
 * @returns AI回复文本
 */
export async function getAIResponse(userMessage: string, config: BotConfig): Promise<string> {
  // 超时60秒强制返回（Deno Deploy免费套餐上限）
  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error("AI调用超时60秒")), 60000);
  });

  const mainTask = async (): Promise<string> => {
    try {
      // 步骤 1: 初始化MCP客户端并获取工具列表
      console.log("[AI] 初始化MCP客户端...");
      const mcpClient = new MCPSSEClient(config);
      const mcpTools = await mcpClient.listTools();
      console.log(`[AI] 获取到 ${mcpTools.length} 个MCP工具`);

      // 步骤 2: 智能过滤工具（Level 1）
      const categories = selectToolCategory(userMessage);
      console.log(`[AI] 选择的工具类别: ${categories.join(', ')}`);
      
      const filteredTools = filterTools(mcpTools, categories);
      console.log(`[AI] 过滤后工具数量: ${filteredTools.length}`);

      // 步骤 3: 简化工具定义（Level 3动态加载）
      const zhipuTools = simplifyTools(filteredTools);
      console.log(`[AI] 使用简化工具定义（减少数据量）`);

      // 步骤 4: 构建AI API请求体
      const requestBody: Record<string, unknown> = {
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
      };

      // 如果有MCP工具，添加到请求中
      if (zhipuTools.length > 0) {
        requestBody.tools = zhipuTools;
      } else {
        console.warn("[AI] 未获取到MCP工具，将以纯LLM模式处理本次对话");
      }

      // 步骤 5: 发起第一次API请求（多模型自动切换）
      console.log("[AI] 发送AI请求（多模型自动切换）...");
      const data = await callAIWithFallback(requestBody, config);
      const assistantMessage = data.choices?.[0]?.message;

      // 步骤 5: 检测是否有tool_calls
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        const toolCall = assistantMessage.tool_calls[0];
        console.log(`[AI] 检测到工具调用: ${toolCall.function.name}`);

        // 步骤 6: 调用MCP工具
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        let toolResult: unknown;
        try {
          toolResult = await mcpClient.callTool(toolName, toolArgs);
          console.log("[AI] 工具执行成功");
        } catch (error) {
          console.error("[AI] 工具执行失败:", error);
          toolResult = {
            error: error instanceof Error ? error.message : "工具调用失败",
          };
        }

        // 步骤 7: 将工具结果返回AI（第二次请求，带队列管理）
        console.log("[AI] 将工具结果返回AI...");
        const secondRequestBody = {
          messages: [
            {
              role: "user",
              content: userMessage,
            },
            {
              role: "assistant",
              content: assistantMessage.content || null,
              tool_calls: assistantMessage.tool_calls,
            },
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            },
          ],
          tools: zhipuTools,
          temperature: 0.7,
        };

        const secondData = await callAIWithFallback(secondRequestBody, config);
        const finalText = secondData.choices?.[0]?.message?.content;

        if (!finalText) {
          throw new Error("无法从AI第二次响应中提取文本");
        }

        console.log("[AI] 工具调用流程完成");
        return finalText.trim();
      }

      // 步骤 8: 如果没有工具调用，直接返回文本
      const replyText = assistantMessage?.content;
      if (!replyText) {
        throw new Error("无法从AI响应中提取回复文本");
      }

      console.log("[AI] 直接回复（无工具调用）");
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
