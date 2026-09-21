"""Hayvan bazlı kurallar (bölüm 3.5 kural kataloğu).

Her kural saf bir fonksiyondur: (hayvan, sürü, eşikler) alır, bulgu veya None döner.
Eşik değerleri koddan değil `Thresholds` üzerinden gelir.
"""

from __future__ import annotations

from datetime import date, timedelta
from statistics import mean, pstdev

from insights import nlg
from insights.models import Animal, Finding, Herd
from insights.settings import Thresholds

SEVERITY_ORDER = {"normal": 0, "mild": 1, "moderate": 2, "severe": 3}


def _weights_since(animal: Animal, today: date, days: int) -> list:
    since = today - timedelta(days=days)
    return [w for w in sorted(animal.weights, key=lambda w: w.at) if w.at >= since]


def weight_drop(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Son tartım, pencerenin başındaki tartıma göre düştü mü?"""
    points = _weights_since(animal, herd.today, th.weight_window_days)
    if len(points) < 2:
        return None
    first, last = points[0], points[-1]
    if first.kg <= 0 or last.kg >= first.kg:
        return None
    drop = first.kg - last.kg
    pct = drop / first.kg * 100
    if pct < th.weight_drop_pct:
        return None
    critical = pct >= th.weight_drop_critical_pct
    return Finding(
        type="weight_drop",
        severity="critical" if critical else "warning",
        title=f"{animal.label} kilo kaybediyor",
        message=(
            f"Son {th.weight_window_days} günde {nlg.kg(drop)} ({nlg.percent(pct)}) kaybetti: "
            f"{nlg.kg(first.kg)} → {nlg.kg(last.kg)}."
        ),
        data={"from_kg": first.kg, "to_kg": last.kg, "drop_kg": round(drop, 2), "drop_pct": round(pct, 1), "window_days": th.weight_window_days},
        animal_id=animal.id,
    )


def _slope_g_per_day(points) -> float | None:
    """En küçük kareler eğimi, gram/gün. Tek noktada veya aynı günde eğim hesaplanmaz."""
    if len(points) < 2:
        return None
    xs = [(p.at - points[0].at).days for p in points]
    ys = [p.kg for p in points]
    x_mean, y_mean = mean(xs), mean(ys)
    denom = sum((x - x_mean) ** 2 for x in xs)
    if denom == 0:
        return None
    slope_kg = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys, strict=True)) / denom
    return slope_kg * 1000


def weight_trend_down(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Son tartımların eğilimi aşağı mı? Tek bir düşüşten farklı olarak süreklilik arar."""
    points = sorted(animal.weights, key=lambda w: w.at)[-5:]
    if len(points) < th.weight_trend_min_points:
        return None
    slope = _slope_g_per_day(points)
    if slope is None or slope > th.weight_trend_g_per_day:
        return None
    return Finding(
        type="weight_trend_down",
        severity="warning",
        title=f"{animal.label} kilo eğilimi aşağı",
        message=f"Son {len(points)} tartımda günde ortalama {nlg.number(abs(slope), 0)} g kaybediyor.",
        data={"slope_g_per_day": round(slope, 1), "points": len(points)},
        animal_id=animal.id,
    )


def _peer_stats(animal: Animal, herd: Herd, th: Thresholds) -> tuple[float, float, int] | None:
    peers = [p.current_weight for p in herd.peers(animal) if p.current_weight]
    if len(peers) < th.min_peers:
        return None
    spread = pstdev(peers)
    if spread == 0:
        return None
    return mean(peers), spread, len(peers)


def peer_weight(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Akran ortalamasına göre belirgin sapma: aşırı kilolu veya zayıf."""
    if not animal.current_weight or animal.status != "active":
        return None
    stats = _peer_stats(animal, herd, th)
    if not stats:
        return None
    avg, spread, count = stats
    z = (animal.current_weight - avg) / spread
    if abs(z) < th.peer_z_score:
        return None
    heavy = z > 0
    diff_pct = (animal.current_weight - avg) / avg * 100
    return Finding(
        type="overweight" if heavy else "underweight",
        severity="warning",
        title=f"{animal.label} akranlarından {'ağır' if heavy else 'hafif'}",
        message=(
            f"Aynı yaş grubundaki {nlg.plural_animals(count)} ortalaması {nlg.kg(avg)}; "
            f"bu hayvan {nlg.kg(animal.current_weight)}, {nlg.percent(diff_pct)} {'üzerinde' if heavy else 'altında'}."
        ),
        data={"weight_kg": animal.current_weight, "peer_avg_kg": round(avg, 2), "z": round(z, 2), "peers": count},
        animal_id=animal.id,
    )


def _adg(animal: Animal) -> float | None:
    """Doğumdan bu yana günlük ortalama kilo artışı, gram."""
    if not animal.birth_date or not animal.weights:
        return None
    last = max(animal.weights, key=lambda w: w.at)
    days = (last.at - animal.birth_date).days
    if days <= 0:
        return None
    return last.kg / days * 1000


def low_adg(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Yavruda büyüme hızı akranlarının belirgin altında mı?"""
    age = animal.age_days(herd.today)
    if age is None or age > 365:
        return None
    own = _adg(animal)
    if own is None:
        return None
    peer_values = [v for v in (_adg(p) for p in herd.peers(animal)) if v]
    if len(peer_values) < th.min_peers:
        return None
    peer_avg = mean(peer_values)
    if peer_avg <= 0 or own >= peer_avg * th.low_adg_ratio:
        return None
    return Finding(
        type="low_adg",
        severity="warning",
        title=f"{animal.label} yavaş büyüyor",
        message=(
            f"Günlük artışı {nlg.number(own, 0)} g; akranlarının ortalaması {nlg.number(peer_avg, 0)} g. "
            f"Akran ortalamasının {nlg.percent(own / peer_avg * 100)} kadarı."
        ),
        data={"adg_g": round(own), "peer_adg_g": round(peer_avg), "peers": len(peer_values)},
        animal_id=animal.id,
    )


def no_weighing(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    if animal.status != "active":
        return None
    if not animal.weights:
        return Finding(
            type="no_weighing",
            severity="info",
            title=f"{animal.label} hiç tartılmadı",
            message="Bu hayvanın hiç tartım kaydı yok; büyüme takibi için bir tartım gerekli.",
            data={"days": None},
            animal_id=animal.id,
        )
    last = max(w.at for w in animal.weights)
    gap = (herd.today - last).days
    if gap < th.no_weighing_days:
        return None
    return Finding(
        type="no_weighing",
        severity="info",
        title=f"{animal.label} uzun süredir tartılmadı",
        message=f"Son tartım {nlg.date_tr(last)}, {nlg.days(gap)} önce.",
        data={"days": gap, "last_at": last.isoformat()},
        animal_id=animal.id,
    )


def _feeding_days(animal: Animal, herd: Herd, level: set[str], window: int) -> int:
    """Bugünden geriye doğru, verilen şiddette kesintisiz yem gözlemi günü sayısı."""
    by_day = {o.at: o for o in sorted(animal.observations, key=lambda o: o.at) if o.category == "feeding"}
    streak = 0
    for offset in range(window):
        day = herd.today - timedelta(days=offset)
        observation = by_day.get(day)
        if observation is None:
            # Gözlem girilmemiş gün zinciri bozmaz ama saymaz da.
            continue
        if observation.severity in level:
            streak += 1
        else:
            break
    return streak


def feed_stopped(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    streak = _feeding_days(animal, herd, {"severe"}, th.feed_stopped_days + 3)
    if streak < th.feed_stopped_days:
        return None
    return Finding(
        type="feed_stopped",
        severity="critical",
        title=f"{animal.label} yem yemiyor",
        message=f"{nlg.days(streak)} üst üste yemedi olarak işaretlendi. Veterinerle konuş.",
        data={"days": streak},
        animal_id=animal.id,
        valid_days=7,
    )


def feed_reduced(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    streak = _feeding_days(animal, herd, {"mild", "moderate", "severe"}, th.feed_reduced_days + 3)
    if streak < th.feed_reduced_days:
        return None
    return Finding(
        type="feed_reduced",
        severity="warning",
        title=f"{animal.label} iştahı azaldı",
        message=f"{nlg.days(streak)} üst üste az yedi veya yemedi olarak işaretlendi.",
        data={"days": streak},
        animal_id=animal.id,
        valid_days=7,
    )


def withdrawal_active(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    active = [h for h in animal.health if h.withdrawal_until and h.withdrawal_until >= herd.today]
    if not active:
        return None
    latest = max(active, key=lambda h: h.withdrawal_until)  # type: ignore[arg-type]
    return Finding(
        type="withdrawal_active",
        severity="warning",
        title=f"{animal.label} arınma süresinde",
        message=f"{latest.product or 'İlaç'} sonrası {nlg.date_tr(latest.withdrawal_until)} tarihine kadar süt ve et kullanılmamalı.",
        data={"until": latest.withdrawal_until.isoformat(), "product": latest.product},
        animal_id=animal.id,
        valid_days=(latest.withdrawal_until - herd.today).days + 1,
    )


def vaccine_overdue(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    overdue = [h for h in animal.health if h.next_due_at and h.next_due_at < herd.today]
    if not overdue or animal.status != "active":
        return None
    oldest = min(overdue, key=lambda h: h.next_due_at)  # type: ignore[arg-type]
    late = (herd.today - oldest.next_due_at).days
    return Finding(
        type="vaccine_overdue",
        severity="critical" if late > 30 else "warning",
        title=f"{animal.label} dozu gecikti",
        message=f"{oldest.product or 'Doz'} {nlg.date_tr(oldest.next_due_at)} tarihinde yapılmalıydı, {nlg.days(late)} geçti.",
        data={"due_at": oldest.next_due_at.isoformat(), "late_days": late, "product": oldest.product},
        animal_id=animal.id,
    )


def disease_recurring(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Aynı hastalık kısa sürede tekrar ettiyse; kronik veya çevresel bir sorunun işareti."""
    diseases = [h for h in animal.health if h.type == "disease" and h.product]
    by_name: dict[str, list] = {}
    for record in diseases:
        by_name.setdefault(record.product.lower(), []).append(record.applied_at)  # type: ignore[union-attr]
    for name, dates in by_name.items():
        dates.sort()
        for earlier, later in zip(dates, dates[1:], strict=False):
            if (later - earlier).days <= th.disease_recurrence_days:
                return Finding(
                    type="disease_recurring",
                    severity="warning",
                    title=f"{animal.label} aynı hastalığı tekrarladı",
                    message=f"{name.capitalize()} {nlg.date_tr(earlier)} ve {nlg.date_tr(later)} tarihlerinde kaydedildi.",
                    data={"disease": name, "first": earlier.isoformat(), "second": later.isoformat()},
                    animal_id=animal.id,
                )
    return None


def birth_due(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    if not animal.is_pregnant or not animal.expected_birth_at:
        return None
    left = (animal.expected_birth_at - herd.today).days
    if left > th.birth_due_days:
        return None
    if left < -10:
        return Finding(
            type="birth_overdue",
            severity="warning",
            title=f"{animal.label} doğum tarihi geçti",
            message=f"Beklenen doğum {nlg.date_tr(animal.expected_birth_at)} idi, {nlg.days(-left)} geçti. Gebelik kaydı güncel mi?",
            data={"expected": animal.expected_birth_at.isoformat(), "late_days": -left},
            animal_id=animal.id,
        )
    return Finding(
        type="birth_due",
        severity="info",
        title=f"{animal.label} doğuma yaklaştı",
        message=(
            f"Beklenen doğum {nlg.date_tr(animal.expected_birth_at)}"
            + (f", {nlg.days(left)} kaldı." if left > 0 else ", bugün." if left == 0 else f", {nlg.days(-left)} geçti.")
        ),
        data={"expected": animal.expected_birth_at.isoformat(), "days_left": left},
        animal_id=animal.id,
        valid_days=max(1, left + 10),
    )


def pregnancy_check_due(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    pending = [b for b in animal.breedings if b.result == "pending"]
    if not pending:
        return None
    oldest = min(pending, key=lambda b: b.mated_at)
    passed = (herd.today - oldest.mated_at).days
    if passed < th.pregnancy_check_days:
        return None
    return Finding(
        type="pregnancy_check_due",
        severity="info",
        title=f"{animal.label} gebelik kontrolü bekliyor",
        message=f"Çiftleşmenin üzerinden {nlg.days(passed)} geçti, sonuç hâlâ girilmedi.",
        data={"mated_at": oldest.mated_at.isoformat(), "days": passed},
        animal_id=animal.id,
    )


def long_lambing_interval(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    if animal.sex != "female" or not animal.lambings or animal.is_pregnant or animal.status != "active":
        return None
    last = max(animal.lambings)
    gap = (herd.today - last).days
    if gap < th.long_lambing_interval_days:
        return None
    return Finding(
        type="long_lambing_interval",
        severity="info",
        title=f"{animal.label} uzun süredir doğurmadı",
        message=f"Son doğum {nlg.date_tr(last)}, {nlg.days(gap)} önce. Damızlık değerini gözden geçir.",
        data={"last_birth": last.isoformat(), "days": gap},
        animal_id=animal.id,
        valid_days=30,
    )


def multi_observation(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Birden çok alanda aynı anda olağandışı: tek başına küçük olan işaretler birlikte anlamlı."""
    since = herd.today - timedelta(days=th.multi_observation_days)
    recent = [o for o in animal.observations if o.at >= since and o.severity in {"mild", "moderate", "severe"}]
    categories = {o.category for o in recent}
    if len(categories) < th.multi_observation_categories:
        return None
    tags = sorted({tag for o in recent for tag in o.tags})
    return Finding(
        type="multi_observation",
        severity="warning",
        title=f"{animal.label} birden çok belirti gösteriyor",
        message=(
            f"Son {nlg.days(th.multi_observation_days)} içinde {len(categories)} farklı alanda olağandışı gözlem var"
            + (f": {', '.join(tags)}." if tags else ".")
        ),
        data={"categories": sorted(categories), "tags": tags, "count": len(recent)},
        animal_id=animal.id,
        valid_days=7,
    )


def observation_worsening(animal: Animal, herd: Herd, th: Thresholds) -> Finding | None:
    """Aynı kategoride şiddet art arda arttıysa durum kötüleşiyor demektir."""
    by_category: dict[str, list] = {}
    for observation in sorted(animal.observations, key=lambda o: o.at):
        by_category.setdefault(observation.category, []).append(observation)
    for category, items in by_category.items():
        recent = items[-th.observation_worsening_count - 1 :]
        if len(recent) < th.observation_worsening_count + 1:
            continue
        levels = [SEVERITY_ORDER.get(o.severity, 0) for o in recent]
        if all(later > earlier for earlier, later in zip(levels, levels[1:], strict=False)) and levels[-1] >= SEVERITY_ORDER["moderate"]:
            return Finding(
                type="observation_worsening",
                severity="warning",
                title=f"{animal.label} durumu kötüleşiyor",
                message=f"{category} alanındaki gözlemler art arda ağırlaştı ({' → '.join(o.severity for o in recent)}).",
                data={"category": category, "levels": levels},
                animal_id=animal.id,
                valid_days=7,
            )
    return None


ANIMAL_RULES = [
    weight_drop,
    weight_trend_down,
    peer_weight,
    low_adg,
    no_weighing,
    feed_stopped,
    feed_reduced,
    withdrawal_active,
    vaccine_overdue,
    disease_recurring,
    birth_due,
    pregnancy_check_due,
    long_lambing_interval,
    multi_observation,
    observation_worsening,
]
