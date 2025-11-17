// ai.ts - AI服务模块（集成MCP SSE）

import type { MCPToolRequest, MCPStreamEvent } from "./types.ts";

/**
 * MCP API配置
 */
const MCP_API_URL = "https://toolbelt.apexti.com/api/workspaces/4f923c1d-6736-450e-b4cf-933a0ea0c870/sse?apikey=9ecc0fffdfb0430cdaf10c46eefd4845c6d0305aeb53688f63fe27381e0d3a19";

/**
 * 调用MCP AI服务获取回复
 * @param userMessage 用户消息
 * @returns AI回复文本
 */
export async function getAIResponse(userMessage: string): Promise<string> {
  try {
    // 构造请求体
    const requestBody: MCPToolRequest = {
      model: "claude-sonnet-4-20250514",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
      stream: true,
    };

    // 发送SSE请求
    const response = await fetch(MCP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`MCP API请求失败: ${response.status} ${response.statusText}`);
    }

    // 解析SSE流
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取响应流");
    }

    const decoder = new TextDecoder();
    let aiResponse = "";

    // 读取SSE事件流
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        // SSE格式: data: {...}
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          
          // 跳过空数据和结束标记
          if (!data || data === "[DONE]") continue;

          try {
            const event: MCPStreamEvent = JSON.parse(data);

            // 处理文本增量
            if (event.type === "content_block_delta" && event.delta?.text) {
              aiResponse += event.delta.text;
            }

            // 处理错误
            if (event.type === "error") {
              console.error("MCP API错误:", event.error?.message);
              throw new Error(event.error?.message || "MCP API返回错误");
            }

            // 消息结束
            if (event.type === "message_stop") {
              break;
            }
          } catch (parseError) {
            // 跳过无法解析的行
            console.warn("跳过无法解析的SSE数据:", data);
          }
        }
      }
    }

    // 返回AI回复，如果为空则返回默认消息
    return aiResponse.trim() || "抱歉，我暂时无法处理您的请求。";
  } catch (error) {
    console.error("AI服务调用失败:", error);
    return "抱歉，AI服务暂时不可用，请稍后再试。";
  }
}
