import { getAircraft, getTrips } from "@/lib/db";
import { TripsTable } from "@/app/trips/trips-table";
import type { FleetMember } from "@/types";

export default async function TripsPage() {
    const [trips, aircraft] = await Promise.all([
        getTrips({}),
        getAircraft(),
    ]);

    return (
        <div className="space-y-6 p-6">
            <TripsTable
                trips={trips}
                aircraft={aircraft as FleetMember[]}
            />
        </div>
    );
}