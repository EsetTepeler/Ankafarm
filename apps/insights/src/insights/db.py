"""Veritabanı erişimi.

Servis kendi DB rolüyle bağlanır: her tabloda SELECT, yalnızca `insights` tablosunda yazma
(bölüm 3.5). Uygulama buraya hiç bağlanmaz; her şey Node API üzerinden gider.
"""

from __future__ import annotations

import os
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, timedelta

import psycopg
from psycopg.rows import dict_row

from insights.models import Animal, Breeding, Finding, HealthRecord, Herd, Observation, Weighing
from insights.rules.farm import FarmData, MonthTotals, StockLevel
from insights.settings import Thresholds

DATABASE_URL = os.environ.get("DATABASE_URL", "")
# Kilo, tüketim ve gider geçmişi bu kadar ay geriye bakar.
HISTORY_MONTHS = 6


@contextmanager
def connect():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


def farm_ids(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("select id from farms order by created_at")
        return [str(row["id"]) for row in cur.fetchall()]


def thresholds_for(conn, farm_id: str) -> Thresholds:
    with conn.cursor() as cur:
        cur.execute("select settings from farms where id = %s", (farm_id,))
        row = cur.fetchone()
    settings = (row or {}).get("settings") or {}
    return Thresholds.from_settings(settings.get("insights"))


def _as_date(value) -> date | None:
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def load_herd(conn, farm_id: str, today: date, animal_id: str | None = None) -> Herd:
    """Sürüyü tek seferde yükler.

    Tek hayvan hesaplanırken bile sürünün tamamı gerekir: akran karşılaştırması onsuz yapılamaz.
    """
    since = today - timedelta(days=400)
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, tag_no, name, species, sex, status, birth_date, current_weight, is_pregnant, expected_birth_at
            from animals where farm_id = %s and deleted_at is null
            """,
            (farm_id,),
        )
        animals = {
            str(r["id"]): Animal(
                id=str(r["id"]),
                tag_no=r["tag_no"],
                name=r["name"],
                species=r["species"],
                sex=r["sex"],
                status=r["status"],
                birth_date=_as_date(r["birth_date"]),
                current_weight=float(r["current_weight"]) if r["current_weight"] is not None else None,
                is_pregnant=bool(r["is_pregnant"]),
                expected_birth_at=_as_date(r["expected_birth_at"]),
            )
            for r in cur.fetchall()
        }

        cur.execute(
            "select animal_id, weighed_at, weight_kg from weight_records where farm_id = %s and deleted_at is null and weighed_at >= %s",
            (farm_id, since),
        )
        for r in cur.fetchall():
            target = animals.get(str(r["animal_id"]))
            if target:
                target.weights.append(Weighing(_as_date(r["weighed_at"]), float(r["weight_kg"])))

        cur.execute(
            """
            select animal_id, type, product_name, applied_at, next_due_at, withdrawal_until
            from health_records where farm_id = %s and deleted_at is null and applied_at >= %s
            """,
            (farm_id, since),
        )
        for r in cur.fetchall():
            target = animals.get(str(r["animal_id"]))
            if target:
                target.health.append(
                    HealthRecord(r["type"], r["product_name"], _as_date(r["applied_at"]), _as_date(r["next_due_at"]), _as_date(r["withdrawal_until"]))
                )

        cur.execute(
            "select animal_id, observed_at, category, severity, tags from observations where farm_id = %s and deleted_at is null and observed_at >= %s",
            (farm_id, today - timedelta(days=60)),
        )
        for r in cur.fetchall():
            target = animals.get(str(r["animal_id"])) if r["animal_id"] else None
            if target:
                target.observations.append(Observation(_as_date(r["observed_at"]), r["category"], r["severity"], tuple(r["tags"] or ())))

        cur.execute(
            "select female_id, mated_at, pregnancy_result, pregnancy_checked_at from breeding_records where farm_id = %s and deleted_at is null and mated_at >= %s",
            (farm_id, since),
        )
        for r in cur.fetchall():
            target = animals.get(str(r["female_id"]))
            if target:
                target.breedings.append(Breeding(_as_date(r["mated_at"]), r["pregnancy_result"], _as_date(r["pregnancy_checked_at"])))

        cur.execute("select mother_id, born_at from lambing_records where farm_id = %s and deleted_at is null", (farm_id,))
        for r in cur.fetchall():
            target = animals.get(str(r["mother_id"]))
            if target:
                target.lambings.append(_as_date(r["born_at"]))

    herd = Herd(today=today, animals=list(animals.values()))
    if animal_id:
        # Tek hayvan hesabında da sürü bağlamı korunur; kural yalnızca hedef hayvan için çalıştırılır.
        herd.animals = list(animals.values())
    return herd


def load_farm(conn, farm_id: str, today: date) -> FarmData:
    """Aylık toplamlar ve stok durumu."""
    start = (today.replace(day=1) - timedelta(days=31 * HISTORY_MONTHS)).replace(day=1)
    totals: dict[str, MonthTotals] = defaultdict(lambda: MonthTotals(month=""))

    def bucket(month: str) -> MonthTotals:
        item = totals[month]
        if not item.month:
            item.month = month
        return item

    with conn.cursor() as cur:
        cur.execute(
            """
            select to_char(purchased_at, 'YYYY-MM') as month, sum(coalesce(total, 0)) as amount
            from purchases where farm_id = %s and deleted_at is null and purchased_at >= %s group by 1
            """,
            (farm_id, start),
        )
        for r in cur.fetchall():
            bucket(r["month"]).expense += float(r["amount"] or 0)

        cur.execute(
            "select to_char(spent_at, 'YYYY-MM') as month, sum(amount) as amount from expenses where farm_id = %s and deleted_at is null and spent_at >= %s group by 1",
            (farm_id, start),
        )
        for r in cur.fetchall():
            bucket(r["month"]).expense += float(r["amount"] or 0)

        cur.execute(
            "select to_char(received_at, 'YYYY-MM') as month, sum(amount) as amount from incomes where farm_id = %s and deleted_at is null and received_at >= %s group by 1",
            (farm_id, start),
        )
        for r in cur.fetchall():
            bucket(r["month"]).income += float(r["amount"] or 0)

        cur.execute(
            """
            select to_char(c.consumed_on, 'YYYY-MM') as month, sum(c.quantity) as quantity
            from consumptions c join stock_items i on i.id = c.item_id
            where c.farm_id = %s and c.deleted_at is null and i.category = 'feed' and c.consumed_on >= %s group by 1
            """,
            (farm_id, start),
        )
        for r in cur.fetchall():
            bucket(r["month"]).feed_quantity += float(r["quantity"] or 0)

        # Aylık kilo artışı: hayvan başına o ayki ilk ve son tartımın farkı, pozitif olanların toplamı.
        cur.execute(
            """
            select month, sum(greatest(last_kg - first_kg, 0)) as gain from (
              select to_char(weighed_at, 'YYYY-MM') as month, animal_id,
                     (array_agg(weight_kg order by weighed_at))[1] as first_kg,
                     (array_agg(weight_kg order by weighed_at desc))[1] as last_kg
              from weight_records where farm_id = %s and deleted_at is null and weighed_at >= %s
              group by 1, 2
            ) t group by month
            """,
            (farm_id, start),
        )
        for r in cur.fetchall():
            bucket(r["month"]).weight_gain += float(r["gain"] or 0)

        cur.execute(
            """
            select to_char(exited_at, 'YYYY-MM') as month, count(*) as n,
                   count(*) filter (where type = 'died') as deaths
            from exit_records where farm_id = %s and deleted_at is null and exited_at >= %s group by 1
            """,
            (farm_id, start),
        )
        for r in cur.fetchall():
            item = bucket(r["month"])
            item.exits += int(r["n"])
            item.deaths += int(r["deaths"])

        cur.execute(
            """
            select to_char(born_at, 'YYYY-MM') as month, count(*) as births, sum(live_count) as lambs
            from lambing_records where farm_id = %s and deleted_at is null and born_at >= %s group by 1
            """,
            (farm_id, start),
        )
        for r in cur.fetchall():
            item = bucket(r["month"])
            item.births += int(r["births"])
            item.lambs += int(r["lambs"] or 0)

        cur.execute("select count(*) as n from animals where farm_id = %s and deleted_at is null and status = 'active'", (farm_id,))
        animals_now = int(cur.fetchone()["n"])

        # Hayvan-gün: basit yaklaşım, ayın gün sayısı çarpı bugünkü aktif hayvan.
        for month, item in totals.items():
            year, mon = (int(x) for x in month.split("-"))
            next_month = date(year + (mon == 12), 1 if mon == 12 else mon + 1, 1)
            days_in_month = (next_month - date(year, mon, 1)).days
            item.animal_days = animals_now * days_in_month

        cur.execute(
            """
            select i.name, i.unit, i.track_stock,
                   coalesce((select sum(quantity) from purchases p where p.item_id = i.id and p.deleted_at is null), 0) as bought,
                   coalesce((select sum(quantity) from consumptions c where c.item_id = i.id and c.deleted_at is null), 0) as used,
                   coalesce((select sum(quantity) from consumptions c where c.item_id = i.id and c.deleted_at is null and c.consumed_on > %s), 0) as used_14
            from stock_items i where i.farm_id = %s and i.deleted_at is null and i.active
            """,
            (today - timedelta(days=14), farm_id),
        )
        stock = [
            StockLevel(
                name=r["name"],
                unit=r["unit"],
                balance=float(r["bought"]) - float(r["used"]) if r["track_stock"] else None,
                daily_use=float(r["used_14"]) / 14,
                track=bool(r["track_stock"]),
            )
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            select count(distinct animal_id) filter (where observed_at >= %s) as last_week,
                   count(distinct animal_id) filter (where observed_at >= %s and observed_at < %s) as prev_week
            from observations
            where farm_id = %s and deleted_at is null and category = 'feeding' and severity = 'severe'
            """,
            (today - timedelta(days=7), today - timedelta(days=14), today - timedelta(days=7), farm_id),
        )
        refusals = cur.fetchone()

    return FarmData(
        today=today,
        months=list(totals.values()),
        stock=stock,
        animals_now=animals_now,
        refusals_last_week=int(refusals["last_week"] or 0),
        refusals_prev_week=int(refusals["prev_week"] or 0),
    )


def save_findings(conn, farm_id: str, findings: list[Finding], scope_types: list[str], animal_id: str | None) -> int:
    """Bulguları yazar ve artık geçerli olmayanları kapatır.

    Silme yok: koşul ortadan kalkınca `valid_until` geçmişe çekilir, kayıt tarihçede kalır (bölüm 4.7).
    """
    now = datetime.now().astimezone()
    active_types = {f.type for f in findings}
    with conn.cursor() as cur:
        for finding in findings:
            cur.execute(
                """
                insert into insights (farm_id, animal_id, type, severity, title, message, data, computed_at, valid_until)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (farm_id, animal_id, type) do update set
                  severity = excluded.severity, title = excluded.title, message = excluded.message,
                  data = excluded.data, computed_at = excluded.computed_at, valid_until = excluded.valid_until,
                  acknowledged_at = case when insights.data is distinct from excluded.data then null else insights.acknowledged_at end
                """,
                (farm_id, finding.animal_id, finding.type, finding.severity, finding.title, finding.message,
                 psycopg.types.json.Json(finding.data), now, finding.valid_until(now)),
            )

        stale = [t for t in scope_types if t not in active_types]
        if stale:
            cur.execute(
                """
                update insights set valid_until = %s
                where farm_id = %s and type = any(%s) and (valid_until is null or valid_until > %s)
                  and animal_id is not distinct from %s
                """,
                (now, farm_id, stale, now, animal_id),
            )
    conn.commit()
    return len(findings)


def notify_changed(conn, farm_id: str) -> None:
    """Node API dinler ve istemcilere canlı bildirir."""
    with conn.cursor() as cur:
        cur.execute("select pg_notify('insights_changed', %s)", (farm_id,))
    conn.commit()
