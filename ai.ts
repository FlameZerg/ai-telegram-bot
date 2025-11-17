// ai.ts - AI服务模块（集成ZhipuAI/GLM-4.5 + MCP工具）

import type { BotConfig } from "./types.ts";
import { MCPSSEClient } from "./mcp_client.ts";

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
  // 超时30秒强制返回
  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error("AI调用超时30秒")), 30000);
  });

  const mainTask = async (): Promise<string> => {
    try {
      // 步骤 1: 初始化MCP客户端并获取工具列表
      console.log("[AI] 初始化MCP客户端...");
      const mcpClient = new MCPSSEClient(config);
      const mcpTools = await mcpClient.listTools();
      console.log(`[AI] 获取到 ${mcpTools.length} 个MCP工具`);

      // 步骤 2: 转换为ZhipuAI tools格式
      const zhipuTools = mcpTools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));

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
