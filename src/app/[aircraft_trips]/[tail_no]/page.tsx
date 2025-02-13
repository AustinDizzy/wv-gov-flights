import { getTrips, getAircraft } from '@/lib/db';
import { TripsTable } from '@/app/trips/trips-table';
import type { FleetMember } from '@/types';
import { cn } from '@/lib/utils';
import TripsMap from '@/components/TripsMap/TripsMap';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DurationTooltip } from '@/components/duration-tooltip';
import { DistanceTooltip } from '@/components/distance-tooltip';
import { TripActivityChart } from '@/components/trip-activity-chart';
import { DepartmentUsageChart } from '@/components/department-usage-chart';
import { InfoIcon } from 'lucide-react';
import { notFound } from 'next/navigation';
import Image from 'next/image';

export const dynamicParams = false;

export async function generateStaticParams() {
    const aircraft = await getAircraft() as FleetMember[];
    return aircraft.flatMap(({ tail_no }) => [
        { tail_no, aircraft_trips: 'aircraft' },
        { tail_no, aircraft_trips: 'trips' },
    ]);
}

export async function generateMetadata(props: { params: Promise<{ tail_no: string }> }) {
    const params = await props.params;
    const aircraft = await getAircraft(params.tail_no).then(a => a?.pop());
    if (!aircraft) return notFound();
    return { title: `${aircraft.tail_no} - ${aircraft.name}` };
}

export default async function AircraftTripsPage(
    props: {
        params: Promise<{ tail_no: string, aircraft_trips: string }>;
    }
) {
    const params = await props.params;
    if (!['aircraft', 'trips'].includes(params.aircraft_trips)) notFound();

    const tail_no = params.tail_no;
    const aircraft = await getAircraft(tail_no).then(a => a?.pop()) as FleetMember;

    const [trips] = await Promise.all([
        getTrips({ aircraft: tail_no }),
    ]);

    return (
        <div className='container mx-auto space-y-6 p-2 md:p-6'>
            <div className="space-y-6" key={['trips', aircraft.tail_no].join('/')}>
                {params.aircraft_trips === 'aircraft' && (
                    <>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-4">
                            <Badge variant={aircraft.type === "airplane" ? "secondary" : "default"}
                                className="text-lg px-4 py-2">
                                {aircraft.tail_no} {aircraft.type === "airplane" ? "✈️" : "🚁"}
                            </Badge> {aircraft.name}
                        </h1>
                        <Card className='flex flex-col md:flex-row shadow-md'>
                            {aircraft.content_json?.image && (
                                <div className='relative w-full md:w-1/3 h-64 md:h-auto'>
                                    <Image
                                        src={aircraft.content_json.image}
                                        alt={[aircraft.tail_no, aircraft.name].join(' ')}
                                        width={400}
                                        height={300}
                                        className='rounded-t-md md:rounded-l-md md:rounded-t-none object-cover w-full h-full'
                                    />
                                    <span className='font-mono text-slate-600 text-xs absolute bottom-2 right-2 px-2 py-1 bg-white bg-opacity-50 cursor-pointer'>
                                        <a href={aircraft.content_json.image.replace(/\/download\?inline$/, '')} className='group' rel='noopener nofollow'>
                                            (source: <span className='group-hover:underline text-primary'>
                                                {new URL(aircraft.content_json.image).hostname}
                                            </span>)
                                        </a>
                                    </span>
                                </div>
                            )}
                            <div className='p-6 flex-grow space-y-6'>
                                {aircraft.trip_count > 0 && (
                                    <>
                                        <div className={cn("grid gap-6", aircraft.content_json?.image ? 'grid-cols-2' : 'md:grid-cols-4 grid-cols-2')}>
                                            <div className="space-y-2">
                                                <p className="text-sm text-muted-foreground"># of Trips</p>
                                                <p className="text-2xl font-bold">{trips.length}</p>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-sm text-muted-foreground">Flight Hours</p>
                                                <p className="text-2xl font-bold">
                                                    <DurationTooltip duration={trips.reduce((acc, trip) => acc + trip.flight_hours, 0)} />
                                                </p>
                                            </div>
                                            {trips.filter(t => t.flight_path).length > 1 && <div className="space-y-2">
                                                <p className="text-sm text-muted-foreground">Total Distance</p>
                                                <p className="text-2xl font-bold">
                                                    <DistanceTooltip paths={
                                                        trips.flatMap(t => t.flight_path ? [t.flight_path] : [])
                                                    } />
                                                </p>
                                            </div>}
                                            <div className="space-y-2">
                                                <p className="text-sm text-muted-foreground">Total Invoiced Cost</p>
                                                <p className="text-2xl font-bold">
                                                    {trips.map(t => t.flight_hours * aircraft.rate).reduce((a, b) => a + b, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }).replace(/\.00$/, '')}
                                                </p>
                                            </div>
                                        </div>
                                        <hr className="my-4" />
                                    </>
                                )}
                                <div className="flex md:flex-row flex-col gap-10">
                                    <div className="space-y-4 max-w-xs flex-grow">
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-muted-foreground">Status</span>
                                            <span className={cn('cursor-pointer px-2 rounded text-primary-foreground', aircraft.status == 'active' ? 'bg-green-500' : 'bg-destructive')}>{aircraft.status == 'active' ? "Active" : "Decommissioned"}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-muted-foreground">Type</span>
                                            <span>{aircraft.type}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-muted-foreground">Rate</span>
                                            <span className="font-mono">${aircraft.rate.toLocaleString()} per hour</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-muted-foreground">Seats</span>
                                            <span>{aircraft.seats}</span>
                                        </div>
                                    </div>
                                    <div className='space-y-2 flex-grow'>
                                        <span className='font-semibold text-muted-foreground'>Resources</span>
                                        <ul className="list-disc list-inside">
                                            <li key={"aircraft-ext"}>
                                                <a href={`https://globe.adsbexchange.com/?icao=${aircraft.icao_no.toLocaleLowerCase()}`} className="text-primary underline" rel="noopener nofollow">
                                                    {aircraft.tail_no.toLocaleUpperCase()} on ADS-B Exchange
                                                </a>
                                            </li>
                                            {aircraft.content_json?.resources && Object.entries(aircraft.content_json.resources).map(([key, value]) => (
                                                <li key={key}>
                                                    <a href={value} className="group" rel="noopener nofollow">
                                                        <span className='text-primary underline'>{key}</span>{" "}
                                                        <span className='text-muted-foreground group-hover:underline group-hover:text-primary'>({new URL(value).hostname})</span>
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                {trips.length == 0 && (
                                    <div className='flex items-baseline bg-primary text-primary-foreground p-4 h-fit rounded shadow cursor-pointer space-x-3 max-w-5xl mx-auto'>
                                        <InfoIcon size={16} />
                                        <span>No recorded trip data is available for this aircraft yet.<br />Please check back again later.</span>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </>
                )}

                {trips.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <TripActivityChart trips={trips} />
                        <DepartmentUsageChart
                            trips={trips}
                            type="department"
                        />
                    </div>
                )}

                {trips.filter(t => t.flight_path).length > 1 && (
                    <TripsMap trips={trips} aircraft={aircraft} />
                )}

                {aircraft.trip_count > 0 &&
                    <TripsTable
                        trips={trips}
                        aircraft={[aircraft]}
                    />
                }
            </div>
        </div>
    );
}