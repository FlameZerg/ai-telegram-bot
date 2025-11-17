// ai.ts - AI服务模块（集成Google Gemini + MCP工具）

import type { BotConfig } from "./types.ts";
import { MCPSSEClient } from "./mcp_client.ts";

/**
 * Gemini API响应类型（带Function Calling）
 */
interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message: string;
    code: number;
  };
}

/**
 * 调用Gemini AI服务获取回复（带MCP工具集成）
 * @param userMessage 用户消息
 * @param config Bot配置（包含Gemini和MCP配置）
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
      
      // 步骤 2: 转换为Gemini Function Declarations
      const geminiFunctions = MCPSSEClient.toGeminiFunctions(mcpTools);
      console.log(`[AI] 获取到 ${geminiFunctions.length} 个工具`);

      // 步骤 3: 构建Gemini API URL
      const apiUrl = `${config.geminiApiUrl}/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

      // 步骤 4: 构建Gemini请求体（包含tools）
      const requestBody: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
      };

      // 如果有MCP工具，添加到请求中
      if (geminiFunctions.length > 0) {
        requestBody.tools = [
          {
            functionDeclarations: geminiFunctions,
          },
        ];
      }

      // 步骤 5: 发起第一次Gemini API请求
      console.log("[AI] 发送Gemini请求...");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json() as GeminiResponse;
        throw new Error(
          `Gemini API错误 (${response.status}): ${
            errorData.error?.message || "未知错误"
          }`
        );
      }

      const data = await response.json() as GeminiResponse;
      const parts = data.candidates?.[0]?.content?.parts || [];

      // 步骤 6: 检测是否有functionCall
      const functionCallPart = parts.find((part) => part.functionCall);
      
      if (functionCallPart?.functionCall) {
        // 步骤 7: 调用MCP工具
        console.log(`[AI] 检测到工具调用: ${functionCallPart.functionCall.name}`);
        
        const toolName = functionCallPart.functionCall.name;
        const toolArgs = functionCallPart.functionCall.args;
        
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

        // 步骤 8: 将工具结果返回Gemini（第二次请求）
        console.log("[AI] 将工具结果返回Gemini...");
        const secondRequestBody = {
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage }],
            },
            {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: toolName,
                    args: toolArgs,
                  },
                },
              ],
            },
            {
              role: "function",
              parts: [
                {
                  functionResponse: {
                    name: toolName,
                    response: toolResult,
                  },
                },
              ],
            },
          ],
          tools: requestBody.tools, // 保持工具定义
        };

        const secondResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(secondRequestBody),
        });

        if (!secondResponse.ok) {
          const errorData = await secondResponse.json() as GeminiResponse;
          throw new Error(
            `Gemini API错误 (${secondResponse.status}): ${
              errorData.error?.message || "未知错误"
            }`
          );
        }

        const secondData = await secondResponse.json() as GeminiResponse;
        const finalText = secondData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!finalText) {
          throw new Error("无法从Gemini第二次响应中提取文本");
        }

        console.log("[AI] 工具调用流程完成");
        return finalText.trim();
      }

      // 步骤 9: 如果没有工具调用，直接返回文本
      const replyText = parts[0]?.text;
      if (!replyText) {
        throw new Error("无法从Gemini响应中提取回复文本");
      }

      console.log("[AI] 直接回复（无工具调用）");
      return replyText.trim();
    } catch (error) {
      console.error("[AI] Gemini API调用失败:", error);
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
