# Bağlam: apps/insights. Python içgörü servisi; dışarıya port açmaz, iç ağdan çağrılır.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 TZ=Europe/Istanbul

# Bağımlılıklar önce: kaynak değişince katman yeniden kurulmasın.
COPY pyproject.toml ./
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.32" "psycopg[binary]>=3.2" "apscheduler>=3.10"

COPY src ./src
ENV PYTHONPATH=/app/src

RUN useradd --create-home --uid 1001 insights && chown -R insights /app
USER insights

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health').read()"
CMD ["uvicorn", "insights.api:app", "--host", "0.0.0.0", "--port", "8000"]
