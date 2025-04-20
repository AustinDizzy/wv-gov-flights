import { getPassengers, getTrips } from "@/lib/db";
import { getPaxMap, hasPax, parseNameSlug } from "@/lib/utils";
import { TripsTable } from "@/app/trips/trips-datatable";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DurationTooltip } from "@/components/duration-tooltip";
import { DistanceTooltip } from "@/components/distance-tooltip";
import { Suspense } from "react";
import { FleetTrip } from "@/types";

export const dynamicParams = false;

interface PassengerPageProps {
    params: Promise<{ name: string }>;
}

async function getPassenger(name: string): Promise<[string, string, FleetTrip[]]> {
    const trips = await getTrips({}).then(trips => trips.filter(trip => hasPax(trip.passengers, name)));
    return [
        name,
        getPaxMap(trips[0]?.passengers)[name],
        trips,
    ]
}

export async function generateStaticParams() {
    const passengers = await getTrips({}).then(getPassengers);
    return Array.from(passengers.keys()).map(parseNameSlug).map(name => ({ name }));
}

export async function generateMetadata({ params }: PassengerPageProps) {
    const [, passenger, trips] = await getPassenger((await params).name);
    return {
        title: `${passenger} | Passengers on WV State Aircraft `,
        description: `${trips.length} trips by ${passenger} on WV State aircraft`
    };
}

export default async function PassengerPage({ params }: PassengerPageProps) {
    const [, passenger, trips] = await getPassenger((await params).name);

    if (trips.length === 0) notFound();

    const flightPaths = trips.flatMap(t => t.flight_path ? [t.flight_path] : []);
    const totalHours = trips.reduce((acc, trip) => acc + trip.flight_hours, 0)

    return (
        <div className='container mx-auto space-y-6 p-6'>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight flex items-end gap-2">
                        {passenger}
                    </h1>
                    <Card className="p-4">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <p className="text-sm"># of Trips</p>
                                <p className="text-xl font-semibold">{trips.length}</p>
                            </div>
                            <div>
                                <p className="text-sm">Total Flight Time</p>
                                <p className="text-xl font-semibold">
                                    <DurationTooltip duration={totalHours} variant="full" />
                                </p>
                            </div>
                            {flightPaths.length > 0 && <div>
                                <p className="text-sm">Total Distance</p>
                                <p className="text-xl font-semibold">
                                    <DistanceTooltip paths={flightPaths} />
                                </p>
                            </div>}
                            <div>
                                <p className="text-sm">Passenger Cost</p>
                                <p className="text-xl font-semibold">
                                    {Number(trips.map(t => (t.flight_hours * t.aircraft.rate) / t.pax.length).reduce((a, b) => a + b, 0)).toLocaleString('en-US', { style: 'currency', currency: 'USD' }).replace(/\.00$/, '')}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
                <Suspense>
                    <TripsTable
                        trips={trips}
                        variant='default'
                    />
                </Suspense>
            </div>
        </div>
    );
}