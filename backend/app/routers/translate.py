import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TranslationHistory, User
from app.schemas import TranslateRequest, TranslateResponse
from app.services.llm import LLMError, translate_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translate", tags=["translate"])


@router.post("", response_model=TranslateResponse)
async def translate(
    body: TranslateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        translated = await translate_text(body.text, body.source_lang, body.target_lang)
    except ValueError as e:
        # 配置类错误（缺 API KEY 等）→ 直接暴露给调用方便于排查
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
    return record
