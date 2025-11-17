// main.ts - Telegram Bot 入口文件

import type { BotConfig } from "./types.ts";
import { createBot, createWebhookHandler, setupWebhook } from "./bot.ts";

/**
 * 从环境变量加载配置
 */
function loadConfig(): BotConfig {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  // 自动检测Deno Deploy域名或使用环境变量
  const webhookDomain = Deno.env.get("WEBHOOK_DOMAIN") || 
                        Deno.env.get("DENO_DEPLOYMENT_ID")?.split("-")[0] || 
                        "localhost:8000";
  const geminiApiKey = Deno.env.get("AI_API_KEY");
  const geminiApiUrl = Deno.env.get("AI_API_URL") || "https://api-inference.modelscope.cn/v1/chat/completions";
  const geminiModel = "ZhipuAI/GLM-4.5"; // 模型名称硬编码，日后更换模型直接修改此行

  // 验证必需配置
  if (!botToken) {
    throw new Error(
      "❌ 环境变量 TELEGRAM_BOT_TOKEN 未设置\n" +
      "请在Deno Deploy控制台 Settings → Environment Variables 中添加：\n" +
      "TELEGRAM_BOT_TOKEN=您的Bot Token（从@BotFather获取）"
    );
  }

  if (!geminiApiKey) {
    throw new Error(
      "❌ 环境变量 AI_API_KEY 未设置\n" +
      "请在Deno Deploy控制台 Settings → Environment Variables 中添加：\n" +
      "AI_API_KEY=您的AI API密钥（从ModelScope或其他服务商获取）"
    );
  }

  return { botToken, webhookDomain, geminiApiKey, geminiApiUrl, geminiModel };
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

    // 创建HTTP服务器
    const handler = createWebhookHandler(bot);
    const port = parseInt(Deno.env.get("PORT") || "8000");
    const webhookUrl = `https://${config.webhookDomain}/webhook`;

    // 启动服务器
    console.log(`🚀 服务器启动在端口 ${port}`);
    console.log(`📡 预期 Webhook URL: ${webhookUrl}`);
    console.log(`⚠️  首次部署后，请在浏览器访问 /setup 一次以注册Webhook`);

    await Deno.serve(
      { port },
      async (req: Request) => {
        const url = new URL(req.url);

        // Webhook端点（支持根路径和 /webhook）
        if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/webhook")) {
          return await handler(req);
        }

        // 手动设置Webhook端点（在域名就绪后调用一次）
        if (url.pathname === "/setup" && req.method === "GET") {
          try {
            const origin = `${url.protocol}//${url.host}`; // 从请求推导域名
            // 允许使用根路径作为webhook，满足“直接域名即可”的诉求
            const desired = origin; // 也可改为 `${origin}/webhook`

            // 避免频繁调用：若已设置则直接返回成功
            const info = await bot.api.getWebhookInfo();
            if (info.url === desired) {
              return new Response(
                JSON.stringify({ success: true, webhook: desired, message: "already_set" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }

            await setupWebhook(bot, desired);
            return new Response(
              JSON.stringify({ success: true, webhook: desired }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          } catch (e) {
            // 优雅处理429等错误
            const err = e as any;
            const payload = { success: false, error: String(err), retry_after: err?.parameters?.retry_after };
            return new Response(
              JSON.stringify(payload),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
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
