import AircraftBadge from "@/components/AircraftBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAircraftProfile } from "../lib/aircraft-profile";
import { formatCurrency, formatDate } from "../lib/utils";

interface TripResult {
  id: string;
  report_date: string;
  tail_no: string | null;
  raw_route: string;
  department: string;
  division: string | null;
  printed_passengers: string | null;
  flight_hours: number;
  effective_cost_cents: number | null;
  observed_flight_count?: number;
}

const resultCellClass =
  "min-w-0 whitespace-normal px-[.65rem] py-[.54rem] max-[720px]:grid max-[720px]:grid-cols-[5rem_minmax(0,1fr)] max-[720px]:items-baseline max-[720px]:gap-[.55rem] max-[720px]:border-0 max-[720px]:px-[.7rem] max-[720px]:py-[.4rem] max-[720px]:before:text-[.55rem] max-[720px]:before:font-extrabold max-[720px]:before:tracking-[.07em] max-[720px]:before:text-muted-foreground max-[720px]:before:uppercase max-[720px]:before:content-[attr(data-label)]";

const mobileHeadingCellClass =
  "max-[720px]:grid-cols-[auto] max-[720px]:border-b! max-[720px]:border-border max-[720px]:bg-[color-mix(in_srgb,var(--sky-100)_45%,var(--surface))] max-[720px]:pt-[.65rem] max-[720px]:pb-[.55rem] max-[720px]:before:hidden";

const mobileMetricCellClass =
  "max-[720px]:grid-cols-[auto_auto] max-[720px]:justify-start max-[720px]:border-t max-[720px]:border-border max-[720px]:pt-[.55rem] max-[720px]:pb-[.65rem]";

export default function TripResultsTable({
  trips,
  tripBasePath,
  aircraftBasePath,
  emptyMessage = "No trips match these filters.",
}: {
  trips: TripResult[];
  tripBasePath: string;
  aircraftBasePath: string;
  emptyMessage?: string;
}) {
  const tripHref = (trip: TripResult) =>
    trip.tail_no
      ? `${tripBasePath}/${encodeURIComponent(trip.tail_no.toLocaleUpperCase("en-US"))}/${trip.report_date}`
      : `${tripBasePath}/${encodeURIComponent(trip.id)}`;

  return (
    <div className="overflow-x-hidden rounded-lg border border-border bg-surface shadow-card [&_[data-slot=table-container]]:overflow-x-hidden max-[720px]:overflow-visible max-[720px]:rounded-none max-[720px]:border-0 max-[720px]:bg-transparent max-[720px]:shadow-none max-[720px]:[&_[data-slot=table-container]]:overflow-visible">
      <Table className="table-fixed min-w-0 text-[.78rem] [&_.badge]:px-[.4rem] [&_.badge]:py-[.12rem] [&_.badge]:text-[.65rem] [&_small]:text-[.64rem] [&_small]:leading-[1.25] [&_th]:px-[.65rem] [&_th]:py-[.54rem] [&_th]:text-[.58rem] [&_th]:tracking-[.07em] max-[720px]:block">
        <TableHeader className="max-[720px]:absolute max-[720px]:size-px max-[720px]:overflow-hidden max-[720px]:[clip-path:inset(50%)]">
          <TableRow>
            <TableHead className="w-[7.2rem]">Date</TableHead>
            <TableHead className="w-[6.2rem]">Aircraft</TableHead>
            <TableHead className="w-[20%]">Route</TableHead>
            <TableHead className="w-[18%]">Agency</TableHead>
            <TableHead className="w-1/4">Passengers</TableHead>
            <TableHead className="w-[4.4rem]">Hours</TableHead>
            <TableHead className="w-[6.4rem]">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="max-[720px]:grid max-[720px]:gap-[.65rem]">
          {trips.map((trip) => (
            <TableRow
              key={trip.id}
              className="cursor-pointer focus-visible:relative focus-visible:z-1 focus-visible:outline-[3px] focus-visible:outline-gold-500 focus-visible:outline-offset-[-3px] max-[720px]:grid max-[720px]:grid-cols-[minmax(0,1fr)_auto] max-[720px]:overflow-hidden max-[720px]:rounded-[.45rem] max-[720px]:border! max-[720px]:border-border max-[720px]:bg-surface max-[720px]:shadow-card max-[720px]:hover:bg-surface"
              data-row-href={tripHref(trip)}
              tabIndex={0}
              aria-label={`View trip on ${formatDate(trip.report_date)}`}
            >
              <TableCell className={`${resultCellClass} ${mobileHeadingCellClass} whitespace-nowrap`} data-label="Date">
                <a href={tripHref(trip)}>{formatDate(trip.report_date)}</a>
              </TableCell>
              <TableCell className={`${resultCellClass} ${mobileHeadingCellClass} max-[720px]:justify-items-end`} data-label="Aircraft">
                {trip.tail_no ? (
                  <AircraftBadge
                    tailNo={trip.tail_no}
                    type={getAircraftProfile(trip.tail_no).type}
                    href={`${aircraftBasePath}/${encodeURIComponent(trip.tail_no)}`}
                    size="compact"
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className={`${resultCellClass} max-[720px]:col-span-full max-[720px]:pt-[.65rem]`} data-label="Route">
                <a
                  className="block min-w-0 whitespace-normal font-[750] tracking-[.01em] [overflow-wrap:anywhere]"
                  href={tripHref(trip)}
                >
                  {trip.raw_route}
                </a>
              </TableCell>
              <TableCell className={`${resultCellClass} max-[720px]:col-span-full`} data-label="Agency">
                <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                  {trip.department}
                  {trip.division && (
                    <small className="mt-[.1rem] block text-[.72rem] leading-[1.25] text-muted-foreground max-[720px]:ml-[.3rem] max-[720px]:inline max-[720px]:text-inherit max-[720px]:before:mr-[.3rem] max-[720px]:before:content-['·']">
                      {trip.division}
                    </small>
                  )}
                </span>
              </TableCell>
              <TableCell className={`${resultCellClass} max-[720px]:col-span-full`} data-label="Passengers">
                <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                  {trip.printed_passengers ?? "—"}
                </span>
              </TableCell>
              <TableCell className={`${resultCellClass} ${mobileMetricCellClass} whitespace-nowrap`} data-label="Hours">
                {trip.flight_hours.toFixed(1)}
              </TableCell>
              <TableCell className={`${resultCellClass} ${mobileMetricCellClass} whitespace-nowrap max-[720px]:justify-end`} data-label="Cost">
                {formatCurrency(trip.effective_cost_cents)}
              </TableCell>
            </TableRow>
          ))}
          {trips.length === 0 && (
            <TableRow className="max-[720px]:grid">
              <TableCell colSpan={7} className="px-6 py-12 text-center text-muted-foreground max-[720px]:col-span-full max-[720px]:block max-[720px]:px-4 max-[720px]:py-8">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
