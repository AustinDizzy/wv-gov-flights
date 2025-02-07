import {
    getTrips,
    getAircraft,
    getDataSources,
} from "@/lib/db";
import Map from '@/components/Map';
import { Card } from '@/components/ui/card';
import { AircraftTooltip } from "@/components/aircraft-tooltip";
import { notFound } from "next/navigation";
import { format, parse } from "date-fns";
import Link from "next/link";
import { parseNameSlug } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ExternalLink, InfoIcon } from "lucide-react";

export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
    return (await getTrips({})).map(({ tail_no, date }) => ({ params: { tail_no, date } }));
}

function isRoundTrip(route: string): boolean {
    return route.split("-").every((p, i, a) => p === a[a.length - 1 - i])
}

function formatRouteStr(route: string): string {
    if (!isRoundTrip(route)) {
        return route.replaceAll("-", " → ");
    } else {
        return route.split("-").reduce((acc, p, i, a) => {
            if (i < a.length / 2) {
                return acc + p + " ⇄ ";
            } else {
                return acc;
            }
        }, "").slice(0, -3);
    }
}

export default async function AircraftTripDatePage({
    params,
}: {
    params: Promise<{ tail_no: string; trip_date: string }>;
}) {
    const searchParams = (await params) as Record<string, string>;
    const [trips, aircraft] = await Promise.all([
        getTrips({
            aircraft: searchParams.tail_no,
            startDate: searchParams.trip_date,
            endDate: searchParams.trip_date,
        }),
        getAircraft(searchParams.tail_no).then(a => a?.pop()),
    ]);

    // throw 404 if no trips or aircraft
    if (!trips.length || !aircraft) {
        return notFound();
    }

    const sources = await getDataSources(trips);

    const flightPath = trips[0]?.flight_path;
    const flightHours = trips.map((trip) => trip.flight_hours).reduce((a, b) => a + b, 0);

    return (
        <div className="container mx-auto space-y-6 p-6">
            <div className="space-y-6">
                <h1 className="text-3xl font-bold tracking-tight flex flex-col md:flex-row items-center gap-2">
                    <AircraftTooltip aircraft={aircraft} variant="title" />{" "}
                    <span className="font-semibold text-2xl hidden md:inline-block">on</span>{" "}
                    {format(parse(searchParams.trip_date, "yyyy-MM-dd", new Date()), "MMMM dd, yyyy")}
                </h1>

                {flightPath && (
                    <div>
                        <Card className="p-4">
                            <Map
                                flightPath={flightPath}
                                flightDate={searchParams.trip_date}
                                flightHours={flightHours}
                                flightCraft={aircraft}
                            />
                        </Card>
                    </div>
                )}

                {trips.map((trip, i) => (
                    <Card key={trip.id} className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                        <h1 className="text-2xl md:text-justify text-center font-semibold col-span-full">
                            {trips.length > 1 && <span className="text-sm text-muted-foreground font-mono font-light">#{i}.</span>}
                            <div className="inline-flex flex-col md:flex-row items-center gap-2">
                                {formatRouteStr(trip.route)}{" "}{isRoundTrip(trip.route) && <span className="text-muted-foreground text-base whitespace-nowrap">(round trip)</span>}
                            </div>
                        </h1>
                        <Card className="p-6">
                            <dl className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={cn(!trip.division && "col-span-2")}>
                                        <dt className="text-sm text-muted-foreground">Department</dt>
                                        <dd className="text-lg font-medium">{trip.department}</dd>
                                    </div>
                                    {trip.division && <div>
                                        <dt className="text-sm text-muted-foreground">Division</dt>
                                        <dd className="text-lg font-medium">{trip.division}</dd>
                                    </div>}
                                </div>
                                {trip.passengers && <div>
                                    <dt className="text-sm text-muted-foreground">Passengers</dt>
                                    <dd className="text-lg" key={trip.passengers}>
                                        {trip.passengers?.split(",").map((p, i, a) => {
                                            return <>
                                                <Link key={parseNameSlug(p)} href={`/passengers/${parseNameSlug(p)}`} className="text-chart-1 hover:text-secondary transition-colors ease-in duration-100 hover:underline font-medium whitespace-nowrap">
                                                    {p.trim()}
                                                </Link>
                                                {i < a.length - 1 ? ", " : ""}
                                            </>
                                        })}
                                    </dd>
                                </div>}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <dt className="text-sm text-muted-foreground">Flight Hours</dt>
                                        <dd className="text-lg font-medium">{trip.flight_hours}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm text-muted-foreground">Invoiced Amount</dt>
                                        <dd className="text-lg font-medium">${(trip.flight_hours * trip.aircraft.rate).toLocaleString()}</dd>
                                    </div>
                                </div>
                            </dl>
                        </Card>

                        <div className="space-y-6">
                            <Card className="relative pt-4">
                                <span className="absolute -top-3 left-4 px-2 text-sm font-semibold bg-card">
                                    Comments
                                </span>
                                <div className="p-4 pt-0">
                                    {trip.comments || (
                                        <div className="text-muted-foreground italic">
                                            No comments found for this trip.
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {trip.justification_lwb && <Card className="relative pt-4">
                                <span className="absolute -top-3 left-4 px-2 text-sm font-semibold bg-card">
                                    Justification for flying to Lewisburg
                                </span>
                                <div className="p-4 pt-0">
                                    {trip.justification_lwb}
                                </div>
                            </Card>}
                        </div>
                        <div className="col-span-full">
                            {sources?.some(ds => ds.trips?.find(t => t.id === trip.id)) && (
                                <div className="text-sm text-muted-foreground mt-2 flex justify-start md:justify-end">
                                    <div className="flex flex-col md:flex-row items-start md:items-center gap-1">
                                        <span className="flex items-center gap-1">
                                            <InfoIcon size={12} />
                                            <span>sources:</span>
                                        </span>
                                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                                            {sources
                                                .filter(ds => ds.trips?.find(t => t.id === trip.id))
                                                .map((ds) => (
                                                    <a
                                                        key={ds.id}
                                                        href={`/${ds.path}`}
                                                        className="text-primary hover:underline inline-flex items-center"
                                                        rel="nofollow noopener"
                                                    >
                                                        {ds.name}
                                                    </a>
                                                ))
                                            }
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                ))}

                {!flightPath && (
                    <Card className="p-4">
                        <div className="text-sm text-muted-foreground flex items-baseline gap-1">
                            <InfoIcon size={12} />
                            No recorded flight paths were found on this date.{" "}
                            Try checking again later for updates or visit one of the following third-party websites{" "}
                            <span className="inline-flex items-center justify-center gap-1 cursor-pointer">
                                <ExternalLink size={12} className="inline" />
                                <span>
                                    <a href={`https://globe.adsbexchange.com/?icao=${aircraft.icao_no.toLowerCase()}&zoom=8.2&showTrace=${searchParams.trip_date}`} className="text-primary hover:underline" rel='nofollow noopener'>ADS-B Exchange</a>,{" "}
                                </span>
                                <span>
                                    <a href={'https://www.flightradar24.com/data/aircraft/' + aircraft.tail_no.toLowerCase()} className='text-primary hover:underline' rel='nofollow noopener'>FlightRadar24</a>.
                                </span>
                            </span>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}
