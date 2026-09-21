"""Tahminler (madde 5.13).

Bugün kural tabanlı: kilo için doğrusal eğilim, yem için tüketim hızı. Değer üretmekten çok
tahmin/gerçekleşme çiftlerini biriktirmek için var; model doğruluğu ancak bu veri dolunca ölçülür.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from insights.models import Animal, Herd
from insights.rules.animal import _slope_g_per_day  # noqa: PLC2701 - aynı eğim hesabı tek yerde kalsın
from insights.rules.farm import FarmData

log = logging.getLogger("insights")

WEIGHT_MODEL = "weight-trend-v1"
FEED_MODEL = "feed-runout-v1"
HORIZON_DAYS = 30
MIN_POINTS = 3
# Gerçekleşme eşleştirmesinde hedef tarihe bu kadar gün yakın tartım kabul edilir.
MATCH_WINDOW_DAYS = 7


def weight_forecast(animal: Animal, today: date) -> tuple[float, float, dict] | None:
    """30 gün sonrası için kilo tahmini; (değer, güven, açıklama) döner."""
    points = sorted(animal.weights, key=lambda w: w.at)[-5:]
    if len(points) < MIN_POINTS:
        return None
    slope = _slope_g_per_day(points)
    if slope is None:
        return None
    last = points[-1]
    days_ahead = (today - last.at).days + HORIZON_DAYS
    predicted = last.kg + slope / 1000 * days_ahead
    if predicted <= 0:
        return None
    # Güven kaba: nokta sayısı arttıkça ve aralık kısaldıkça artar.
    span = (points[-1].at - points[0].at).days or 1
    confidence = min(0.9, 0.3 + 0.1 * len(points) + (0.2 if span <= 120 else 0))
    payload = {"last_kg": last.kg, "slope_g_per_day": round(slope, 1), "points": len(points), "horizon_days": HORIZON_DAYS}
    return round(predicted, 2), round(confidence, 3), payload


def save_predictions(conn, farm_id: str, herd: Herd, farm: FarmData) -> int:
    """Kilo ve yem tahminlerini yazar. Aynı tür ve hedef tarih için tek kayıt tutulur."""
    now = datetime.now().astimezone()
    written = 0
    with conn.cursor() as cur:
        for animal in herd.animals:
            if animal.status != "active":
                continue
            forecast = weight_forecast(animal, herd.today)
            if not forecast:
                continue
            value, confidence, payload = forecast
            target = herd.today + timedelta(days=HORIZON_DAYS)
            cur.execute(
                """
                select id from predictions
                where farm_id = %s and animal_id = %s and type = 'weight' and evaluated_at is null
                  and target_date::date = %s
                """,
                (farm_id, animal.id, target),
            )
            existing = cur.fetchone()
            import psycopg.types.json as pgjson

            if existing:
                cur.execute(
                    "update predictions set predicted_value = %s, confidence = %s, predicted_payload = %s, predicted_at = %s, updated_at = %s where id = %s",
                    (value, confidence, pgjson.Json(payload), now, now, existing["id"]),
                )
            else:
                cur.execute(
                    """
                    insert into predictions (farm_id, animal_id, type, predicted_value, predicted_payload, confidence, target_date, model_version, source)
                    values (%s, %s, 'weight', %s, %s, %s, %s, %s, 'stats')
                    """,
                    (farm_id, animal.id, value, pgjson.Json(payload), confidence, target, WEIGHT_MODEL),
                )
            written += 1

        for item in farm.stock:
            if not item.track or item.balance is None or item.balance <= 0 or item.daily_use <= 0:
                continue
            days_left = item.balance / item.daily_use
            target = herd.today + timedelta(days=int(days_left))
            import psycopg.types.json as pgjson

            payload = {"item": item.name, "balance": item.balance, "daily_use": round(item.daily_use, 3)}
            cur.execute(
                """
                select id from predictions
                where farm_id = %s and animal_id is null and type = 'feed_runout'
                  and predicted_payload->>'item' = %s and evaluated_at is null
                """,
                (farm_id, item.name),
            )
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    "update predictions set predicted_value = %s, predicted_payload = %s, target_date = %s, predicted_at = %s, updated_at = %s where id = %s",
                    (round(days_left, 2), pgjson.Json(payload), target, now, now, existing["id"]),
                )
            else:
                cur.execute(
                    """
                    insert into predictions (farm_id, animal_id, type, predicted_value, predicted_payload, confidence, target_date, model_version, source)
                    values (%s, null, 'feed_runout', %s, %s, null, %s, %s, 'rule')
                    """,
                    (farm_id, round(days_left, 2), pgjson.Json(payload), target, FEED_MODEL),
                )
            written += 1
    conn.commit()
    return written


def evaluate_predictions(conn, farm_id: str, today: date) -> int:
    """Hedef tarihi geçmiş kilo tahminlerini gerçekleşenle eşleştirir.

    Doğum tahminlerini Node tarafı doğum kaydında eşleştiriyor; burada yalnızca kilo.
    """
    evaluated = 0
    with conn.cursor() as cur:
        cur.execute(
            """
            select p.id, p.animal_id, p.predicted_value, p.target_date
            from predictions p
            where p.farm_id = %s and p.type = 'weight' and p.evaluated_at is null
              and p.target_date::date <= %s
            """,
            (farm_id, today),
        )
        pending = cur.fetchall()
        for row in pending:
            target = row["target_date"]
            target_day = target.date() if hasattr(target, "date") else target
            cur.execute(
                """
                select id, weight_kg, weighed_at
                from weight_records
                where animal_id = %s and deleted_at is null
                  and weighed_at::date between %s and %s
                order by abs(extract(epoch from (weighed_at::date - %s::date))) asc
                limit 1
                """,
                (row["animal_id"], target_day - timedelta(days=MATCH_WINDOW_DAYS), target_day + timedelta(days=MATCH_WINDOW_DAYS), target_day),
            )
            match = cur.fetchone()
            if not match:
                continue
            actual = float(match["weight_kg"])
            error = actual - float(row["predicted_value"] or 0)
            cur.execute(
                """
                update predictions set actual_value = %s, actual_source_table = 'weight_records', actual_source_id = %s,
                  evaluated_at = now(), error = %s, updated_at = now()
                where id = %s
                """,
                (actual, match["id"], round(error, 4), row["id"]),
            )
            evaluated += 1
    conn.commit()
    return evaluated
