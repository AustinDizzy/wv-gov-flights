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
import { cn, getEmoji } from "@/lib/utils";
import type { FleetTrip, FleetMember } from "@/types";
import { ExternalLink, InfoIcon } from "lucide-react";

export const dynamicParams = false;

interface AircraftTripDatePageProps {
    params: Promise<{ tail_no: string; trip_date: string }>;
}

export async function generateStaticParams() {
    return (await getTrips({})).map(({ tail_no, date }) => ({ tail_no, trip_date: date }));
}

export async function generateMetadata({ params }: AircraftTripDatePageProps) {
    const { tail_no, trip_date } = await params;
    const { trips, aircraft } = await getAircraftTrips(tail_no, trip_date);

    if (!aircraft || trips.length == 0) return notFound();

    return {
        title: [aircraft.tail_no, 'on', formatTripDate((await params).trip_date)].join(' '),
        description: trips[0].unknown ?
            `${getEmoji(aircraft)} ${aircraft.tail_no} recorded flight on ${formatTripDate(trip_date)}` :
            `${getEmoji(aircraft)} ${aircraft.tail_no} took ` + (trips.length > 1 ?
            (trips.length + " trips totaling " + trips.map(t => t.flight_hours).reduce((a, b) => a + b, 0) + " flight hours on " + formatTripDate(trip_date)) :
            (
                trips[0].passengers ? (
                    trips[0].pax.length + " passengers" + (isRoundTrip(trips[0].route) ? " on a round trip" : "") + " from " + formatRouteStr(trips[0].route)
                ) : (
                    "flight for " + trips[0].flight_hours + " hours" + (isRoundTrip(trips[0].route) ? " on a round trip" : "") + " from " + formatRouteStr(trips[0].route)
                )
            )
        )
    }
}

async function getAircraftTrips(tail_no: string, trip_date: string): Promise<{trips: FleetTrip[], aircraft: FleetMember}> {
    const [trips, aircraft] = await Promise.all([
        getTrips({
            aircraft: tail_no,
            startDate: trip_date,
            endDate: trip_date,
        }),
        getAircraft(tail_no).then(a => a?.pop() as FleetMember),
    ]);

    return { trips, aircraft };

}

function isRoundTrip(route: string): boolean {
    return route.split("-").every((p, i, a) => p === a[a.length - 1 - i])
}

function formatTripDate(trip_date: string): string {
    return format(parse(trip_date, "yyyy-MM-dd", new Date()), "MMMM d, yyyy");
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

export default async function AircraftTripDatePage({ params }: AircraftTripDatePageProps) {
    const searchParams = (await params) as Record<string, string>;
    const { trips, aircraft } = await getAircraftTrips(searchParams.tail_no, searchParams.trip_date);

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
                    {formatTripDate(searchParams.trip_date)}
                </h1>

                {flightPath && (
                    <div className="space-y-2">
                        <Card className="p-4">
                            <Map
                                flightPath={flightPath}
                                flightDate={searchParams.trip_date}
                                flightHours={flightHours}
                                flightCraft={aircraft}
                            />
                        </Card>
                        <div className="text-xs text-muted md:justify-end justify-center cursor-pointer flex items-center">
                            <InfoIcon size={12} className="mr-2" />
                            recorded flight path data could be partial or incomplete
                        </div>
                    </div>
                )}

                {trips.map((trip, i) => (
                    <Card key={trip.id || `unknown-${i}`} id={trip.id?.toString()} className="card grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                        {(trip.route.replaceAll("-","").length > 0) && <h1 className="text-2xl md:text-justify text-center font-semibold col-span-full">
                            {trip.unknown ? trip.route : (
                                <>
                                    {trips.length > 1 && (
                                        <a className="text-sm text-muted-foreground font-mono font-light" href={`#${trip.id}`}>#{i}.</a>
                                    )}
                                    <div className="inline-flex flex-col md:flex-row items-center gap-2">
                                        {formatRouteStr(trip.route)}{" "}{isRoundTrip(trip.route) && <span className="text-muted-foreground text-base whitespace-nowrap">(round trip)</span>}
                                    </div>
                                </>
                            )}
                        </h1>}
                        <Card className="p-6">
                            <dl className="space-y-4">
                                {!trip.unknown && <div className="grid grid-cols-2 gap-4">
                                    <div className={cn(!trip.division && "col-span-2")}>
                                        <dt className="text-sm text-muted-foreground">Department</dt>
                                        <dd className="text-lg font-medium">{trip.department}</dd>
                                    </div>
                                    {trip.division && <div>
                                        <dt className="text-sm text-muted-foreground">Division</dt>
                                        <dd className="text-lg font-medium">{trip.division}</dd>
                                    </div>}
                                </div>}
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
                                        <dt className="text-sm text-muted-foreground">{trip.unknown ? 'Approx. Invoice' :'Invoiced Amount'}</dt>
                                        <dd className="text-lg font-medium">{trip.unknown && '~'}${(trip.flight_hours * trip.aircraft.rate).toLocaleString()}</dd>
                                    </div>
                                </div>
                            </dl>
                        </Card>

                        <div className="space-y-6">
                            {trip.unknown && <Card className="relative bg-muted">
                                <div className="col-span-full">
                                    <div className="rounded-md p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <InfoIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                                            </div>
                                            <div className="ml-3">
                                                <h3 className="text-sm font-medium text-muted-foreground">Limited Flight Data</h3>
                                                <div className="mt-2 text-sm text-muted-foreground">
                                                    <p>
                                                        We have recorded flight path data for this date, but have not yet received trip details from the State Aviation Division.
                                                        Check back later for updates.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>}
                            {!trip.unknown && <Card className="relative pt-4">
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
                            </Card>}

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
                    <Card className="p-4 bg-muted">
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
