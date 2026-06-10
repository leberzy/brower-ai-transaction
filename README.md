# AI 划词翻译 Chrome 插件

选中网页文本后出现浮动工具栏，一键调用大模型翻译，支持账号登录与翻译历史记录。

## 项目结构

```
translate-extension/
├── backend/          # FastAPI 后端
│   ├── app/
│   └── requirements.txt
└── extension/        # Chrome 扩展 (Manifest V3)
    ├── manifest.json
    ├── background.js
    ├── content/
    └── popup/
```

## 快速开始

### 1. 启动后端

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # 编辑 .env，填入 LLM_API_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

在 `.env` 中配置大模型（OpenAI 兼容 API）：

```env
LLM_API_BASE=https://api.openai.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=gpt-4o-mini
```

也支持 DeepSeek、通义千问等兼容 OpenAI 格式的服务，只需修改 `LLM_API_BASE` 和 `LLM_MODEL`。

### 2. 安装 Chrome 扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension` 目录
4. 点击扩展图标，注册/登录账号

### 3. 使用

1. 在任意网页选中一段文字
2. 在出现的浮动条中选择目标语言，点击「翻译」
3. 翻译结果会显示在下方弹窗，并自动保存到历史记录

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/translate` | AI 翻译（需登录） |
| GET | `/api/history` | 翻译历史（需登录） |
| GET | `/health` | 健康检查 |

API 文档：启动后访问 http://localhost:8000/docs

## 技术栈

- **扩展**：Manifest V3、Content Script、Service Worker
- **后端**：FastAPI、SQLAlchemy、SQLite、JWT、httpx
- **翻译**：OpenAI 兼容 Chat Completions API
