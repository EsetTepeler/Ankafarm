"""Kural motoru: veriyi yükler, kuralları çalıştırır, bulguları yazar."""

from __future__ import annotations

import logging
from datetime import date

from insights import db
from insights.models import Finding, Herd
from insights.rules.animal import ANIMAL_RULES
from insights.rules.farm import FARM_RULES
from insights.settings import Thresholds

log = logging.getLogger("insights")

ANIMAL_TYPES = [
    "weight_drop",
    "weight_trend_down",
    "overweight",
    "underweight",
    "low_adg",
    "no_weighing",
    "feed_stopped",
    "feed_reduced",
    "withdrawal_active",
    "vaccine_overdue",
    "disease_recurring",
    "birth_due",
    "birth_overdue",
    "pregnancy_check_due",
    "long_lambing_interval",
    "multi_observation",
    "observation_worsening",
]

FARM_TYPES = [
    "farm_cost_trend",
    "farm_feed_per_animal",
    "farm_feed_vs_gain",
    "farm_mortality",
    "farm_birth_rate",
    "farm_stock_runout",
    "farm_feed_refusal_spike",
]


def run_animal_rules(herd: Herd, th: Thresholds, only: str | None = None) -> list[Finding]:
    """Sürüdeki her hayvan için kuralları çalıştırır; `only` verilirse tek hayvan."""
    findings: list[Finding] = []
    for animal in herd.animals:
        if only and animal.id != only:
            continue
        if animal.status != "active" and not only:
            continue
        for rule in ANIMAL_RULES:
            try:
                found = rule(animal, herd, th)
            except Exception:  # noqa: BLE001 - bir kural patlarsa diğerleri çalışmaya devam etsin
                log.exception("kural hatası: %s / %s", rule.__name__, animal.tag_no)
                continue
            if found:
                findings.append(found)
    return findings


def compute_animal(farm_id: str, animal_id: str, today: date | None = None) -> int:
    today = today or date.today()
    with db.connect() as conn:
        th = db.thresholds_for(conn, farm_id)
        herd = db.load_herd(conn, farm_id, today)
        findings = run_animal_rules(herd, th, only=animal_id)
        count = db.save_findings(conn, farm_id, findings, ANIMAL_TYPES, animal_id)
        db.notify_changed(conn, farm_id)
    return count


def compute_farm(farm_id: str, today: date | None = None) -> int:
    """Çiftliğin tamamı: hem hayvan kuralları hem çiftlik geneli."""
    today = today or date.today()
    with db.connect() as conn:
        th = db.thresholds_for(conn, farm_id)
        herd = db.load_herd(conn, farm_id, today)
        animal_findings = run_animal_rules(herd, th)

        farm_data = db.load_farm(conn, farm_id, today)
        farm_findings: list[Finding] = []
        for rule in FARM_RULES:
            try:
                found = rule(farm_data, th)
            except Exception:  # noqa: BLE001
                log.exception("çiftlik kuralı hatası: %s", rule.__name__)
                continue
            if found:
                farm_findings.append(found)

        # Hayvan bulguları hayvan kapsamında, çiftlik bulguları hayvansız kapsamda kapatılır.
        count = db.save_findings(conn, farm_id, animal_findings, [], None)
        count += db.save_findings(conn, farm_id, farm_findings, FARM_TYPES, None)

        # Artık geçerli olmayan hayvan bulguları: her hayvan için ayrı kapatma.
        active_by_animal: dict[str, set[str]] = {}
        for finding in animal_findings:
            if finding.animal_id:
                active_by_animal.setdefault(finding.animal_id, set()).add(finding.type)
        for animal in herd.animals:
            stale = [t for t in ANIMAL_TYPES if t not in active_by_animal.get(animal.id, set())]
            if stale:
                db.save_findings(conn, farm_id, [], stale, animal.id)

        db.notify_changed(conn, farm_id)
    return count


def compute_all(today: date | None = None) -> dict[str, int]:
    """Gece işi: bütün çiftlikler."""
    today = today or date.today()
    results: dict[str, int] = {}
    with db.connect() as conn:
        ids = db.farm_ids(conn)
    for farm_id in ids:
        try:
            results[farm_id] = compute_farm(farm_id, today)
        except Exception:  # noqa: BLE001
            log.exception("çiftlik hesabı başarısız: %s", farm_id)
            results[farm_id] = -1
    return results
