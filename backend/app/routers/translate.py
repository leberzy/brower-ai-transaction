import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TranslationHistory, User
from app.schemas import (
    ExamplesRequest,
    ExamplesResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.services.llm import LLMError, get_examples, get_word_info, translate_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translate", tags=["translate"])

# 单词判断：去空格后只有一个 token
def _is_single_word(text: str) -> bool:
    return len(text.strip().split()) == 1


@router.post("", response_model=TranslateResponse)
async def translate(
    body: TranslateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    phonetic: str | None = None
    pos: str | None = None

    try:
        if _is_single_word(body.text):
            # 单词模式：一次 LLM 调用获取译文 + 音标 + 词性
            info = await get_word_info(body.text.strip(), body.target_lang)
            translated = info.get("translation") or body.text
            phonetic = info.get("phonetic") or None
            pos = info.get("pos") or None
        else:
            translated = await translate_text(body.text, body.source_lang, body.target_lang)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LLMError as e:
        logger.warning("LLM 调用失败: %s", e)
        raise HTTPException(status_code=502, detail="翻译服务暂不可用，请稍后重试")
    except Exception:
        logger.exception("翻译时发生未预期异常")
        raise HTTPException(status_code=500, detail="服务器内部错误")

    record = TranslationHistory(
        user_id=current_user.id,
        source_text=body.text,
        translated_text=translated,
        source_lang=body.source_lang,
        target_lang=body.target_lang,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # phonetic / pos 不入库，在响应层附加
    resp = TranslateResponse.model_validate(record).model_copy(
        update={"phonetic": phonetic, "pos": pos}
    )
    return resp


@router.post("/examples", response_model=ExamplesResponse)
async def examples(
    body: ExamplesRequest,
    current_user: User = Depends(get_current_user),
):
    """按需获取例句，不保存到数据库。"""
    try:
        items = await get_examples(body.word, body.target_lang, body.count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LLMError as e:
        logger.warning("获取例句 LLM 失败: %s", e)
        raise HTTPException(status_code=502, detail="例句服务暂不可用，请稍后重试")
    except Exception:
        logger.exception("获取例句时发生未预期异常")
        raise HTTPException(status_code=500, detail="服务器内部错误")

    return {"examples": items}
