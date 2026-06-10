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


def _lang_label(code: str) -> str:
    return LANG_NAMES.get(code, code)


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

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()

    choices = data.get("choices") or []
    if not choices:
        raise ValueError("大模型未返回有效结果")
    content = choices[0].get("message", {}).get("content", "").strip()
    if not content:
        raise ValueError("大模型返回空内容")
    return content
