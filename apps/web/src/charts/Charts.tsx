import { VChart } from "@visactor/react-vchart";
import type { ISpec } from "@visactor/vchart";
import { useMemo } from "react";

import { useTheme } from "@/lib/theme";

/** Tema ile uyumlu ortak grafik kabuğu; boş veride yazı gösterir. */
function ChartFrame({ empty, height = 240, testID, children }: { empty: boolean; height?: number; testID?: string; children: React.ReactNode }) {
  if (empty) return <p className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>Gösterilecek veri yok</p>;
  return (
    <div className="w-full" style={{ height }} data-testid={testID}>
      {children}
    </div>
  );
}

const base = (theme: string) => ({ background: "transparent", theme: theme === "dark" ? "dark" : "light", padding: { top: 12, right: 16, bottom: 8, left: 8 } });

export interface NamedValue {
  name: string;
  value: number;
}

/** Kategorik çubuk: ırk dağılımı, aylık doğum gibi. */
export function BarChart({ data, unit, testID, height }: { data: NamedValue[]; unit?: string; testID?: string; height?: number }) {
  const { theme } = useTheme();
  const spec = useMemo<ISpec>(
    () =>
      ({
        type: "bar",
        data: [{ id: "d", values: data }],
        xField: "name",
        yField: "value",
        bar: { style: { cornerRadius: [4, 4, 0, 0] } },
        label: { visible: true, formatMethod: (v: unknown) => (unit ? `${v} ${unit}` : String(v)) },
        axes: [{ orient: "left", visible: false }, { orient: "bottom" }],
        tooltip: { mark: { content: [{ key: (d: NamedValue) => d.name, value: (d: NamedValue) => (unit ? `${d.value} ${unit}` : String(d.value)) }] } },
        ...base(theme),
      }) as unknown as ISpec,
    [data, unit, theme],
  );
  return (
    <ChartFrame empty={data.every((d) => d.value === 0)} testID={testID} height={height}>
      <VChart spec={spec} />
    </ChartFrame>
  );
}

/** Pay grafiği: yaş grubu, gider kategorisi. */
export function DonutChart({ data, testID, height }: { data: NamedValue[]; testID?: string; height?: number }) {
  const { theme } = useTheme();
  const spec = useMemo<ISpec>(
    () =>
      ({
        type: "pie",
        data: [{ id: "d", values: data }],
        categoryField: "name",
        valueField: "value",
        outerRadius: 0.9,
        innerRadius: 0.62,
        legends: [{ visible: true, orient: "bottom" }],
        label: { visible: false },
        tooltip: { mark: { content: [{ key: (d: NamedValue) => d.name, value: (d: NamedValue) => String(d.value) }] } },
        ...base(theme),
      }) as unknown as ISpec,
    [data, theme],
  );
  return (
    <ChartFrame empty={data.length === 0} testID={testID} height={height}>
      <VChart spec={spec} />
    </ChartFrame>
  );
}

export interface SeriesPoint {
  label: string;
  series: string;
  value: number;
}

/** Çok serili aylık trend: gider/gelir, kalem bazında tüketim. */
export function TrendChart({ data, kind = "line", unit, testID, height }: { data: SeriesPoint[]; kind?: "line" | "bar"; unit?: string; testID?: string; height?: number }) {
  const { theme } = useTheme();
  const spec = useMemo<ISpec>(
    () =>
      ({
        type: kind,
        data: [{ id: "d", values: data }],
        xField: kind === "bar" ? ["label", "series"] : "label",
        yField: "value",
        seriesField: "series",
        ...(kind === "line" ? { line: { style: { lineWidth: 2.5, curveType: "monotone" } }, point: { style: { size: 6 } } } : { bar: { style: { cornerRadius: [3, 3, 0, 0] } } }),
        legends: [{ visible: true, orient: "top", position: "start" }],
        axes: [{ orient: "left", label: { formatMethod: (v: unknown) => (unit ? `${v} ${unit}` : String(v)) } }, { orient: "bottom" }],
        tooltip: { dimension: { visible: true } },
        ...base(theme),
      }) as unknown as ISpec,
    [data, kind, unit, theme],
  );
  return (
    <ChartFrame empty={data.every((d) => d.value === 0)} testID={testID} height={height}>
      <VChart spec={spec} />
    </ChartFrame>
  );
}
