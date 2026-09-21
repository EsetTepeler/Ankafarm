"""Gece hesabı.

Her gece 03:00'te bütün çiftlikler yeniden hesaplanır (bölüm 3.5). Gün içindeki
değişiklikler Node API'nin tetiklediği uçlardan gelir.
"""

from __future__ import annotations

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from insights import engine

log = logging.getLogger("insights")
_scheduler: BackgroundScheduler | None = None


def _nightly() -> None:
    log.info("gece hesabı başlıyor")
    results = engine.compute_all()
    log.info("gece hesabı bitti: %s", results)


def start_scheduler() -> BackgroundScheduler | None:
    global _scheduler
    if _scheduler or os.environ.get("INSIGHTS_DISABLE_SCHEDULER") == "1":
        return _scheduler
    timezone = os.environ.get("TZ", "Europe/Istanbul")
    hour = int(os.environ.get("INSIGHTS_NIGHTLY_HOUR", "3"))
    _scheduler = BackgroundScheduler(timezone=timezone)
    _scheduler.add_job(_nightly, CronTrigger(hour=hour, minute=0), id="nightly", replace_existing=True)
    _scheduler.start()
    log.info("zamanlayıcı kuruldu: her gün %02d:00 (%s)", hour, timezone)
    return _scheduler
