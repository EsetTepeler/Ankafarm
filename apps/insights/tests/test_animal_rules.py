"""Hayvan kurallarının testleri: veritabanı yok, saf fonksiyonlar."""

from datetime import date, timedelta

from insights.models import Animal, Breeding, HealthRecord, Herd, Observation, Weighing
from insights.rules import animal as rules
from insights.settings import Thresholds

TODAY = date(2026, 9, 21)
TH = Thresholds()


def herd(*animals: Animal) -> Herd:
    return Herd(today=TODAY, animals=list(animals))


def sheep(**kwargs) -> Animal:
    base = dict(id="a1", tag_no="TR-1", name=None, species="sheep", sex="female", status="active")
    base.update(kwargs)
    return Animal(**base)


def test_weight_drop_uyari_verir():
    a = sheep(weights=[Weighing(TODAY - timedelta(days=25), 60.0), Weighing(TODAY - timedelta(days=2), 55.0)])
    finding = rules.weight_drop(a, herd(a), TH)
    assert finding is not None
    assert finding.severity == "warning"
    assert finding.data["drop_kg"] == 5.0
    assert "8,3" in finding.message  # %8,3 kayıp


def test_weight_drop_kritik_esik():
    a = sheep(weights=[Weighing(TODAY - timedelta(days=20), 60.0), Weighing(TODAY, 53.0)])
    finding = rules.weight_drop(a, herd(a), TH)
    assert finding.severity == "critical"


def test_weight_drop_artista_susar():
    a = sheep(weights=[Weighing(TODAY - timedelta(days=20), 50.0), Weighing(TODAY, 55.0)])
    assert rules.weight_drop(a, herd(a), TH) is None


def test_weight_trend_down_egim():
    points = [Weighing(TODAY - timedelta(days=d), 60.0 - (30 - d) * 0.08) for d in (30, 20, 10, 0)]
    a = sheep(weights=points)
    finding = rules.weight_trend_down(a, herd(a), TH)
    assert finding is not None
    assert finding.data["slope_g_per_day"] < TH.weight_trend_g_per_day


def test_peer_weight_az_akranla_susar():
    a = sheep(current_weight=40.0, birth_date=TODAY - timedelta(days=800))
    peers = [sheep(id=f"p{i}", tag_no=f"P{i}", current_weight=60.0, birth_date=TODAY - timedelta(days=800)) for i in range(3)]
    assert rules.peer_weight(a, herd(a, *peers), TH) is None


def test_peer_weight_sapmayi_bulur():
    a = sheep(current_weight=40.0, birth_date=TODAY - timedelta(days=800))
    peers = [sheep(id=f"p{i}", tag_no=f"P{i}", current_weight=60.0 + i * 0.5, birth_date=TODAY - timedelta(days=800)) for i in range(10)]
    finding = rules.peer_weight(a, herd(a, *peers), TH)
    assert finding is not None
    assert finding.type == "underweight"


def test_no_weighing_hic_tartilmamis():
    a = sheep()
    finding = rules.no_weighing(a, herd(a), TH)
    assert finding is not None
    assert finding.data["days"] is None


def test_feed_stopped_ardisik_gun():
    obs = [Observation(TODAY - timedelta(days=d), "feeding", "severe") for d in (0, 1)]
    a = sheep(observations=obs)
    finding = rules.feed_stopped(a, herd(a), TH)
    assert finding is not None
    assert finding.severity == "critical"


def test_feed_stopped_zincir_kirilirsa_susar():
    obs = [Observation(TODAY, "feeding", "severe"), Observation(TODAY - timedelta(days=1), "feeding", "normal")]
    a = sheep(observations=obs)
    assert rules.feed_stopped(a, herd(a), TH) is None


def test_vaccine_overdue_gun_sayar():
    a = sheep(health=[HealthRecord("vaccine", "Enterotoksemi", TODAY - timedelta(days=200), TODAY - timedelta(days=40), None)])
    finding = rules.vaccine_overdue(a, herd(a), TH)
    assert finding is not None
    assert finding.data["late_days"] == 40
    assert finding.severity == "critical"


def test_withdrawal_active_sure_bitince_susar():
    a = sheep(health=[HealthRecord("medication", "X", TODAY - timedelta(days=20), None, TODAY - timedelta(days=1))])
    assert rules.withdrawal_active(a, herd(a), TH) is None


def test_disease_recurring():
    a = sheep(
        health=[
            HealthRecord("disease", "Mastitis", TODAY - timedelta(days=80), None, None),
            HealthRecord("disease", "Mastitis", TODAY - timedelta(days=10), None, None),
        ]
    )
    finding = rules.disease_recurring(a, herd(a), TH)
    assert finding is not None
    assert finding.data["disease"] == "mastitis"


def test_birth_due_yaklasan_dogum():
    a = sheep(is_pregnant=True, expected_birth_at=TODAY + timedelta(days=5))
    finding = rules.birth_due(a, herd(a), TH)
    assert finding.type == "birth_due"
    assert finding.data["days_left"] == 5


def test_birth_due_gecmis_tarih_uyarir():
    a = sheep(is_pregnant=True, expected_birth_at=TODAY - timedelta(days=15))
    finding = rules.birth_due(a, herd(a), TH)
    assert finding.type == "birth_overdue"


def test_pregnancy_check_due():
    a = sheep(breedings=[Breeding(TODAY - timedelta(days=50), "pending", None)])
    finding = rules.pregnancy_check_due(a, herd(a), TH)
    assert finding is not None
    assert finding.data["days"] == 50


def test_multi_observation_iki_kategori():
    obs = [
        Observation(TODAY, "movement", "moderate", ("Topallama",)),
        Observation(TODAY - timedelta(days=1), "feeding", "mild", ("Az yedi",)),
    ]
    a = sheep(observations=obs)
    finding = rules.multi_observation(a, herd(a), TH)
    assert finding is not None
    assert set(finding.data["categories"]) == {"movement", "feeding"}


def test_observation_worsening_artan_siddet():
    obs = [
        Observation(TODAY - timedelta(days=4), "respiratory", "mild"),
        Observation(TODAY - timedelta(days=2), "respiratory", "moderate"),
        Observation(TODAY, "respiratory", "severe"),
    ]
    a = sheep(observations=obs)
    finding = rules.observation_worsening(a, herd(a), TH)
    assert finding is not None
    assert finding.data["category"] == "respiratory"
