# --- 阶段1：构建依赖 ---
FROM ubuntu:24.04 AS builder

# 安装 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# 先拷贝依赖声明文件，利用 Docker 缓存层
COPY pyproject.toml uv.lock ./

# uv sync 安装依赖到 .venv（不安装项目本身）
RUN uv sync --frozen --no-install-project

# 拷贝项目源码
COPY app ./app

# 安装项目（使 entry point 可用）
RUN uv sync --frozen

# --- 阶段2：运行时镜像 ---
FROM ubuntu:24.04

# 安装运行时最小依赖（psycopg[binary] 需要 libpq）
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从构建阶段拷贝虚拟环境
COPY --from=builder /app/.venv /app/.venv

# 将虚拟环境的 bin 加入 PATH
ENV PATH="/app/.venv/bin:$PATH"

# 拷贝应用源码
COPY app ./app

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
