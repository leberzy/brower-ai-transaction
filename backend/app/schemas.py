from datetime import datetime

from pydantic import BaseModel, Field


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    source_lang: str = Field(default="auto", max_length=16)
    target_lang: str = Field(default="zh", max_length=16)


class TranslateResponse(BaseModel):
    id: int
    source_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryListResponse(BaseModel):
    items: list[TranslateResponse]
    total: int


class HistoryCreate(BaseModel):
    source_text: str = Field(min_length=1, max_length=10000)
    translated_text: str = Field(min_length=1, max_length=10000)
    source_lang: str = Field(default="en", max_length=16)
    target_lang: str = Field(default="zh", max_length=16)


class HistoryUpdate(BaseModel):
    source_text: str | None = Field(default=None, min_length=1, max_length=10000)
    translated_text: str | None = Field(default=None, min_length=1, max_length=10000)
    source_lang: str | None = Field(default=None, max_length=16)
    target_lang: str | None = Field(default=None, max_length=16)
