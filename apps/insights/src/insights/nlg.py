"""Türkçe metin üretimi.

Cümleler şablondan gelir, sayılar `Finding.data` içinde ayrıca durur; arayüz aynı
sayılarla grafik çizebilsin diye (bölüm 3.5).
"""

from __future__ import annotations


def number(value: float, digits: int = 1) -> str:
    """1234.5 -> "1.234,5"; tam sayıysa ondalık yazılmaz."""
    rounded = round(value, digits)
    if rounded == int(rounded):
        text = f"{int(rounded):,}".replace(",", ".")
        return text
    whole, frac = f"{abs(rounded):.{digits}f}".split(".")
    whole_text = f"{int(whole):,}".replace(",", ".")
    sign = "-" if rounded < 0 else ""
    return f"{sign}{whole_text},{frac}"


def kg(value: float) -> str:
    return f"{number(value)} kg"


def money(value: float) -> str:
    return f"{number(value)} TL"


def percent(value: float) -> str:
    return f"%{number(abs(value), 0 if abs(value) >= 10 else 1)}"


def days(value: int) -> str:
    return f"{value} gün"


def plural_animals(count: int) -> str:
    return f"{count} hayvan"


def date_tr(value) -> str:
    return value.strftime("%d.%m.%Y")
