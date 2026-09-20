import { VChart } from "@visactor/react-vchart";
import type { ISpec } from "@visactor/vchart";
import { useMemo } from "react";

import { useTheme } from "@/lib/theme";

export interface WeightPoint {
  date: string;
  kg: number;
}

/** Kilo eğrisi; VisActor çizgi grafiği, tema ile uyumlu. */
export function WeightChart({ points }: { points: WeightPoint[] }) {
  const { theme } = useTheme();
  const spec = useMemo<ISpec>(
    () => ({
      type: "line" as const,
      data: [{ id: "weights", values: [...points].sort((a, b) => a.date.localeCompare(b.date)) }],
      xField: "date",
      yField: "kg",
      point: { style: { size: 8 } },
      line: { style: { lineWidth: 2.5, curveType: "monotone" } },
      axes: [
        { orient: "left", label: { formatMethod: (v: unknown) => `${v} kg` } },
        { orient: "bottom", label: { formatMethod: (v: unknown) => String(v).slice(5).split("-").reverse().join(".") } },
      ],
      tooltip: { mark: { title: { visible: false }, content: [{ key: "Tarih", value: (d: { date: string }) => d.date.split("-").reverse().join(".") }, { key: "Kilo", value: (d: { kg: number }) => `${d.kg} kg` }] } },
      padding: { top: 12, right: 16, bottom: 8, left: 8 },
      background: "transparent",
      theme: theme === "dark" ? "dark" : "light",
    }) as unknown as ISpec,
    [points, theme],
  );
  if (points.length < 2) {
    return <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">Grafik için en az iki tartım gerekli</p>;
  }
  return (
    <div className="h-56 w-full" data-testid="weight-chart">
      <VChart spec={spec} />
    </div>
  );
}
