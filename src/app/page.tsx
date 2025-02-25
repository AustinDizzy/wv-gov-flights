import { getAircraft, getPassengers, getTrips } from "@/lib/db";
import type { FleetMember, FleetTrip } from "@/types";
import { AircraftTable } from '@/app/aircraft/aircraft-table';
import { DistanceTooltip } from "@/components/distance-tooltip";
import Link from "next/link";

export default async function Home() {
  const aircraft = await getAircraft() as FleetMember[]
  const trips = await getTrips({}) as FleetTrip[]

  const totalFlights = trips.map(t => t.route).reduce((a, b) => a+(b.split(/-| to /).length - 1), 0)
  const totalPax = (await getPassengers(trips)).size
  const flightPaths = trips.flatMap(t => t.flight_path ? [t.flight_path] : [])

  const totalHours = trips.reduce((acc, trip) => acc + trip.flight_hours, 0)

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="mr-4 space-y-8">
          <p>
            The <a href="https://www.wv.gov" target="nofollow noopener" className="text-primary underline">State of West Virginia</a> owns and operates a fleet of aircraft with its <a href="https://aviation.wv.gov" target="nofollow noopener" className="text-primary underline">State Aviation Division</a>. This site provides a way to search & discover the use of these aircraft, including the passengers, routes, departments, flight paths, and justifications.
            <br /><br />
            This website currently has data on{" "}
            <Link href="/trips" className="text-primary underline">
            {trips.length.toLocaleString()} trips
            </Link> ({totalFlights.toLocaleString()} flights) totaling{" "}
            {totalHours.toLocaleString()} flight hours, with{" "}
            <Link href="/passengers" className="text-primary underline whitespace-nowrap">
            {totalPax.toLocaleString()} passengers
            </Link>{" "} recorded traveling over{" "}
            <DistanceTooltip paths={flightPaths} variant="long" />.
          </p>
          <p className="text-sm">
            Source code for this project is available <a href="https://github.com/AustinDizzy/wv-gov-flights" target="nofollow noopener" className="text-primary underline">on GitHub</a> under the <a href="https://creativecommons.org/publicdomain/zero/1.0/legalcode" target="nofollow noopener" className="text-primary underline">Creative Commons Zero (Public Domain)</a> license.
            {" "}
            See the <a href="https://github.com/AustinDizzy/wv-gov-flights/wiki/Frequently-Asked-Questions" target="nofollow noopener" className="text-primary underline">Frequently Asked Questions page</a> in the project wiki for more information.
          </p>
        </div>
        <div>
          <AircraftTable fleet={aircraft} />
        </div>
      </div>
    </div>
  )
}