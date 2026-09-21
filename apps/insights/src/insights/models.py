"""Kural motorunun veri şekilleri.

Kurallar saf fonksiyondur: veritabanı bilmez, sadece bu yapıları alır ve bulgu döner.
Böylece her kuralın testi tek dosyada, veritabanı olmadan yazılabilir (bölüm 3.5).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal

Severity = Literal["info", "warning", "critical"]


@dataclass(frozen=True)
class Weighing:
    at: date
    kg: float


@dataclass(frozen=True)
class HealthRecord:
    type: str
    product: str | None
    applied_at: date
    next_due_at: date | None
    withdrawal_until: date | None


@dataclass(frozen=True)
class Observation:
    at: date
    category: str
    severity: str
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class Breeding:
    mated_at: date
    result: str
    checked_at: date | None


@dataclass
class Animal:
    id: str
    tag_no: str
    name: str | None
    species: str
    sex: str
    status: str
    birth_date: date | None = None
    current_weight: float | None = None
    is_pregnant: bool = False
    expected_birth_at: date | None = None
    weights: list[Weighing] = field(default_factory=list)
    health: list[HealthRecord] = field(default_factory=list)
    observations: list[Observation] = field(default_factory=list)
    breedings: list[Breeding] = field(default_factory=list)
    lambings: list[date] = field(default_factory=list)

    @property
    def label(self) -> str:
        return f"{self.tag_no} · {self.name}" if self.name else self.tag_no

    def age_days(self, today: date) -> int | None:
        return (today - self.birth_date).days if self.birth_date else None


@dataclass
class Herd:
    """Akran karşılaştırması için sürü bağlamı.

    Küçük sürüde akran kuralları anlamsız; `peers` en az `min_peers` kadar hayvan
    içermiyorsa ilgili kurallar atlanır (bölüm 3.5, küçük sürü kuralı).
    """

    today: date
    animals: list[Animal] = field(default_factory=list)

    def peers(self, animal: Animal) -> list[Animal]:
        """Aynı tür, cinsiyet ve yaş grubundaki diğer aktif hayvanlar."""
        group = age_group(animal.age_days(self.today))
        return [
            a
            for a in self.animals
            if a.id != animal.id
            and a.status == "active"
            and a.species == animal.species
            and a.sex == animal.sex
            and age_group(a.age_days(self.today)) == group
        ]


def age_group(age_days: int | None) -> str:
    if age_days is None:
        return "bilinmiyor"
    if age_days < 180:
        return "kuzu"
    if age_days < 365:
        return "toklu"
    if age_days < 730:
        return "genc"
    return "yetiskin"


@dataclass
class Finding:
    """Bir kuralın çıktısı. `type` kural adıdır ve (çiftlik, hayvan, tip) tekildir."""

    type: str
    severity: Severity
    title: str
    message: str
    data: dict[str, Any] = field(default_factory=dict)
    animal_id: str | None = None
    valid_days: int = 14

    def valid_until(self, now: datetime) -> datetime:
        from datetime import timedelta

        return now + timedelta(days=self.valid_days)
