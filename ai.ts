// ai.ts - AI服务模块（集成GLM-4.5）

import type { BotConfig } from "./types.ts";
// import { MCPSSEClient } from "./mcp_client.ts"; // TODO: MCP集成

/**
 * OpenAI兼容API响应类型
 */
interface OpenAIResponse {
  choices?: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  error?: {
    message: string;
    type: string;
  };
}

/**
 * 调用GLM-4.5 AI服务获取回复（OpenAI兼容API）
 * @param userMessage 用户消息
 * @param config Bot配置（包含GLM-4.5配置）
 * @returns AI回复文本
 */
export async function getAIResponse(userMessage: string, config: BotConfig): Promise<string> {
  // 超时30秒强制返回
  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error("AI调用超时30秒")), 30000);
  });

  const mainTask = async (): Promise<string> => {
    try {
      console.log("[AI] 发送GLM-4.5请求...");
      
      // 构建OpenAI兼容API请求体
      const requestBody = {
        model: config.geminiModel, // "GLM-4.5"
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
      };

      // 发起API请求
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

      const data = await response.json() as OpenAIResponse;

      // 提取AI回复文本
      const replyText = data.choices?.[0]?.message?.content;
      if (!replyText) {
        throw new Error("无法从GLM-4.5响应中提取回复文本");
      }

      console.log("[AI] GLM-4.5回复成功");
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
