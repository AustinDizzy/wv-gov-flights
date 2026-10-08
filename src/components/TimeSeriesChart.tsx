import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type ChartMetric = "trips" | "hours" | "distance";

export interface TimeSeriesItem {
  label: string;
  trips?: number;
  hours?: number;
  distance?: number;
}

export const chartMetricLabels: Record<ChartMetric, string> = {
  trips: "Trips",
  hours: "Hours",
  distance: "Observed distance",
};

const chartConfig = {
  trips: { label: "Trips", color: "var(--chart-1)" },
  hours: { label: "Hours", color: "var(--chart-2)" },
  distance: { label: "Observed distance", color: "var(--chart-3)" },
} satisfies ChartConfig;

const formatValue = (metric: ChartMetric, value: number) => {
  if (metric === "trips") return `${Math.round(value).toLocaleString()} trips`;
  if (metric === "hours") {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} hr`;
  }
  return `${Math.round(value).toLocaleString()} nmi`;
};

const formatBarLabel = (metric: ChartMetric, value: number) => {
  if (metric === "hours") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  if (Math.abs(value) >= 10_000) {
    return value.toLocaleString(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
  }
  return Math.round(value).toLocaleString();
};

export default function TimeSeriesChart({
  items,
  metric = "trips",
}: {
  items: TimeSeriesItem[];
  metric?: ChartMetric;
}) {
  const maximum = useMemo(
    () => Math.max(0, ...items.map((item) => Number(item[metric] ?? 0))),
    [items, metric],
  );

  if (items.length === 0) {
    return <p className="p-5 text-center text-muted-foreground">No data is available for this view.</p>;
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="h-[16rem] w-full min-w-0 max-w-full overflow-hidden aspect-auto"
      aria-label={`${chartMetricLabels[metric]} by period`}
    >
      <BarChart accessibilityLayer data={items} margin={{ left: 4, right: 4, top: 28, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={8}
          tickMargin={8}
          tick={{ fontSize: 10 }}
        />
        <YAxis hide domain={[0, maximum || 1]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value) => (
                <span className="font-mono font-medium tabular-nums">
                  {formatValue(metric, Number(value))}
                </span>
              )}
            />
          }
        />
        <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[4, 4, 0, 0]}>
          <LabelList
            dataKey={metric}
            position="top"
            offset={6}
            className="fill-foreground"
            fontSize={10}
            fontWeight={700}
            formatter={(value) => formatBarLabel(metric, Number(value))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
