"""FastAPI uçları.

Servis dışarıya port açmaz; yalnızca iç ağdan Node API çağırır (bölüm 3.5).
Hesaplar kısa sürdüğü için arka plan görevine gerek yok; uzarsa 202 dönmeye geçilir.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import date

from fastapi import FastAPI, HTTPException

from insights import db, engine
from insights.scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("insights")

app = FastAPI(title="Anka Farm içgörü servisi", version="0.1.0")

# Aynı hayvan için arka arkaya gelen istekler tek hesaba düşsün (bölüm 3.5, debounce).
DEBOUNCE_SECONDS = float(os.environ.get("INSIGHTS_DEBOUNCE_SECONDS", "30"))
_last_run: dict[str, float] = {}
_lock = threading.Lock()


def _should_skip(key: str) -> bool:
    with _lock:
        last = _last_run.get(key, 0.0)
        now = time.monotonic()
        if now - last < DEBOUNCE_SECONDS:
            return True
        _last_run[key] = now
        return False


@app.on_event("startup")
def _startup() -> None:
    start_scheduler()


@app.get("/health")
def health() -> dict[str, object]:
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("select 1")
        return {"ok": True, "time": date.today().isoformat()}
    except Exception as err:  # noqa: BLE001
        log.exception("sağlık kontrolü başarısız")
        raise HTTPException(status_code=503, detail=str(err)) from err


@app.post("/compute/animal/{farm_id}/{animal_id}")
def compute_animal(farm_id: str, animal_id: str) -> dict[str, object]:
    if _should_skip(f"animal:{animal_id}"):
        return {"skipped": True, "reason": "debounce"}
    count = engine.compute_animal(farm_id, animal_id)
    return {"skipped": False, "findings": count}


@app.post("/compute/farm/{farm_id}")
def compute_farm(farm_id: str) -> dict[str, object]:
    if _should_skip(f"farm:{farm_id}"):
        return {"skipped": True, "reason": "debounce"}
    count = engine.compute_farm(farm_id)
    return {"skipped": False, "findings": count}


@app.post("/compute/all")
def compute_all() -> dict[str, object]:
    return {"farms": engine.compute_all()}
