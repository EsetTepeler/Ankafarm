"""Çiftlik geneli kuralların testleri."""

from datetime import date

from insights.rules.farm import (
    FarmData,
    MonthTotals,
    StockLevel,
    farm_birth_rate,
    farm_cost_trend,
    farm_feed_per_animal,
    farm_feed_vs_gain,
    farm_mortality,
    farm_feed_refusal_spike,
    farm_stock_runout,
)
from insights.settings import Thresholds

TODAY = date(2026, 9, 21)
TH = Thresholds()


def months(*values: tuple[str, dict]) -> list[MonthTotals]:
    return [MonthTotals(month=m, **kwargs) for m, kwargs in values]


def test_farm_cost_trend_sicramayi_bulur():
    farm = FarmData(
        today=TODAY,
        months=months(
            ("2026-09", {"expense": 3000}),
            ("2026-08", {"expense": 9000}),
            ("2026-07", {"expense": 5000}),
            ("2026-06", {"expense": 5000}),
            ("2026-05", {"expense": 5000}),
        ),
    )
    finding = farm_cost_trend(farm, TH)
    assert finding is not None
    assert finding.data["change_pct"] == 80.0
    assert "2026-08" in finding.message


def test_farm_cost_trend_kucuk_degisimde_susar():
    farm = FarmData(
        today=TODAY,
        months=months(
            ("2026-09", {"expense": 1000}),
            ("2026-08", {"expense": 5200}),
            ("2026-07", {"expense": 5000}),
            ("2026-06", {"expense": 5000}),
            ("2026-05", {"expense": 5000}),
        ),
    )
    assert farm_cost_trend(farm, TH) is None


def test_farm_feed_per_animal_dusus():
    farm = FarmData(
        today=TODAY,
        months=months(
            ("2026-09", {}),
            ("2026-08", {"feed_quantity": 600, "animal_days": 600}),
            ("2026-07", {"feed_quantity": 900, "animal_days": 600}),
        ),
    )
    finding = farm_feed_per_animal(farm, TH)
    assert finding is not None
    assert finding.severity == "warning"
    assert finding.data["change_pct"] == -33.3


def test_farm_feed_vs_gain():
    farm = FarmData(
        today=TODAY,
        months=months(
            ("2026-09", {}),
            ("2026-08", {"feed_quantity": 1500, "weight_gain": 40}),
            ("2026-07", {"feed_quantity": 1000, "weight_gain": 60}),
        ),
    )
    finding = farm_feed_vs_gain(farm, TH)
    assert finding is not None
    assert finding.data["feed_change_pct"] == 50.0


def test_farm_mortality_kritik():
    farm = FarmData(today=TODAY, animals_now=20, months=months(("2026-09", {}), ("2026-08", {"deaths": 2})))
    finding = farm_mortality(farm, TH)
    assert finding is not None
    assert finding.severity == "critical"


def test_farm_birth_rate_ozet():
    farm = FarmData(today=TODAY, months=months(("2026-09", {}), ("2026-08", {"births": 4, "lambs": 6})))
    finding = farm_birth_rate(farm, TH)
    assert finding is not None
    assert finding.data["per_birth"] == 1.5


def test_stock_runout_siralar():
    farm = FarmData(
        today=TODAY,
        stock=[
            StockLevel("Yonca", "kg", balance=100, daily_use=20, track=True),
            StockLevel("Saman", "balya", balance=40, daily_use=2, track=True),
            StockLevel("Su", "kova", balance=None, daily_use=8, track=False),
        ],
    )
    finding = farm_stock_runout(farm, TH)
    assert finding is not None
    assert finding.data["items"][0]["name"] == "Yonca"
    assert finding.data["items"][0]["days"] == 5
    # Takip edilmeyen kalem listeye girmez.
    assert all(item["name"] != "Su" for item in finding.data["items"])


def test_feed_refusal_spike():
    farm = FarmData(today=TODAY, refusals_last_week=6, refusals_prev_week=2)
    finding = farm_feed_refusal_spike(farm, TH)
    assert finding is not None
    assert finding.data["change_pct"] == 200.0


def test_feed_refusal_spike_az_sayida_susar():
    farm = FarmData(today=TODAY, refusals_last_week=2, refusals_prev_week=1)
    assert farm_feed_refusal_spike(farm, TH) is None


def test_thresholds_ciftlik_ayariyla_degisir():
    th = Thresholds.from_settings({"weight_drop_pct": 8, "bilinmeyen": 1})
    assert th.weight_drop_pct == 8
    assert th.no_weighing_days == Thresholds().no_weighing_days
