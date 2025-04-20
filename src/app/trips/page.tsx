import { getAircraft, getTrips } from "@/lib/db";
import { TripsTable } from "@/app/trips/trips-datatable";
import type { FleetMember } from "@/types";
import { Suspense } from "react";

export default async function TripsPage() {
    const [trips, aircraft] = await Promise.all([
        getTrips({}),
        getAircraft(),
    ]);

    return (
        <div className="space-y-6 p-6">
            <Suspense>
                <TripsTable
                    trips={trips}
                    aircraft={aircraft as FleetMember[]}
                    variant='default'
                />
            </Suspense>
        </div>
    );
}