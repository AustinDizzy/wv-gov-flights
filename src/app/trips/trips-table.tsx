'use client';

import { useSearchParams } from 'next/navigation';
import { FleetMember, FleetTrip } from '@/types';
import { TripFilters } from '@/app/trips/trip-filters';
import { TripsDataTable } from '@/app/trips/trips-datatable';
import { useMemo, Suspense } from 'react';
import { filterTrips } from '@/lib/utils'

interface TripsTableProps {
    trips: FleetTrip[];
    aircraft: FleetMember[];
}

export function TripsTable({
    trips,
    aircraft,
}: TripsTableProps) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <TripsTableContent trips={trips} aircraft={aircraft} />
        </Suspense>
    );
}

function TripsTableContent({ trips, aircraft }: TripsTableProps) {
    const searchParams = useSearchParams();
    
    const filteredTrips = useMemo(() => {
        return filterTrips(trips, {
            aircraft: searchParams.get('aircraft') || undefined,
            department: searchParams.get('department') || undefined,
            division: searchParams.get('division') || undefined,
            search: searchParams.get('search') || undefined,
            startDate: searchParams.get('startDate') || undefined,
            endDate: searchParams.get('endDate') || undefined,
        });
    }, [trips, searchParams]);

    const departments = useMemo(() =>
        [...new Set(filteredTrips
            .map(t => t.department)
            .filter(Boolean) as string[]
        )].sort(),
        [filteredTrips]
    );

    const divisions = useMemo(() =>
        [...new Set(filteredTrips
            .map(t => t.division)
            .filter(Boolean) as string[]
        )].sort(),
        [filteredTrips]
    );

    return (
        <div className="space-y-4">
            <TripFilters
                aircraft={aircraft}
                departments={departments}
                divisions={divisions}
                searchParams={Object.fromEntries(searchParams)}
            />
            <TripsDataTable trips={filteredTrips} />
        </div>
    );
}
