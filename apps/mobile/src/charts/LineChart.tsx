import { extent } from "d3-array";
import { scaleLinear, scaleTime } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

export interface ChartPoint {
  /** Zaman, ms. */
  x: number;
  y: number;
}

interface Props {
  points: ChartPoint[];
  height?: number;
  unit?: string;
  formatX?: (ms: number) => string;
  emptyText?: string;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 40 };

/** Zamana karşı tek seri çizgi grafik; kilo, tüketim ve stok trendi için. */
export function LineChart({ points, height = 180, unit = "", formatX, emptyText = "Grafik için en az iki değer gerekli" }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const sorted = [...points].sort((a, b) => a.x - b.x);

  if (sorted.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text variant="bodySmall" style={styles.muted}>
          {emptyText}
        </Text>
      </View>
    );
  }

  const [minX, maxX] = extent(sorted, (p) => p.x) as [number, number];
  const [minY, maxY] = extent(sorted, (p) => p.y) as [number, number];
  const padY = Math.max((maxY - minY) * 0.15, 1);
  const x = scaleTime().domain([minX, maxX]).range([PAD.left, Math.max(width - PAD.right, PAD.left + 1)]);
  const y = scaleLinear().domain([minY - padY, maxY + padY]).range([height - PAD.bottom, PAD.top]);
  const path = line<ChartPoint>().x((p) => x(p.x)).y((p) => y(p.y)).curve(curveMonotoneX)(sorted) ?? "";
  const fmtX = formatX ?? ((ms: number) => new Date(ms).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }));
  const fmtY = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}${unit}`;
  const gridColor = theme.colors.outlineVariant;
  const textColor = theme.colors.onSurfaceVariant;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {[minY, maxY].map((v) => (
            <Line key={v} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={gridColor} strokeDasharray="4 4" />
          ))}
          <SvgText x={PAD.left - 6} y={y(maxY) + 4} fontSize={11} fill={textColor} textAnchor="end">
            {fmtY(maxY)}
          </SvgText>
          <SvgText x={PAD.left - 6} y={y(minY) + 4} fontSize={11} fill={textColor} textAnchor="end">
            {fmtY(minY)}
          </SvgText>
          <SvgText x={PAD.left} y={height - 6} fontSize={11} fill={textColor}>
            {fmtX(minX)}
          </SvgText>
          <SvgText x={width - PAD.right} y={height - 6} fontSize={11} fill={textColor} textAnchor="end">
            {fmtX(maxX)}
          </SvgText>
          <Path d={path} stroke={theme.colors.primary} strokeWidth={2.5} fill="none" />
          {sorted.map((p, i) => (
            <Circle key={i} cx={x(p.x)} cy={y(p.y)} r={4} fill={theme.colors.primary} stroke={theme.colors.surface} strokeWidth={1.5} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  muted: { opacity: 0.6 },
});
