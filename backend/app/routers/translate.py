from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TranslationHistory, User
from app.schemas import TranslateRequest, TranslateResponse
from app.services.llm import translate_text

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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"翻译服务异常: {e}")

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
