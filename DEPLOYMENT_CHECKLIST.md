# Telegram Bot 部署检查清单

## ✅ 代码已完成的改动

### 1. 安全性提升
- ✅ 移除所有硬编码的API密钥（Gemini、MCP）
- ✅ 所有敏感配置改为环境变量

### 2. 架构重构
- ✅ `ai.ts`: 重写为标准Gemini API调用
- ✅ `types.ts`: 清理未使用的类型定义
- ✅ `main.ts`: 添加完整的环境变量验证
- ✅ `bot.ts`: 优化配置传递逻辑

### 3. 文件清单
```
telegram_bot/
├── main.ts           # 入口文件
├── bot.ts            # Bot核心逻辑
├── ai.ts             # Gemini API集成
├── types.ts          # TypeScript类型定义
├── .env.example      # 环境变量示例
├── deno.json         # Deno配置
└── README.md         # 项目文档
```

---

## 🔧 Deno Deploy 部署步骤

### 第一步：设置环境变量

在Deno Deploy项目的 **Settings → Environment Variables** 中添加：

#### 必需配置（缺一不可）
```bash
TELEGRAM_BOT_TOKEN=<从@BotFather获取的Token>
GEMINI_API_KEY=<从Google AI Studio获取的API密钥>
MCP_API_URL=<您的MCP工具服务器URL>
```

#### 可选配置（有默认值）
```bash
WEBHOOK_DOMAIN=<your-project.deno.dev>  # 通常自动检测
GEMINI_API_URL=https://generativelanguage.googleapis.com  # 默认值
GEMINI_MODEL=gemini-2.5-flash  # 默认值
PORT=8000  # 默认值
```

### 第二步：部署项目

1. 推送代码到GitHub
2. 在Deno Deploy创建新项目
3. 连接到您的GitHub仓库
4. 选择 `main.ts` 作为入口文件
5. 点击 **Deploy**

### 第三步：注册Webhook

部署成功后，在浏览器访问：
```
https://your-project.deno.dev/setup
```

**期望响应：**
```json
{
  "success": true,
  "webhook": "https://your-project.deno.dev"
}
```

---

## 🐛 常见错误排查

### 错误1: `internalServerError`

**可能原因：**
- ❌ 环境变量未设置或名称错误
- ❌ Gemini API密钥无效
- ❌ MCP服务器URL不可达

**解决方案：**
1. 检查Deno Deploy环境变量是否全部设置
2. 验证 `GEMINI_API_KEY` 在 [Google AI Studio](https://aistudio.google.com/app/apikey) 中是否有效
3. 确认 `MCP_API_URL` 格式正确且可访问
4. 查看Deno Deploy的 **Logs** 标签页获取详细错误信息

### 错误2: Webhook设置失败（429 Too Many Requests）

**解决方案：**
等待几分钟后重新访问 `/setup` 端点。Telegram API有速率限制。

### 错误3: Bot不回复消息

**检查项：**
1. Webhook是否成功设置（访问 `/setup` 确认）
2. 环境变量 `GEMINI_API_KEY` 是否正确
3. 查看Deno Deploy日志中是否有错误信息

---

## 📊 健康检查端点

部署后可以访问以下端点验证服务状态：

```bash
# 健康检查
curl https://your-project.deno.dev/health

# Webhook状态（需要先访问/setup注册）
curl https://your-project.deno.dev/setup
```

---

## 🔮 后续功能扩展

### MCP工具集成（未来）

当前代码已预留MCP集成接口（`ai.ts` 第46-47行）。未来可通过以下步骤集成：

1. 查询MCP工具服务器的可用工具列表
2. 将工具定义转换为Gemini `functionDeclaration` 格式
3. 在Gemini请求中添加 `tools` 参数
4. 拦截 `functionCall` 响应，转发到MCP服务器
5. 将MCP结果返回给Gemini继续生成

参考：[Gemini Function Calling 文档](https://ai.google.dev/gemini-api/docs/function-calling)

---

## 📞 支持

如果部署时遇到问题，请检查：
1. Deno Deploy的 **Logs** 标签页
2. 确认所有环境变量名称与 `.env.example` 一致
3. 验证API密钥的有效性
