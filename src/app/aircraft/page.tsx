import { getAircraft } from "@/lib/db";
import { FleetMember } from "@/types";
import { AircraftTable } from '@/app/aircraft/aircraft-table';

export default async function AircraftPage() {
  const aircraft = await getAircraft() as FleetMember[]

  return (
    <div className="space-y-6 p-6">
      <div className="mx-auto">
          <AircraftTable fleet={aircraft} />
      </div>
    </div>
  )
}