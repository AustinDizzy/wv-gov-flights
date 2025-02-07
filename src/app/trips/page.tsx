import {
    getAircraft,
    getDepartments,
    getDivisions,
    getTrips,
} from "@/lib/db";
import { TripSearchParams } from "@/types";
import { TripFilters } from "./trip-filters";
import { TripsTable } from "./trips-table";

export default async function TripsPage(props: {
    searchParams: Promise<TripSearchParams>
}) {
    const searchParams = await props.searchParams;
    const [trips, aircraft, departments, divisions] = await Promise.all([
        getTrips(searchParams),
        getAircraft(searchParams.aircraft),
        getDepartments(searchParams.aircraft),
        getDivisions(searchParams.department),
    ]);

    return (
        <div className="space-y-6 p-6">
            <div className="space-y-4">
                <TripFilters
                    aircraft={aircraft}
                    departments={departments}
                    divisions={divisions}
                    searchParams={searchParams}
                />
            
                <TripsTable trips={trips} />
            </div>
        </div>
      )
}