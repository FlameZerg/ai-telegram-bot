# Telegram AI Bot

<div align="center">

一个基于 **Deno** 和 **Grammy** 的智能 Telegram 机器人，支持**多模型自动切换**和**请求队列管理**，可一键部署到 **Deno Deploy**。

[![Deno](https://img.shields.io/badge/Deno-000000?style=flat&logo=deno&logoColor=white)](https://deno.land/)
[![Grammy](https://img.shields.io/badge/Grammy-2CA5E0?style=flat&logo=telegram&logoColor=white)](https://grammy.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## ✨ 核心特性

### 🚀 多模型自动切换
- **9 个 AI 模型**按优先级排序，自动切换
- **智能限流处理**：429 错误自动切换下一个模型
- **支持的模型**：
  - ZhipuAI/GLM-4.6、GLM-4.5
  - MiniMax/MiniMax-M2、MiniMax-M1-80k
  - Qwen/Qwen3-Coder-480B、Qwen3-VL-235B、Qwen3-Next-80B
  - DeepSeek/DeepSeek-V3.2-Exp、DeepSeek-V3.1

### ⚡ 请求队列管理
- **2 秒最小间隔**：避免被识别为并发请求
- **自动排队执行**：确保请求顺序和间隔
- **防止限流**：有效降低 429 错误

### 🛡️ 高可靠性
- **60 秒超时保护**：适配 Deno Deploy 免费套餐
- **空文本处理**：防止 Telegram API 编辑消息失败
- **优雅错误处理**：友好的错误提示

### 📦 开箱即用
- **零配置部署**：推送 GitHub 后自动部署到 Deno Deploy
- **环境变量管理**：所有敏感信息通过环境变量配置
- **私聊和群聊支持**：私聊自动回复，群聊需 @机器人

---

## 📁 项目结构

```
telegram_bot/
├── main.ts          # 入口文件（配置加载 + HTTP 服务器）
├── bot.ts           # Bot 核心逻辑（消息处理 + Webhook）
├── ai.ts            # AI 服务模块（多模型切换 + 请求队列）
├── types.ts         # TypeScript 类型定义
├── deno.json        # Deno 配置文件
├── .env.example     # 环境变量示例
├── .gitignore       # Git 忽略文件
└── README.md        # 项目说明
```

---

## 🚀 快速开始

### 1️⃣ 前置准备

- **Deno** 环境（部署到 Deno Deploy 不需要本地安装）
- **Telegram Bot Token**（从 [@BotFather](https://t.me/BotFather) 获取）
- **AI API 密钥**（从 [ModelScope](https://modelscope.cn/) 或其他服务商获取）

### 2️⃣ 本地开发（可选）

```bash
# 克隆仓库
git clone https://github.com/your-username/telegram_bot.git
cd telegram_bot

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 填入真实配置
# TELEGRAM_BOT_TOKEN=your_bot_token_here
# AI_API_KEY=your_api_key_here

# 启动开发服务器
deno task dev
```

### 3️⃣ 部署到 Deno Deploy

#### 方法一：GitHub 自动部署（推荐）

1. **推送代码到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/telegram_bot.git
   git push -u origin main
   ```

2. **连接 Deno Deploy**
   - 访问 [Deno Deploy](https://dash.deno.com/)
   - 点击 **New Project**
   - 选择 **GitHub Integration**
   - 选择你的仓库 `telegram_bot`
   - 入口文件：`main.ts`
   - 点击 **Link** 完成部署

3. **配置环境变量**
   - 在项目页面点击 **Settings** → **Environment Variables**
   - 添加以下环境变量：
     ```
     TELEGRAM_BOT_TOKEN=your_bot_token_here
     AI_API_KEY=your_api_key_here
     ```

4. **注册 Webhook**
   - 部署成功后，访问 `https://your-project.deno.dev/setup`
   - 看到 `{"success": true}` 表示 Webhook 注册成功

#### 方法二：手动部署

```bash
# 安装 Deno CLI（如果本地没有）
curl -fsSL https://deno.land/install.sh | sh

# 登录 Deno Deploy
deno deploy --project=your-project-name main.ts

# 按提示完成认证和部署
```

---

## ⚙️ 环境变量配置

| 变量名 | 必需 | 说明 | 示例 |
|--------|------|------|------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram Bot Token | `123456:ABC-DEF...` |
| `AI_API_KEY` | ✅ | AI API 密钥 | `ms-xxxxx` 或 `sk-xxxxx` |
| `AI_API_URL` | ❌ | AI API 基础 URL | `https://api-inference.modelscope.cn/v1/chat/completions` |
| `WEBHOOK_DOMAIN` | ❌ | Webhook 域名（自动检测） | `your-project.deno.dev` |
| `PORT` | ❌ | 服务器端口（默认 8000） | `8000` |

---

## 🔧 API 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/` 或 `/webhook` | POST | Telegram Webhook 接收消息 |
| `/setup` | GET | 手动注册 Webhook |
| `/health` | GET | 健康检查 |

### 示例：健康检查

```bash
curl https://your-project.deno.dev/health
```

响应：
```json
{
  "status": "healthy",
  "timestamp": "2025-11-17T13:40:00Z",
  "service": "telegram-bot"
}
```

---

## 🤖 使用说明

### 私聊使用
直接向机器人发送消息即可获得 AI 回复。

### 群聊使用
- **方式 1**：`@机器人用户名 你的消息`
- **方式 2**：回复机器人的消息
- **注意**：未 @机器人的消息不会被处理

### 命令列表
- `/start` - 查看欢迎消息和使用说明

---

## 🏗️ 架构说明

### 工作流程

```
用户消息
    ↓
[Telegram] → Webhook → [Bot.ts]
                           ↓
                    [AI.ts 请求队列]
                           ↓
                    尝试模型1（GLM-4.6）
                           ↓
                    429错误？→ 切换模型2
                           ↓
                    成功 → 返回回复
                           ↓
                    [Telegram] 显示给用户
```

### 多模型切换逻辑

1. **按优先级尝试**：从 GLM-4.6 到 DeepSeek-V3.1 依次尝试
2. **检测限流错误**：HTTP 429、错误码 1302、消息包含"并发"
3. **自动切换**：限流时立即切换下一个模型
4. **日志记录**：详细记录每次切换过程
5. **最终失败**：9 个模型都失败才返回错误

### 请求队列机制

- **单例模式**：全局唯一队列实例
- **顺序执行**：确保同一时间只有一个请求
- **间隔保证**：自动计算并等待 2 秒间隔
- **错误隔离**：单个请求失败不影响队列

---

## 🛠️ 技术栈

- **运行时**：[Deno](https://deno.land/) - 安全的 TypeScript/JavaScript 运行时
- **Bot 框架**：[Grammy](https://grammy.dev/) - 现代化的 Telegram Bot 框架
- **部署平台**：[Deno Deploy](https://deno.com/deploy) - 全球边缘网络，零配置部署
- **AI 服务**：[ModelScope](https://modelscope.cn/) - 支持多种开源 AI 模型

---

## 🐛 常见问题

### Q: 部署后机器人没有响应？
**A:** 检查以下步骤：
1. 访问 `/setup` 注册 Webhook
2. 在 Deno Deploy 控制台查看日志
3. 确认环境变量 `TELEGRAM_BOT_TOKEN` 和 `AI_API_KEY` 已正确配置

### Q: 出现 429 错误怎么办？
**A:** 代码已内置自动切换机制，会自动尝试下一个模型。如果 9 个模型都失败，请稍后再试。

### Q: 如何更换默认模型？
**A:** 编辑 `ai.ts` 中的 `DEFAULT_AI_MODELS` 数组，调整优先级顺序。

### Q: 支持对话历史吗？
**A:** 当前版本为无状态设计，不保存对话历史。如需添加，可使用 Deno KV 或外部数据库。

---

## 📝 开发计划

- [ ] 对话历史管理（基于 Deno KV）
- [ ] 支持图片和文件处理
- [ ] 用户自定义模型优先级
- [ ] 速率限制和配额管理
- [ ] 管理员命令（统计、日志查看）

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📄 许可证

本项目采用 [MIT License](https://opensource.org/licenses/MIT) 开源协议。

---

## 🙏 致谢

- [Deno](https://deno.land/) - 提供安全高效的运行时
- [Grammy](https://grammy.dev/) - 优秀的 Telegram Bot 框架
- [ModelScope](https://modelscope.cn/) - 提供免费 AI API 服务

---

<div align="center">

**如果觉得这个项目有帮助，请给个 ⭐ Star 支持一下！**

Made with ❤️ by [Your Name]

</div>
