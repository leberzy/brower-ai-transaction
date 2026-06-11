import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, ensure_columns, ensure_database_exists, engine
from app.routers import auth, history, translate
from app.services.llm import close_http_client, init_http_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# translation_history 历史新增的布尔列（轻量迁移）
_TRANSLATION_HISTORY_COLUMNS = [
    ("is_learned", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("is_favorited", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("is_pending", "BOOLEAN NOT NULL DEFAULT FALSE"),
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 1) 数据库本身：不存在则创建（仅 PostgreSQL 生效）
    ensure_database_exists()
    # 2) 表结构：缺失的表自动建（已存在则跳过）
    Base.metadata.create_all(bind=engine)
    logger.info("已校验表结构（缺失表已建）")
    # 3) 历史表的新列：缺失则补齐
    ensure_columns("translation_history", _TRANSLATION_HISTORY_COLUMNS)
    # 4) 共享 httpx 客户端
    init_http_client()
    try:
        yield
    finally:
        await close_http_client()


app = FastAPI(title="AI 翻译 API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(translate.router, prefix="/api")
app.include_router(history.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
