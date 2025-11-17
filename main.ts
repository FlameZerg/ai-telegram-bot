// deno/main.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { TelegramBot } from "https://deno.land/x/telegram_bot_api@v1.0.0/mod.ts";

const app = new Application();
const router = new Router();

// Telegram Bot配置
const BOT_TOKEN = Deno.env.get("8267891120:AAE711TC6XxztE_1yfz3McX35-eS0M9JUq4")!;
const bot = new TelegramBot(8267891120:AAE711TC6XxztE_1yfz3McX35-eS0M9JUq4);

// 消息处理逻辑
async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const text = message.text || "";
  const userId = message.from.id;

  console.log(`收到消息: ${text} from user ${userId}`);

  // 智能回复逻辑
  let reply = "";

  if (text.includes("/start")) {
    reply = "👋 欢迎使用AI助手！我可以帮您：\n\n" +
            "💬 智能对话\n" +
            "📊 数据分析\n" +
            "🌐 网络搜索\n" +
            "📁 文件管理\n" +
            "💰 加密货币查询\n\n" +
            "有什么我可以帮助您的吗？";
  } 
  else if (text.includes("百度热搜") || text.includes("热搜")) {
    reply = await getBaiduHotSearch();
  }
  else if (text.includes("天气")) {
    reply = await getWeatherInfo(text);
  }
  else if (text.includes("时间") || text.includes("几点")) {
    reply = `🕐 当前时间: ${new Date().toLocaleString('zh-CN')}`;
  }
  else if (text.includes("你好") || text.includes("hi") || text.includes("hello")) {
    reply = "👋 你好！我是AI助手，很高兴为您服务！\n\n" +
            "您可以尝试：\n" +
            "• 说'百度热搜'查看热点\n" +
            "• 问'天气'查询天气\n" +
            "• 或者直接告诉我您需要什么帮助";
  }
  else {
    reply = await getAIResponse(text); // AI智能回复
  }

  // 发送回复
  await bot.sendMessage(chatId, reply);
}

// 获取百度热搜
async function getBaiduHotSearch(): Promise<string> {
  try {
    const response = await fetch("https://top.baidu.com/api/board?platform=wise&tab=realtime");
    const data = await response.json();
    
    let reply = "📊 **今日百度热搜TOP10：**\n\n";
    
    if (data.data && data.data.cards && data.data.cards[0] && data.data.cards[0].content) {
      const hotItems = data.data.cards[0].content.slice(0, 10);
      hotItems.forEach((item: any, index: number) => {
        reply += `${index + 1}. **${item.word}**\n`;
        if (item.hotScore) {
          reply += `   🔥 热度: ${item.hotScore}\n`;
        }
        reply += "\n";
      });
    } else {
      reply += "暂时无法获取热搜数据，请稍后再试。";
    }
    
    return reply;
  } catch (error) {
    console.error("获取百度热搜失败:", error);
    return "抱歉，获取百度热搜时出现了错误，请稍后再试。";
  }
}

// AI智能回复
async function getAIResponse(text: string): Promise<string> {
  try {
    // 这里可以集成任何AI服务，比如OpenAI、Claude等
    // 为了演示，我们使用简单的规则回复
    const responses = [
      "我理解您的问题，让我为您查找相关信息...",
      "这是一个有趣的问题！让我思考一下...",
      "根据我的分析，我建议您...",
      "我正在为您处理这个请求...",
      "感谢您的提问！我的回答是..."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)] + 
           "\n\n（这是一个演示回复，实际应用中会集成真正的AI服务）";
  } catch (error) {
    return "抱歉，处理您的问题时出现了错误。";
  }
}

// Webhook端点
router.post("/webhook", async (ctx) => {
  try {
    const update = await ctx.request.body({ type: "json" }).value;
    console.log("收到Webhook请求:", JSON.stringify(update, null, 2));

    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      // 处理回调查询（按钮点击等）
      await handleCallbackQuery(update.callback_query);
    }

    ctx.response.status = 200;
    ctx.response.body = { status: "ok" };
  } catch (error) {
    console.error("处理Webhook错误:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// 设置Webhook
router.get("/set-webhook", async (ctx) => {
  try {
    const webhookUrl = `${Deno.env.get("DENO_DEPLOYMENT_ID")?.replace('https://', 'https://')}/webhook`;
    
    const result = await bot.setWebhook(webhookUrl);
    
    ctx.response.status = 200;
    ctx.response.body = { 
      success: true, 
      webhookUrl: webhookUrl,
      result: result 
    };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// 健康检查
router.get("/health", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = { 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    service: "telegram-bot"
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`服务器启动在端口 ${port}`);

await app.listen({ port });