"""Kural eşikleri.

Varsayılanlar burada; çiftlik `farms.settings.insights` altında istediğini değiştirebilir
(bölüm 3.5). Kodda sabit eşik yok, hepsi buradan geçer.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Any


@dataclass(frozen=True)
class Thresholds:
    # Kilo
    weight_drop_pct: float = 5.0
    weight_drop_critical_pct: float = 10.0
    weight_window_days: int = 30
    weight_trend_min_points: int = 4
    weight_trend_g_per_day: float = -50.0
    peer_z_score: float = 1.5
    min_peers: int = 8
    low_adg_ratio: float = 0.7
    no_weighing_days: int = 60

    # Beslenme (gözlemlerden)
    feed_stopped_days: int = 2
    feed_reduced_days: int = 4
    feed_per_animal_drop_pct: float = 15.0

    # Sağlık ve üreme
    disease_recurrence_days: int = 90
    birth_due_days: int = 7
    pregnancy_check_days: int = 45
    long_lambing_interval_days: int = 400

    # Gözlem
    multi_observation_days: int = 3
    multi_observation_categories: int = 2
    observation_worsening_count: int = 2

    # Çiftlik geneli
    farm_cost_jump_pct: float = 25.0
    farm_feed_vs_gain_pct: float = 20.0
    farm_mortality_pct: float = 5.0
    stock_runout_days: int = 14
    feed_refusal_spike_pct: float = 20.0

    @classmethod
    def from_settings(cls, settings: dict[str, Any] | None) -> Thresholds:
        """farms.settings.insights içindeki değerlerle varsayılanları birleştirir."""
        if not settings:
            return cls()
        known = {f.name for f in fields(cls)}
        values = {k: v for k, v in settings.items() if k in known and isinstance(v, (int, float))}
        return cls(**values)  # type: ignore[arg-type]
