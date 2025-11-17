// bot.ts - Telegram Bot核心逻辑

import { Bot, webhookCallback } from "grammy";
import type { BotConfig } from "./types.ts";
import { getAIResponse } from "./ai.ts";

/**
 * 创建并配置Telegram Bot
 * @param config Bot配置
 * @returns 配置好的Bot实例
 */
export function createBot(config: BotConfig): Bot {
  const bot = new Bot(config.botToken);

  /**
   * 处理用户消息并调用AI回复（内部函数，可访问config）
   * @param ctx Grammy上下文
   * @param message 用户消息文本
   */
  async function handleUserMessage(ctx: any, message: string): Promise<void> {
    try {
      // 立即发送"思考中"占位消息，避免webhook超时
      const placeholderMsg = await ctx.reply("💭 正在思考中...");
      const chatId = ctx.chat.id;
      const messageId = placeholderMsg.message_id;

      // 异步调用AI（不阻塞webhook响应）
      (async () => {
        try {
          // 显示"正在输入"状态
          await ctx.api.sendChatAction(chatId, "typing");

          // 调用AI服务获取回复（传递完整配置）
          const aiReply = await getAIResponse(message, config);

          // 安全检查：确保回复不为空（避免Telegram API报错）
          if (!aiReply || aiReply.trim() === "") {
            console.warn("[Bot] AI返回空文本，使用默认消息");
            await ctx.api.editMessageText(chatId, messageId, "⚠️ AI服务返回了空响应，请稍后再试。");
            return;
          }

          // 编辑占位消息为AI真实回复
          await ctx.api.editMessageText(chatId, messageId, aiReply);
        } catch (error) {
          console.error("AI调用失败:", error);
          // 编辑占位消息为错误提示
          await ctx.api.editMessageText(
            chatId,
            messageId,
            "抱歉，AI服务暂时不可用。可能原因：\n" +
            "• MCP API响应超时\n" +
            "• 网络连接问题\n\n" +
            "请稍后再试。"
          ).catch(() => {
            // 如果编辑失败，发送新消息
            ctx.api.sendMessage(chatId, "⚠️ AI服务调用失败，请稍后再试。");
          });
        }
      })(); // 立即返回，不等待AI完成

    } catch (error) {
      console.error("处理消息失败:", error);
      await ctx.reply("抱歉，处理您的消息时遇到了问题，请稍后再试。");
    }
  }

  // /start 命令 - 问候语
  bot.command("start", async (ctx) => {
    const userName = ctx.from?.first_name || "朋友";
    await ctx.reply(
      `👋 你好，${userName}！\n\n` +
      `我是AI智能助手，很高兴为您服务！\n\n` +
      `💡 您可以：\n` +
      `• 直接发送消息与我对话\n` +
      `• 在群聊中@我进行互动\n\n` +
      `有什么我可以帮助您的吗？`,
      { parse_mode: "Markdown" }
    );
  });

  // 处理私聊消息
  bot.on("message:text", async (ctx) => {
    const chatType = ctx.chat.type;
    const messageText = ctx.message.text;
    const botUsername = ctx.me.username;

    // 私聊：直接回复所有消息
    if (chatType === "private") {
      await handleUserMessage(ctx, messageText);
      return;
    }

    // 群聊：只响应@提及的消息
    if (chatType === "group" || chatType === "supergroup") {
      // 检查是否@了机器人
      const isMentioned = 
        messageText.includes(`@${botUsername}`) || // 文本中包含@机器人
        ctx.message.entities?.some(
          (entity) => 
            entity.type === "mention" && 
            messageText.slice(entity.offset, entity.offset + entity.length) === `@${botUsername}`
        ) ||
        ctx.message.reply_to_message?.from?.id === ctx.me.id; // 回复机器人的消息

      if (isMentioned) {
        // 移除@提及，提取真实消息内容
        const cleanMessage = messageText.replace(new RegExp(`@${botUsername}`, "g"), "").trim();
        await handleUserMessage(ctx, cleanMessage);
      }
      // 未@机器人的群聊消息，不处理
      return;
    }
  });

  return bot;
}


/**
 * 设置Webhook
 * @param bot Bot实例
 * @param webhookUrl Webhook URL
 */
export async function setupWebhook(bot: Bot, webhookUrl: string): Promise<void> {
  try {
    await bot.api.setWebhook(webhookUrl);
    console.log(`✅ Webhook已设置: ${webhookUrl}`);
  } catch (error) {
    console.error("❌ 设置Webhook失败:", error);
    throw error;
  }
}

/**
 * 创建Webhook处理器
 * @param bot Bot实例
 * @returns Webhook处理函数
 */
export function createWebhookHandler(bot: Bot) {
  return webhookCallback(bot, "std/http");
}
