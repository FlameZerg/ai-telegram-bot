// mcp_client.ts - MCP协议客户端（官方SDK，双模式：SSE + StreamableHTTP）

import { Client } from 'npm:@modelcontextprotocol/sdk@1.22.0/client/index.js';
import { SSEClientTransport } from 'npm:@modelcontextprotocol/sdk@1.22.0/client/sse.js';
import { StreamableHTTPClientTransport } from 'npm:@modelcontextprotocol/sdk@1.22.0/client/streamableHttp.js';
import type { BotConfig, MCPTransportMode } from "./types.ts";

/**
 * MCP工具定义
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
 * 检测MCP服务器传输模式
 * @param url MCP服务器URL
 * @returns 传输模式
 */
function detectTransportMode(url: string): MCPTransportMode {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('/sse')) {
    return 'sse';
  }
  
  if (urlLower.includes('/mcp') || urlLower.includes('streamable')) {
    return 'streamable_http';
  }
  
  // 默认使用SSE模式（更通用）
  return 'sse';
}

/**
 * MCP客户端（使用官方SDK，双模式：SSE + StreamableHTTP）
 */
export class MCPSSEClient {
  private client: Client | null = null;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
  private isConnected = false;
  private mcpApiUrl: string;
  private transportMode: MCPTransportMode;
  private readonly TIMEOUT = 30000; // 30秒超时

  constructor(config: BotConfig) {
    this.mcpApiUrl = config.mcpApiUrl;
    
    // 确定传输模式
    if (config.mcpTransportMode && config.mcpTransportMode !== 'auto') {
      this.transportMode = config.mcpTransportMode;
    } else {
      this.transportMode = detectTransportMode(this.mcpApiUrl);
    }
    
    console.log(`[MCPClient] 传输模式: ${this.transportMode}`);
  }

  /**
   * 确保已连接到MCP服务器
   */
  private async ensureConnected(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    console.log(`[MCPClient] 正在连接MCP服务器（${this.transportMode}模式）...`);

    try {
      // 创建Client实例
      this.client = new Client(
        {
          name: 'telegram-bot-mcp',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        }
      );

      // 根据模式创建不同的传输层
      const url = new URL(this.mcpApiUrl);
      
      if (this.transportMode === 'sse') {
        // SSE模式
        this.transport = new SSEClientTransport(url);
      } else {
        // StreamableHTTP模式
        this.transport = new StreamableHTTPClientTransport(
          url,
          {
            requestInit: {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            },
          }
        );
      }

      // 连接（带超时）
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('MCP连接超时')), this.TIMEOUT);
      });

      await Promise.race([
        this.client.connect(this.transport),
        timeoutPromise,
      ]);

      this.isConnected = true;
      console.log(`[MCPClient] ✅ ${this.transportMode}连接成功`);
    } catch (error) {
      console.error("[MCPClient] ❌ 连接失败:", error);
      this.client = null;
      this.transport = null;
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * 获取可用工具列表
   * @returns MCP工具数组
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      await this.ensureConnected();
      
      console.log("[MCPClient] 正在获取工具列表...");
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('listTools超时')), this.TIMEOUT);
      });

      const response = await Promise.race([
        this.client!.listTools(),
        timeoutPromise,
      ]);

      const tools: MCPTool[] = (response.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      }));

      console.log(`[MCPClient] ✅ 获取到 ${tools.length} 个工具`);
      return tools;
    } catch (error) {
      console.error("[MCPClient] ❌ 获取工具失败:", error);
      // 失败降级：返回空数组，AI以纯LLM模式运行
      return [];
    }
  }

  /**
   * 调用MCP工具
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 工具执行结果
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      await this.ensureConnected();
      
      console.log(`[MCPClient] 调用工具: ${toolName}`);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`工具调用超时: ${toolName}`)), this.TIMEOUT);
      });

      const response = await Promise.race([
        this.client!.callTool({
          name: toolName,
          arguments: args,
        }),
        timeoutPromise,
      ]);

      console.log(`[MCPClient] ✅ 工具 ${toolName} 执行成功`);
      return response;
    } catch (error) {
      console.error(`[MCPClient] ❌ 工具调用失败:", error);
      throw error;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        console.log("[MCPClient] 连接已关闭");
      } catch (error) {
        console.error("[MCPClient] 关闭连接失败:", error);
      }
      this.client = null;
      this.transport = null;
      this.isConnected = false;
    }
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
}
