'use client';

import { useSearchParams } from 'next/navigation';
import { FleetMember, FleetTrip } from '@/types';
import { PassengerDataTable } from './passengers-datatable';
import { PassengersFilter } from './passengers-filter';
import { Suspense, useMemo } from 'react';
import { filterPassengers } from '@/lib/utils';

interface PassengersWrapperProps {
    passengers: Map<string, FleetTrip[]>;
    aircraft: FleetMember[];
}

export function PassengersTable({
    passengers,
    aircraft,
}: PassengersWrapperProps) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PassengersTableContent
                passengers={passengers}
                aircraft={aircraft}
            />
        </Suspense>
    )
}

export function PassengersTableContent({
    passengers,
    aircraft,
}: PassengersWrapperProps) {
    const searchParams = useSearchParams();

    const departments = useMemo(() =>
        [...new Set(Array.from(passengers.values())
            .flat()
            .map(t => t.department))]
            .filter(Boolean)
            .sort(),
        [passengers]
    );

    const filteredPassengers = useMemo(() =>
        filterPassengers(passengers, {
            search: searchParams.get('search') || '',
            aircraft: searchParams.get('aircraft') || '',
            department: searchParams.get('department') || '',
        }),
        [passengers, searchParams]
    );

    return (
        <div className="space-y-4">
            <PassengersFilter
                aircraft={aircraft}
                departments={departments}
            />
            <PassengerDataTable passengers={filteredPassengers} />
        </div>
    );
}
