const fixedNumberFormatters = new Map<number, Intl.NumberFormat>();
const compactDecimalNumberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatFixedNumber(value: number, fractionDigits: number): string {
  let formatter = fixedNumberFormatters.get(fractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    fixedNumberFormatters.set(fractionDigits, formatter);
  }
  return formatter.format(value);
}

export function formatDecimalFlightHours(
  value: number,
  options: { includeUnit?: boolean; compact?: boolean } = {},
): string {
  const formatted = options.compact
    ? compactDecimalNumberFormatter.format(value)
    : formatFixedNumber(value, 2);
  return options.includeUnit === false ? formatted : `${formatted} flight hours`;
}

export function formatFlightHoursDuration(
  value: number,
  options: { compact?: boolean } = {},
): string {
  const totalMinutes = Math.round(value * 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (options.compact) {
    const parts = [
      days > 0 ? `${days}d` : "",
      hours > 0 ? `${hours}h` : "",
      minutes > 0 ? `${minutes}m` : "",
    ].filter(Boolean);
    return parts.join(" ") || "0m";
  }
  return `${days}d ${hours}h ${minutes}m flight time`;
}

export function formatNauticalMiles(
  value: number,
  options: { compact?: boolean } = {},
): string {
  return `${formatFixedNumber(value, 2)} ${options.compact ? "nmi" : "nautical miles"}`;
}

export function formatKilometersFromNauticalMiles(
  value: number,
  options: { compact?: boolean } = {},
): string {
  return `${formatFixedNumber(value * 1.852, 1)} ${options.compact ? "km" : "kilometers"}`;
}
