from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TranslationHistory, User
from app.schemas import HistoryCreate, HistoryListResponse, HistoryUpdate, TranslateResponse

router = APIRouter(prefix="/history", tags=["history"])


def _get_user_item(db: Session, user_id: int, history_id: int) -> TranslationHistory | None:
    return (
        db.query(TranslationHistory)
        .filter(TranslationHistory.id == history_id, TranslationHistory.user_id == user_id)
        .first()
    )


@router.get("", response_model=HistoryListResponse)
def list_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    start_date: date | None = Query(None, description="开始日期（含）"),
    end_date: date | None = Query(None, description="结束日期（含）"),
    is_learned: bool | None = Query(None, description="筛选已学会"),
    is_favorited: bool | None = Query(None, description="筛选收藏"),
    is_pending: bool | None = Query(None, description="筛选待学"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")

    q = db.query(TranslationHistory).filter(TranslationHistory.user_id == current_user.id)
    if start_date:
        q = q.filter(
            TranslationHistory.created_at
            >= datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        )
    if end_date:
        q = q.filter(
            TranslationHistory.created_at
            <= datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        )
    if is_learned is not None:
        q = q.filter(TranslationHistory.is_learned == is_learned)
    if is_favorited is not None:
        q = q.filter(TranslationHistory.is_favorited == is_favorited)
    if is_pending is not None:
        q = q.filter(TranslationHistory.is_pending == is_pending)
    total = q.with_entities(func.count(TranslationHistory.id)).scalar() or 0
    items = (
        q.order_by(desc(TranslationHistory.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return HistoryListResponse(items=items, total=total)


@router.post("", response_model=TranslateResponse, status_code=status.HTTP_201_CREATED)
def create_history(
    body: HistoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = TranslationHistory(
        user_id=current_user.id,
        source_text=body.source_text,
        translated_text=body.translated_text,
        source_lang=body.source_lang,
        target_lang=body.target_lang,
        is_learned=body.is_learned,
        is_favorited=body.is_favorited,
        is_pending=body.is_pending,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/{history_id}", response_model=TranslateResponse)
def get_history_item(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_user_item(db, current_user.id, history_id)
    if item is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return item


@router.put("/{history_id}", response_model=TranslateResponse)
def update_history(
    history_id: int,
    body: HistoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_user_item(db, current_user.id, history_id)
    if item is None:
        raise HTTPException(status_code=404, detail="记录不存在")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="没有可更新的字段")

    for key, value in updates.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{history_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_user_item(db, current_user.id, history_id)
    if item is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(item)
    db.commit()
