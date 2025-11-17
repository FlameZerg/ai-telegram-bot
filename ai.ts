// ai.ts - AI服务模块（集成Google Gemini + MCP工具）

import type { BotConfig } from "./types.ts";

/**
 * Gemini API响应类型
 */
interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message: string;
    code: number;
  };
}

/**
 * 调用Gemini AI服务获取回复
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
      // 构建Gemini API URL
      const apiUrl = `${config.geminiApiUrl}/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

      // 构建Gemini请求体
      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
        // TODO: 未来可在此添加MCP工具配置（通过function calling机制）
        // tools: [...] // MCP工具定义
      };

      // 发起Gemini API请求
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // 解析响应
      if (!response.ok) {
        const errorData = await response.json() as GeminiResponse;
        throw new Error(
          `Gemini API错误 (${response.status}): ${
            errorData.error?.message || "未知错误"
          }`
        );
      }

      const data = await response.json() as GeminiResponse;

      // 提取AI回复文本
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!replyText) {
        throw new Error("无法从Gemini响应中提取回复文本");
      }

      return replyText.trim();
    } catch (error) {
      console.error("Gemini API调用失败:", error);
      throw error; // 抛出错误以触发超时处理
    }
  };

  try {
    return await Promise.race([mainTask(), timeoutPromise]);
  } catch (error) {
    console.error("AI调用最终失败:", error);
    return "抱歉，AI服务响应超时或不可用。请稍后再试。";
  }
}
