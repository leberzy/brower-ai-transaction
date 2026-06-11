import httpx

from app.config import settings

LANG_NAMES = {
    "auto": "自动检测",
    "zh": "中文",
    "en": "英文",
    "ja": "日文",
    "ko": "韩文",
    "fr": "法文",
    "de": "德文",
    "es": "西班牙文",
}

_HTTP_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
_client: httpx.AsyncClient | None = None


def init_http_client() -> None:
    """应用启动时初始化全局 httpx 客户端，避免每次请求重建连接。"""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_HTTP_TIMEOUT)


async def close_http_client() -> None:
    """应用关闭时释放 httpx 连接池。"""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _get_client() -> httpx.AsyncClient:
    if _client is None:
        # 兜底（例如脚本/测试中未走 lifespan）
        init_http_client()
    assert _client is not None
    return _client


def _lang_label(code: str) -> str:
    return LANG_NAMES.get(code, code)


class LLMError(Exception):
    """大模型调用异常基类（路由层据此返回 502）。"""


async def translate_text(text: str, source_lang: str = "auto", target_lang: str = "zh") -> str:
    if not settings.llm_api_key:
        raise ValueError("未配置 LLM_API_KEY，请在 .env 中设置大模型 API 密钥")

    source_desc = "自动检测源语言" if source_lang == "auto" else f"源语言为{_lang_label(source_lang)}"
    target_desc = _lang_label(target_lang)

    system_prompt = (
        "你是一个专业翻译助手。只输出翻译结果，不要解释、不要加引号、不要重复原文。"
        "保持原文格式（换行、标点风格尽量一致）。"
    )
    user_prompt = f"请将以下文本翻译成{target_desc}（{source_desc}）：\n\n{text}"

    url = f"{settings.llm_api_base.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
    }

    try:
        resp = await _get_client().post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as e:
        raise LLMError(f"上游接口返回 {e.response.status_code}") from e
    except httpx.RequestError as e:
        raise LLMError(f"无法连接大模型服务: {e.__class__.__name__}") from e

    choices = data.get("choices") or []
    if not choices:
        raise LLMError("大模型未返回有效结果")
    content = (choices[0].get("message", {}).get("content") or "").strip()
    if not content:
        raise LLMError("大模型返回空内容")
    return content
