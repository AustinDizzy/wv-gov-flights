import { getAircraft, getPassengers, getTrips } from "@/lib/db";
import type { FleetMember, FleetTrip } from "@/types";
import { AircraftTable } from '@/app/aircraft/aircraft-table';
import { DurationTooltip } from "@/components/duration-tooltip";
import { DistanceTooltip } from "@/components/distance-tooltip";
import Link from "next/link";

export default async function Home() {
  const aircraft = await getAircraft() as FleetMember[]
  const trips = await getTrips({}) as FleetTrip[]

  const totalPax = (await getPassengers(trips)).size
  const flightPaths = trips.flatMap(t => t.flight_path ? [t.flight_path] : [])

  const totalHours = trips.reduce((acc, trip) => acc + trip.flight_hours, 0)

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="mr-4">
            The <a href="https://www.wv.gov" target="nofollow noopener" className="text-primary underline">State of West Virginia</a> owns and operates a fleet of aircraft with its <a href="https://aviation.wv.gov" target="nofollow noopener" className="text-primary underline">State Aviation Division</a>. This site provides a way to search & discover the use of these aircraft, including the passengers, routes, departments, flight paths, and justifications.
            <br /><br />
            This website currently has data on{" "}
            <Link href="/trips" className="text-primary underline">
            {trips.length.toLocaleString()} trips
            </Link> totaling{" "}
            <DurationTooltip duration={totalHours} variant="long" />, with{" "}
            <Link href="/passengers" className="text-primary underline whitespace-nowrap">
            {totalPax.toLocaleString()} passengers
            </Link>{" "} recorded traveling over{" "}
            <DistanceTooltip paths={flightPaths} variant="long" />.
          </p>
        </div>
        <div>
          <AircraftTable fleet={aircraft} />
        </div>
      </div>
    </div>
  )
}