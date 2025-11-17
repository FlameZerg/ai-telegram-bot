// ai.ts - AI服务模块（集成MCP SSE）

import type { MCPToolRequest, MCPStreamEvent } from "./types.ts";

/**
 * MCP API配置（优先使用环境变量）
 */
const MCP_API_URL = Deno.env.get("MCP_API_URL") ?? "https://toolbelt.apexti.com/api/workspaces/4f923c1d-6736-450e-b4cf-933a0ea0c870/sse?apikey=9ecc0fffdfb0430cdaf10c46eefd4845c6d0305aeb53688f63fe27381e0d3a19";

/**
 * 调用MCP AI服务获取回复
 * @param userMessage 用户消息
 * @returns AI回复文本
 */
export async function getAIResponse(userMessage: string): Promise<string> {
  try {
    // 优先尝试 Anthropic/消息式 POST 流
    const tryAnthropic = async () => {
      const body: MCPToolRequest = {
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: userMessage }],
        stream: true,
      };
      return await fetch(MCP_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(body),
      });
    };

    // 兼容某些MCP实现：POST { input: text }
    const tryInputPost = async () => {
      return await fetch(MCP_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({ input: userMessage, stream: true }),
      });
    };

    // 兜底：GET ?q= 文本（SSE）
    const tryGet = async () => {
      const url = new URL(MCP_API_URL);
      url.searchParams.set("q", userMessage);
      return await fetch(url, {
        method: "GET",
        headers: { "Accept": "text/event-stream" },
      });
    };

    // 将SSE响应解析为纯文本
    const readSSE = async (response: Response): Promise<string> => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line) continue;
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            // 兼容两种：JSON事件 或 纯文本增量
            try {
              const evt: MCPStreamEvent = JSON.parse(data);
              if (evt.type === "content_block_delta" && evt.delta?.text) text += evt.delta.text;
              if (evt.type === "error") throw new Error(evt.error?.message || "MCP错误");
            } catch {
              // 非JSON，按纯文本拼接
              text += data;
            }
          }
        }
      }
      return text.trim();
    };

    // 依次尝试三种调用方式
    const attempts = [tryAnthropic, tryInputPost, tryGet];
    for (const attempt of attempts) {
      const resp = await attempt();
      if (resp.ok) {
        const out = await readSSE(resp);
        if (out) return out;
      }
    }

    throw new Error("所有MCP调用方式均失败");
  } catch (error) {
    console.error("AI服务调用失败:", error);
    return "抱歉，AI服务暂时不可用，请稍后再试。";
  }
}
