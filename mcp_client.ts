// mcp_client.ts - MCP协议客户端（SSE传输）

import type { BotConfig } from "./types.ts";

/**
 * MCP JSON-RPC 2.0 请求格式
 */
interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC 2.0 响应格式
 */
interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP工具定义（符合MCP协议标准）
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

/**
 * Gemini Function Declaration格式
 */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP SSE客户端类
 * 
 * 使用Server-Sent Events (SSE)与MCP工具服务器通信
 */
export class MCPSSEClient {
  private mcpApiUrl: string;
  private requestId = 0;
  private readonly TIMEOUT = 30000; // 统一30秒超时

  constructor(config: BotConfig) {
    this.mcpApiUrl = config.mcpApiUrl;
  }

  /**
   * 获取可用工具列表
   * @returns MCP工具数组
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      console.log("[MCPSSEClient] 正在获取工具列表...");
      
      const request: MCPRequest = {
        jsonrpc: "2.0",
        id: ++this.requestId,
        method: "tools/list",
        params: {},
      };

      const response = await this.sendRequest(request);
      
      if (response.error) {
        throw new Error(`MCP错误: ${response.error.message}`);
      }

      // 解析工具列表
      const result = response.result as { tools?: MCPTool[] };
      const tools = result?.tools || [];
      
      console.log(`[MCPSSEClient] ✅ 获取到 ${tools.length} 个工具`);
      return tools;
    } catch (error) {
      console.error("[MCPSSEClient] ❌ 获取工具列表失败:", error);
      return []; // 失败时返回空数组，降级为纯Gemini模式
    }
  }

  /**
   * 调用MCP工具
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 工具执行结果
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    console.log(`[MCPSSEClient] 调用工具: ${toolName}`);
    
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`工具调用失败: ${response.error.message}`);
    }

    console.log(`[MCPSSEClient] ✅ 工具 ${toolName} 执行成功`);
    return response.result;
  }

  /**
   * 将MCP工具列表转换为Gemini Function Declarations
   * @param tools MCP工具数组
   * @returns Gemini函数声明数组
   */
  static toGeminiFunctions(tools: MCPTool[]): GeminiFunctionDeclaration[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    }));
  }

  /**
   * 发送JSON-RPC请求到MCP服务器（SSE传输）
   * @param request JSON-RPC请求对象
   * @returns JSON-RPC响应对象
   */
  private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    // 30秒超时保护（从收到用户消息开始计时，到返回结果结束）
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`MCP请求超时（${this.TIMEOUT}ms）`));
      }, this.TIMEOUT);
    });

    const mainTask = async (): Promise<MCPResponse> => {
      // 尝试策略：
      // 1) POST JSON-RPC 到 SSE 端点（多数实现支持）
      // 2) 若返回 404/405/400，则回退为 GET，并以 query 传递 method/id/params（兼容部分实现）
      const tryPost = async (): Promise<Response> => {
        console.log(`[MCPSSEClient] POST ${this.mcpApiUrl} method=${request.method}`);
        return await fetch(this.mcpApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
          },
          body: JSON.stringify(request),
        });
      };

      const tryGet = async (): Promise<Response> => {
        const url = new URL(this.mcpApiUrl);
        url.searchParams.set("method", request.method);
        url.searchParams.set("id", String(request.id));
        if (request.params) url.searchParams.set("params", encodeURIComponent(JSON.stringify(request.params)));
        console.log(`[MCPSSEClient] GET  ${url.toString()}`);
        return await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Accept": "text/event-stream",
          },
        });
      };

      // 依次尝试
      let response = await tryPost();
      if (!response.ok && (response.status === 404 || response.status === 405 || response.status === 400)) {
        console.warn(`[MCPSSEClient] POST返回${response.status}，回退GET重试...`);
        response = await tryGet();
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 解析SSE响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();
      let result: MCPResponse | null = null;

      // 读取SSE事件流
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          // SSE格式：data: <JSON>
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data && data !== "[DONE]") {
              try {
                const parsed = JSON.parse(data) as MCPResponse;
                // 匹配请求ID的响应（若服务端未回传id，则直接接受第一条有效JSON）
                if (!parsed.id || parsed.id === request.id) {
                  result = parsed;
                  break;
                }
              } catch (e) {
                // 非JSON，忽略
              }
            }
          }
        }

        if (result) break;
      }

      if (!result) {
        throw new Error("未收到有效的MCP响应");
      }

      return result;
    };

    // 执行请求，带超时保护
    return Promise.race([mainTask(), timeoutPromise]);
  }
}
