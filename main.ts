// main.ts - Telegram Bot 入口文件

import type { BotConfig } from "./types.ts";
import { createBot, createWebhookHandler, setupWebhook } from "./bot.ts";

/**
 * 从环境变量加载配置
 */
function loadConfig(): BotConfig {
  const botToken = Deno.env.get("8267891120:AAE711TC6XxztE_1yfz3McX35-eS0M9JUq4");
  const webhookDomain = Deno.env.get("WEBHOOK_DOMAIN");
  const mcpApiUrl = Deno.env.get("MCP_API_URL") || 
    "https://toolbelt.apexti.com/api/workspaces/4f923c1d-6736-450e-b4cf-933a0ea0c870/sse?apikey=9ecc0fffdfb0430cdaf10c46eefd4845c6d0305aeb53688f63fe27381e0d3a19";

  if (!botToken) {
    throw new Error("❌ 环境变量 TELEGRAM_BOT_TOKEN 未设置");
  }

  if (!webhookDomain) {
    throw new Error("❌ 环境变量 WEBHOOK_DOMAIN 未设置");
  }

  return { botToken, webhookDomain, mcpApiUrl };
}

/**
 * 主函数
 */
async function main() {
  try {
    // 加载配置
    const config = loadConfig();
    console.log("✅ 配置加载成功");

    // 创建Bot实例
    const bot = createBot(config);
    console.log("✅ Bot实例创建成功");

    // 设置Webhook
    const webhookUrl = `https://${config.webhookDomain}/webhook`;
    await setupWebhook(bot, webhookUrl);

    // 创建HTTP服务器
    const handler = createWebhookHandler(bot);
    const port = parseInt(Deno.env.get("PORT") || "8000");

    // 启动服务器
    console.log(`🚀 服务器启动在端口 ${port}`);
    console.log(`📡 Webhook URL: ${webhookUrl}`);

    await Deno.serve(
      { port },
      async (req: Request) => {
        const url = new URL(req.url);

        // Webhook端点
        if (url.pathname === "/webhook" && req.method === "POST") {
          return await handler(req);
        }

        // 健康检查端点
        if (url.pathname === "/health" && req.method === "GET") {
          return new Response(
            JSON.stringify({
              status: "healthy",
              timestamp: new Date().toISOString(),
              service: "telegram-bot",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // 404
        return new Response("Not Found", { status: 404 });
      }
    );
  } catch (error) {
    console.error("❌ 启动失败:", error);
    throw error; // Deno Deploy不允许使用Deno.exit()
  }
}

// 启动应用
if (import.meta.main) {
  main();
}
