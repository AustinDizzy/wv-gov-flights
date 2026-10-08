import { useState, type CSSProperties } from "react";
import TimeSeriesChart, {
  chartMetricLabels,
  type ChartMetric,
  type TimeSeriesItem,
} from "@/components/TimeSeriesChart";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface MetricBreakdownItem {
  label: string;
  href?: string;
  meta?: string;
  trips: number;
  hours: number;
  distance: number;
}

export interface MetricBreakdown {
  category: string;
  items: MetricBreakdownItem[];
  style?: "bar" | "percentage";
  wide?: boolean;
}

interface Props {
  series: TimeSeriesItem[];
  breakdowns: MetricBreakdown[];
  initialMetric?: ChartMetric;
  seriesWide?: boolean;
}

const formatMetricValue = (metric: ChartMetric, value: number) => {
  if (metric === "trips") return `${Math.round(value).toLocaleString()} trips`;
  if (metric === "hours") {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} hr`;
  }
  return `${Math.round(value).toLocaleString()} nmi`;
};

const formatItemDetail = (metric: ChartMetric, item: MetricBreakdownItem) => {
  const supportingValues = metric === "trips"
    ? `${formatMetricValue("hours", item.hours)} · ${formatMetricValue("distance", item.distance)}`
    : metric === "hours"
      ? `${formatMetricValue("trips", item.trips)} · ${formatMetricValue("distance", item.distance)}`
      : `${formatMetricValue("trips", item.trips)} · ${formatMetricValue("hours", item.hours)}`;
  return item.meta ? `${supportingValues} · ${item.meta}` : supportingValues;
};

const segmentColors = [
  "#b98014",
  "#2d71bf",
  "#5b8f73",
  "#80659b",
  "#bc6c55",
  "#4f8793",
  "#817748",
];

function BarBreakdown({
  items,
  metric,
}: {
  items: MetricBreakdownItem[];
  metric: ChartMetric;
}) {
  const sortedItems = [...items].sort((left, right) =>
    right[metric] - left[metric] || left.label.localeCompare(right.label, "en-US")
  );
  const maximum = Math.max(0, ...sortedItems.map((item) => item[metric]));

  if (sortedItems.length === 0) {
    return <p className="p-5 text-center text-muted-foreground">No data is available for this view.</p>;
  }

  return (
    <div className="grid gap-[.7rem]">
      {sortedItems.map((item) => {
        const displayValue = formatMetricValue(metric, item[metric]);
        const width = maximum > 0 ? Math.max(2, (item[metric] / maximum) * 100) : 0;
        return (
          <div className="min-w-0" key={item.label}>
            <div className="mb-[.35rem] flex items-baseline justify-between gap-4 text-[.76rem]">
              <span className="min-w-0 truncate">{item.href ? <a className="font-extrabold no-underline" href={item.href}>{item.label}</a> : item.label}</span>
              <strong className="shrink-0 text-[.72rem]">{displayValue}</strong>
            </div>
            <div className="block h-[.55rem] overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${item.label}: ${displayValue}`}>
              <span className="block h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--gold-500),var(--gold-300))]" style={{ width: `${width}%` }} />
            </div>
            <small className="mt-[.3rem] block text-[.63rem] text-muted-foreground">{formatItemDetail(metric, item)}</small>
          </div>
        );
      })}
    </div>
  );
}

function PercentageBreakdown({
  items,
  metric,
}: {
  items: MetricBreakdownItem[];
  metric: ChartMetric;
}) {
  const positiveItems = [...items]
    .filter((item) => item[metric] > 0)
    .sort((left, right) =>
      right[metric] - left[metric] || left.label.localeCompare(right.label, "en-US")
    );
  const total = positiveItems.reduce((sum, item) => sum + item[metric], 0);

  if (total <= 0) {
    return <p className="p-5 text-center text-muted-foreground">No data is available for this view.</p>;
  }

  return (
    <div className="min-w-0">
      <div
        className="flex h-[1.05rem] overflow-hidden rounded-sm bg-secondary"
        role="img"
        aria-label={`${chartMetricLabels[metric]} distribution across ${positiveItems.length} categories`}
      >
        {positiveItems.map((item, index) => (
          <span
            className="min-w-0.5 bg-[var(--segment-color)]"
            key={item.label}
            style={{
              "--segment-color": segmentColors[index % segmentColors.length],
              width: `${(item[metric] / total) * 100}%`,
            } as CSSProperties}
            title={`${item.label}: ${formatMetricValue(metric, item[metric])}`}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-[.15rem]">
        {positiveItems.map((item, index) => (
          <div
            className="grid grid-cols-[.55rem_minmax(0,1fr)_auto_3.2rem] items-baseline gap-[.45rem] border-b border-border py-[.35rem] text-[.7rem] last:border-b-0"
            key={item.label}
            style={{ "--segment-color": segmentColors[index % segmentColors.length] } as CSSProperties}
          >
            <i className="size-2 self-center rounded-[.12rem] bg-[var(--segment-color)]" aria-hidden="true" />
            <span className="min-w-0">
              {item.href ? <a className="font-extrabold no-underline" href={item.href}>{item.label}</a> : <strong className="font-extrabold">{item.label}</strong>}
              <small className="block truncate text-[.58rem] text-muted-foreground">{formatItemDetail(metric, item)}</small>
            </span>
            <b className="whitespace-nowrap">{formatMetricValue(metric, item[metric])}</b>
            <em className="text-right whitespace-nowrap not-italic text-muted-foreground">{((item[metric] / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</em>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MetricChartGroup({
  series,
  breakdowns,
  initialMetric = "trips",
  seriesWide = true,
}: Props) {
  const [metric, setMetric] = useState<ChartMetric>(initialMetric);
  const metrics = Object.keys(chartMetricLabels) as ChartMetric[];

  return (
    <div className="min-w-0">
      <div className="mb-[.55rem] flex items-center justify-end gap-[.45rem] max-[560px]:flex-col max-[560px]:items-stretch">
        <span className="text-[.68rem] font-extrabold text-muted-foreground">Show</span>
        <ButtonGroup className="grid grid-cols-[repeat(3,max-content)] overflow-hidden rounded-[.42rem] border border-border bg-paper p-0.5 shadow-card max-[560px]:w-full max-[560px]:grid-cols-3" aria-label="Show chart metric">
          {metrics.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant="ghost"
              className="h-[1.85rem] min-w-[4.25rem] rounded-[.28rem]! border-0 bg-transparent px-[.65rem] py-1 text-[.7rem] font-[750] text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground aria-pressed:bg-navy-800 aria-pressed:text-white aria-pressed:shadow-sm dark:aria-pressed:bg-gold-300 dark:aria-pressed:text-navy-950 max-[560px]:min-w-0 max-[560px]:whitespace-normal max-[560px]:px-[.35rem]"
              aria-pressed={option === metric}
              onClick={() => setMetric(option)}
            >
              {chartMetricLabels[option]}
            </Button>
          ))}
        </ButtonGroup>
      </div>

      <div className="grid grid-cols-2 items-start gap-[.85rem] max-[900px]:grid-cols-1">
        <Card className={`min-w-0 rounded-[.4rem] border-border bg-surface py-4 [--card-spacing:1rem] [&_[data-slot=card-content]]:min-w-0 [&_[data-slot=card-content]]:max-w-full${seriesWide ? " col-span-full max-[900px]:col-auto" : ""}`}>
          <CardHeader><CardTitle>{chartMetricLabels[metric]} over time</CardTitle></CardHeader>
          <CardContent>
            <div className="min-w-0 max-w-full [&_[data-slot=chart]]:min-w-0 [&_[data-slot=chart]]:max-w-full">
              <TimeSeriesChart items={series} metric={metric} />
            </div>
          </CardContent>
        </Card>

        {breakdowns.map((breakdown) => (
          <Card
            className={`min-w-0 rounded-[.4rem] border-border bg-surface py-4 [--card-spacing:1rem] [&_[data-slot=card-content]]:min-w-0 [&_[data-slot=card-content]]:max-w-full${breakdown.wide ? " col-span-full max-[900px]:col-auto" : ""}`}
            key={breakdown.category}
          >
            <CardHeader>
              <CardTitle>{chartMetricLabels[metric]} by {breakdown.category}</CardTitle>
            </CardHeader>
            <CardContent>
              {breakdown.style === "percentage"
                ? <PercentageBreakdown items={breakdown.items} metric={metric} />
                : <BarBreakdown items={breakdown.items} metric={metric} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
