import logging
from collections.abc import Iterable

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)


def _build_engine(database_url: str) -> Engine:
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)


engine = _build_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_database_exists(database_url: str = settings.database_url) -> None:
    """启动时确保目标数据库存在；不存在则自动创建（仅 PostgreSQL）。

    SQLite 由驱动自动建文件，无需处理。
    """
    url = make_url(database_url)
    backend = url.get_backend_name()
    if backend != "postgresql":
        return

    db_name = url.database
    if not db_name:
        raise RuntimeError("DATABASE_URL 缺少数据库名")

    # 连接到默认的 postgres 维护库去检查 / 创建目标库
    admin_url = url.set(database="postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if exists:
                logger.info("数据库 %s 已存在", db_name)
                return
            # 标识符不能参数化，使用双引号转义防注入
            safe_name = db_name.replace('"', '""')
            conn.execute(text(f'CREATE DATABASE "{safe_name}"'))
            logger.info("数据库 %s 不存在，已自动创建", db_name)
    finally:
        admin_engine.dispose()


def ensure_columns(table: str, columns: Iterable[tuple[str, str]]) -> None:
    """为已存在的表补齐缺失列（轻量迁移，PG / SQLite 通用）。

    columns: (列名, 列定义 SQL) 的可迭代对象，例如
        ("is_learned", "BOOLEAN NOT NULL DEFAULT FALSE")
    """
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    with engine.begin() as conn:
        for col_name, col_def in columns:
            if col_name in existing:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
            logger.info("表 %s 补齐列 %s", table, col_name)
