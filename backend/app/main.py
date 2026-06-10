from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.config import settings
from app.database import Base, engine
from app.routers import auth, history, translate


def _migrate_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    insp = inspect(engine)
    if "translation_history" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("translation_history")}
    with engine.begin() as conn:
        if "is_learned" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE translation_history "
                    "ADD COLUMN is_learned BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        if "is_favorited" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE translation_history "
                    "ADD COLUMN is_favorited BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        if "is_pending" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE translation_history "
                    "ADD COLUMN is_pending BOOLEAN NOT NULL DEFAULT 0"
                )
            )


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_sqlite_columns()
    yield


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
