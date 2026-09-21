"""Çiftlik geneli kurallar (bölüm 3.5).

Hayvan kurallarından farkı: girdi tek tek hayvanlar değil, aylık toplamlar ve stok durumu.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from insights import nlg
from insights.models import Finding
from insights.settings import Thresholds


@dataclass
class MonthTotals:
    month: str
    expense: float = 0.0
    income: float = 0.0
    feed_cost: float = 0.0
    feed_quantity: float = 0.0
    weight_gain: float = 0.0
    animal_days: int = 0
    exits: int = 0
    deaths: int = 0
    births: int = 0
    lambs: int = 0


@dataclass
class StockLevel:
    name: str
    unit: str
    balance: float | None
    daily_use: float
    track: bool


@dataclass
class FarmData:
    today: date
    months: list[MonthTotals] = field(default_factory=list)
    stock: list[StockLevel] = field(default_factory=list)
    animals_now: int = 0
    refusals_last_week: int = 0
    refusals_prev_week: int = 0

    def month(self, offset: int) -> MonthTotals | None:
        """0 = içinde bulunulan ay, 1 = önceki ay."""
        ordered = sorted(self.months, key=lambda m: m.month, reverse=True)
        return ordered[offset] if len(ordered) > offset else None


def farm_cost_trend(farm: FarmData, th: Thresholds) -> Finding | None:
    """Geçen ayın gideri, önceki üç ayın ortalamasına göre sıçradı mı?"""
    ordered = sorted(farm.months, key=lambda m: m.month, reverse=True)
    if len(ordered) < 4:
        return None
    last = ordered[1]  # tamamlanmış son ay
    baseline = [m.expense for m in ordered[2:5] if m.expense > 0]
    if not baseline or last.expense <= 0:
        return None
    avg = sum(baseline) / len(baseline)
    change = (last.expense - avg) / avg * 100
    if abs(change) < th.farm_cost_jump_pct:
        return None
    up = change > 0
    return Finding(
        type="farm_cost_trend",
        severity="warning" if up else "info",
        title=f"Aylık gider {'arttı' if up else 'azaldı'}",
        message=(
            f"{last.month} ayında {nlg.money(last.expense)} harcandı; önceki üç ayın ortalaması {nlg.money(avg)}. "
            f"Değişim {nlg.percent(change)}."
        ),
        data={"month": last.month, "expense": round(last.expense, 2), "baseline": round(avg, 2), "change_pct": round(change, 1)},
        valid_days=30,
    )


def farm_feed_per_animal(farm: FarmData, th: Thresholds) -> Finding | None:
    """Hayvan başına yem tüketimi belirgin değiştiyse."""
    ordered = sorted(farm.months, key=lambda m: m.month, reverse=True)
    if len(ordered) < 3:
        return None
    last, previous = ordered[1], ordered[2]
    if last.animal_days <= 0 or previous.animal_days <= 0:
        return None
    now = last.feed_quantity / last.animal_days
    before = previous.feed_quantity / previous.animal_days
    if before <= 0:
        return None
    change = (now - before) / before * 100
    if abs(change) < th.feed_per_animal_drop_pct:
        return None
    up = change > 0
    return Finding(
        type="farm_feed_per_animal",
        severity="info" if up else "warning",
        title=f"Hayvan başı yem tüketimi {'arttı' if up else 'düştü'}",
        message=(
            f"{last.month} ayında hayvan başına günde {nlg.number(now, 2)} birim yem verildi; "
            f"önceki ay {nlg.number(before, 2)}. Değişim {nlg.percent(change)}."
        ),
        data={"month": last.month, "per_animal_day": round(now, 3), "previous": round(before, 3), "change_pct": round(change, 1)},
        valid_days=30,
    )


def farm_feed_vs_gain(farm: FarmData, th: Thresholds) -> Finding | None:
    """Yem tüketimi arttı ama sürü kilo almadıysa; verim düşüyor demektir."""
    ordered = sorted(farm.months, key=lambda m: m.month, reverse=True)
    if len(ordered) < 3:
        return None
    last, previous = ordered[1], ordered[2]
    if previous.feed_quantity <= 0 or previous.weight_gain <= 0 or last.feed_quantity <= 0:
        return None
    feed_change = (last.feed_quantity - previous.feed_quantity) / previous.feed_quantity * 100
    gain_change = (last.weight_gain - previous.weight_gain) / previous.weight_gain * 100
    if feed_change < th.farm_feed_vs_gain_pct or gain_change > 0:
        return None
    return Finding(
        type="farm_feed_vs_gain",
        severity="warning",
        title="Yem arttı, kilo artışı artmadı",
        message=(
            f"{last.month} ayında yem tüketimi {nlg.percent(feed_change)} arttı ama sürünün kilo artışı "
            f"{nlg.percent(gain_change)} değişti ({nlg.kg(last.weight_gain)})."
        ),
        data={"month": last.month, "feed_change_pct": round(feed_change, 1), "gain_change_pct": round(gain_change, 1)},
        valid_days=30,
    )


def farm_mortality(farm: FarmData, th: Thresholds) -> Finding | None:
    ordered = sorted(farm.months, key=lambda m: m.month, reverse=True)
    if len(ordered) < 2 or farm.animals_now <= 0:
        return None
    last = ordered[1]
    if last.deaths == 0:
        return None
    rate = last.deaths / max(farm.animals_now, 1) * 100
    if rate < th.farm_mortality_pct:
        return None
    return Finding(
        type="farm_mortality",
        severity="critical",
        title="Ölüm oranı yüksek",
        message=f"{last.month} ayında {last.deaths} hayvan öldü; sürünün {nlg.percent(rate)} kadarı.",
        data={"month": last.month, "deaths": last.deaths, "rate_pct": round(rate, 1)},
        valid_days=30,
    )


def farm_birth_rate(farm: FarmData, th: Thresholds) -> Finding | None:
    ordered = sorted(farm.months, key=lambda m: m.month, reverse=True)
    recent = [m for m in ordered[1:7] if m.births > 0]
    if not recent:
        return None
    births = sum(m.births for m in recent)
    lambs = sum(m.lambs for m in recent)
    if births == 0:
        return None
    per_birth = lambs / births
    return Finding(
        type="farm_birth_rate",
        severity="info",
        title="Doğum performansı",
        message=f"Son altı ayda {births} doğumda {lambs} yavru: doğum başına {nlg.number(per_birth, 2)}.",
        data={"births": births, "lambs": lambs, "per_birth": round(per_birth, 2)},
        valid_days=30,
    )


def farm_stock_runout(farm: FarmData, th: Thresholds) -> Finding | None:
    """Mevcut tüketim hızıyla yakında bitecek kalemler."""
    soon = []
    for item in farm.stock:
        if not item.track or item.balance is None or item.balance <= 0 or item.daily_use <= 0:
            continue
        days_left = int(item.balance / item.daily_use)
        if days_left <= th.stock_runout_days:
            soon.append((item, days_left))
    if not soon:
        return None
    soon.sort(key=lambda pair: pair[1])
    first, first_days = soon[0]
    names = ", ".join(f"{item.name} ({nlg.days(days)})" for item, days in soon[:3])
    return Finding(
        type="farm_stock_runout",
        severity="critical" if first_days <= 3 else "warning",
        title=f"{first.name} bitmek üzere",
        message=f"Mevcut tüketim hızıyla: {names}.",
        data={"items": [{"name": item.name, "days": days, "balance": item.balance} for item, days in soon]},
        valid_days=7,
    )


def farm_feed_refusal_spike(farm: FarmData, th: Thresholds) -> Finding | None:
    """Yemeyen hayvan sayısı ani arttıysa sürü düzeyinde bir sorun olabilir."""
    if farm.refusals_prev_week <= 0:
        if farm.refusals_last_week >= 3:
            return Finding(
                type="farm_feed_refusal_spike",
                severity="warning",
                title="Yem yemeyen hayvan sayısı arttı",
                message=f"Bu hafta {nlg.plural_animals(farm.refusals_last_week)} yemedi olarak işaretlendi; geçen hafta hiç yoktu.",
                data={"last_week": farm.refusals_last_week, "previous_week": 0},
                valid_days=7,
            )
        return None
    change = (farm.refusals_last_week - farm.refusals_prev_week) / farm.refusals_prev_week * 100
    if change < th.feed_refusal_spike_pct or farm.refusals_last_week < 3:
        return None
    return Finding(
        type="farm_feed_refusal_spike",
        severity="warning",
        title="Yem yemeyen hayvan sayısı arttı",
        message=(
            f"Bu hafta {nlg.plural_animals(farm.refusals_last_week)} yemedi; geçen hafta "
            f"{nlg.plural_animals(farm.refusals_prev_week)}. Artış {nlg.percent(change)}."
        ),
        data={"last_week": farm.refusals_last_week, "previous_week": farm.refusals_prev_week, "change_pct": round(change, 1)},
        valid_days=7,
    )


FARM_RULES = [
    farm_cost_trend,
    farm_feed_per_animal,
    farm_feed_vs_gain,
    farm_mortality,
    farm_birth_rate,
    farm_stock_runout,
    farm_feed_refusal_spike,
]
