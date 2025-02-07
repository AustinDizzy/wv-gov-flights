import { getPassengers, getTrips } from "@/lib/db";
import { TripSearchParams } from "@/types";
import { PassengerTable } from "@/app/passengers/passengers-table";
import { Suspense } from "react";

export default async function PassengersPage({searchParams}: {
    searchParams: Promise<TripSearchParams>
}) {
    const params = await searchParams;
    const passengers = await getTrips(params).then(getPassengers);

    return (
        <div className="space-y-6 p-6">
            <div className="mx-auto">
                <h2 className="font-semibold text-xl mb-2">Passengers</h2>
                <Suspense>
                    <PassengerTable passengers={passengers} />
                </Suspense>
            </div>
        </div>
    )
}