import { getPassengers, getTrips, getAircraft } from "@/lib/db";
import { PassengersTable } from "./passengers-table";

export default async function PassengersPage() {
    const [passengers, aircraft] = await Promise.all([
        getTrips({}).then(getPassengers),
        getAircraft(),
    ]);

    return (
        <div className="space-y-6 p-6">
            <div className="mx-auto">
                <PassengersTable
                    passengers={passengers}
                    aircraft={aircraft || []}
                />
            </div>
        </div>
    );
}