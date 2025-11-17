// ai.ts - AI服务模块（集成ZhipuAI/GLM-4.5 + MCP工具 + 智能过滤）

import type { BotConfig } from "./types.ts";
import { MCPSSEClient, type MCPTool } from "./mcp_client.ts";

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
 * ZhipuAI API响应类型（带Function Calling）
 */
interface ZhipuAIResponse {
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
  };
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

      // 步骤 3: 构建ZhipuAI API请求体
      const requestBody: Record<string, unknown> = {
        model: config.geminiModel, // "ZhipuAI/GLM-4.5"
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

      // 步骤 4: 发起第一次API请求
      console.log("[AI] 发送GLM-4.5请求...");
      const response = await fetch(config.geminiApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.geminiApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `GLM-4.5 API错误 (${response.status}): ${errorText}`
        );
      }

      const data = await response.json() as ZhipuAIResponse;
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

        // 步骤 7: 将工具结果返回GLM-4.5（第二次请求）
        console.log("[AI] 将工具结果返回GLM-4.5...");
        const secondRequestBody = {
          model: config.geminiModel,
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

        const secondResponse = await fetch(config.geminiApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.geminiApiKey}`,
          },
          body: JSON.stringify(secondRequestBody),
        });

        if (!secondResponse.ok) {
          const errorText = await secondResponse.text();
          throw new Error(
            `GLM-4.5 API错误 (${secondResponse.status}): ${errorText}`
          );
        }

        const secondData = await secondResponse.json() as ZhipuAIResponse;
        const finalText = secondData.choices?.[0]?.message?.content;

        if (!finalText) {
          throw new Error("无法从GLM-4.5第二次响应中提取文本");
        }

        console.log("[AI] 工具调用流程完成");
        return finalText.trim();
      }

      // 步骤 8: 如果没有工具调用，直接返回文本
      const replyText = assistantMessage?.content;
      if (!replyText) {
        throw new Error("无法从GLM-4.5响应中提取回复文本");
      }

      console.log("[AI] 直接回复（无工具调用）");
      return replyText.trim();
    } catch (error) {
      console.error("[AI] GLM-4.5 API调用失败:", error);
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
