import json
import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

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
        init_http_client()
    assert _client is not None
    return _client


def _lang_label(code: str) -> str:
    return LANG_NAMES.get(code, code)


class LLMError(Exception):
    """大模型调用异常基类（路由层据此返回 502）。"""


async def _llm_call(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> str:
    """向 LLM 发送单轮请求，返回文本内容。"""
    if not settings.llm_api_key:
        raise ValueError("未配置 LLM_API_KEY，请在 .env 中设置大模型 API 密钥")

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
        "temperature": temperature,
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


async def translate_text(text: str, source_lang: str = "auto", target_lang: str = "zh") -> str:
    """普通翻译，返回译文字符串。"""
    source_desc = "自动检测源语言" if source_lang == "auto" else f"源语言为{_lang_label(source_lang)}"
    target_desc = _lang_label(target_lang)

    system_prompt = (
        "你是一个专业翻译助手。只输出翻译结果，不要解释、不要加引号、不要重复原文。"
        "保持原文格式（换行、标点风格尽量一致）。"
    )
    user_prompt = f"请将以下文本翻译成{target_desc}（{source_desc}）：\n\n{text}"
    return await _llm_call(system_prompt, user_prompt, temperature=0.3)


async def get_word_info(word: str, target_lang: str = "zh") -> dict:
    """
    对单个词返回词典信息，格式：
    {"translation": "...", "phonetic": "/ˈwɜːrd/", "pos": "n."}
    phonetic 仅对英文单词有意义，其他语言返回空字符串。
    """
    target_desc = _lang_label(target_lang)
    system_prompt = (
        "你是词典助手。用户输入一个单词或短语，你严格按 JSON 格式返回词典信息：\n"
        '{"translation":"<目标语言简洁释义>","phonetic":"<国际音标，仅英文单词填写，否则留空字符串>","pos":"<词性缩写，如 n./v./adj./adv. 等，不确定则留空>"}\n'
        "只输出 JSON，不要 Markdown 代码块，不要其他内容。"
    )
    user_prompt = f"单词：{word}\n翻译目标语言：{target_desc}"

    raw = await _llm_call(system_prompt, user_prompt, temperature=0.1)

    # 容错：提取第一个 {...}
    m = re.search(r"\{.*?\}", raw, re.S)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    logger.warning("get_word_info JSON 解析失败，raw=%r", raw)
    return {"translation": raw, "phonetic": "", "pos": ""}


async def get_examples(word: str, target_lang: str = "zh", count: int = 3) -> list[dict]:
    """
    返回 count 个包含该词的例句，格式：
    [{"sentence": "...", "translation": "..."}, ...]
    """
    target_desc = _lang_label(target_lang)
    system_prompt = (
        "你是英语教学助手。给用户提供包含指定单词的地道例句，并翻译成目标语言。\n"
        "严格按 JSON 数组格式返回：\n"
        '[{"sentence":"<例句>","translation":"<目标语言翻译>"},...]\n'
        "只输出 JSON 数组，不要 Markdown 代码块，不要其他内容。"
    )
    user_prompt = f"单词：{word}\n例句数量：{count}\n翻译目标语言：{target_desc}"

    raw = await _llm_call(system_prompt, user_prompt, temperature=0.7)

    m = re.search(r"\[.*?\]", raw, re.S)
    if m:
        try:
            result = json.loads(m.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass
    logger.warning("get_examples JSON 解析失败，raw=%r", raw)
    return []
