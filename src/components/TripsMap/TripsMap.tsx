'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { formatDate, formatDuration } from '@/lib/utils';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, Maximize2, Minimize2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FleetMember, FleetTrip } from '@/types';
import Link from 'next/link';

// Dynamically import MapComponent with loading state
const MapComponent = dynamic(
    () => import('./MapComponent'),
    {
        ssr: false,
        loading: () => <div className='w-full h-96 bg-gray-200 animate-pulse' />
    }
);

interface TripsMapProps {
    trips: FleetTrip[];
    aircraft: FleetMember;
}

// Memoized Selected Trip Info Component
const SelectedTripInfo = memo(function SelectedTripInfo({
    trip,
    onClose
}: {
    trip: FleetTrip;
    onClose: () => void;
}) {
    return (
        <div className="absolute top-4 right-4 bg-card text-card-foreground p-4 rounded-md shadow-lg border w-fit z-[999]">
            <div className="flex justify-between items-start">
                <Link
                    href={`/trips/${trip.tail_no}/${trip.date}`}
                    className="group flex-1"
                >
                    <div className="text-base font-medium group-hover:text-primary transition-colors whitespace-nowrap">
                        {trip.route}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(trip.date)} &bull; {formatDuration(trip.flight_hours)}<br />
                        {trip.department}
                    </div>
                </Link>
                <button
                    onClick={onClose}
                    className="text-muted-foreground hover:text-foreground ml-2"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
});

// Memoized Heatmap Legend Component
const HeatmapLegend = memo(function HeatmapLegend() {
    return (
        <>
            <span className="mx-2 hidden md:block">|</span>
            <div className='flex items-center space-x-4'>
                <span className='text-blue-500'>Low</span>
                <div className='inline-grid grid-cols-4 w-fit'>
                    <div className='bg-blue-500 w-4 h-4' />
                    <div className='bg-lime-500 w-4' />
                    <div className='bg-yellow-500 w-4' />
                    <div className='bg-red-500 w-4' />
                </div>
                <span className='text-red-500'>High</span>
            </div>
        </>
    );
});

// Memoized Control Links Component
const ControlLinks = memo(function ControlLinks({
    aircraft,
    showHeatmap
}: {
    aircraft: FleetMember;
    showHeatmap: boolean;
}) {
    return (
        <div className='space-x-4 flex flex-col md:flex-row items-center'>
            <div className='space-x-2'>
                <ExternalLink size={16} className='inline' />
                <Link 
                    href={`https://globe.adsbexchange.com/?icao=${aircraft.icao_no.toLowerCase()}&zoom=8.2`} 
                    className="text-primary hover:underline" 
                    rel='nofollow noopener'
                >
                    ADS-B Exchange
                </Link>,{" "}
                <Link 
                    href={`https://www.flightradar24.com/data/aircraft/${aircraft.tail_no.toLowerCase()}`} 
                    className='text-primary hover:underline' 
                    rel='nofollow noopener'
                >
                    FlightRadar24
                </Link>
            </div>
            {showHeatmap && <HeatmapLegend />}
        </div>
    );
});

function TripsMap({ trips, aircraft }: TripsMapProps) {
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState<FleetTrip | null>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const totalDataPoints = useMemo(() => 
        trips.reduce((acc, trip) => 
            acc + (((trip.flight_path || "").split(",").length - 1) || 0), 
        0
    ), [trips]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isFullscreen]);

    const handleMapControls = {
        toggleFullscreen: () => setIsFullscreen(prev => !prev),
        toggleHeatmap: () => setShowHeatmap(prev => !prev),
        resetZoom: () => window.dispatchEvent(new Event('resetMapZoom')),
        closeSelected: () => setSelectedTrip(null),
        setMapReady: () => setIsMapReady(true)
    };

    return (
        <div className='flex flex-col space-y-2'>
            <Card 
                className={`transition-all duration-300 overflow-hidden ${
                    isFullscreen ? 'fixed inset-0 z-50 rounded-none p-0' : 'p-4'
                }`}
            >
                <div className='relative flex flex-col h-full'>
                    <div className='relative flex-1 min-h-0'>
                        <MapComponent
                            trips={trips}
                            showHeatmap={showHeatmap}
                            selectedTrip={selectedTrip}
                            onSelectedTripChange={setSelectedTrip}
                            onMapReady={handleMapControls.setMapReady}
                            isFullscreen={isFullscreen}
                        />
                    </div>

                    {isMapReady && !showHeatmap && selectedTrip && (
                        <SelectedTripInfo 
                            trip={selectedTrip} 
                            onClose={handleMapControls.closeSelected}
                        />
                    )}

                    <div className={`font-mono text-xs grid grid-cols-2 gap-2 shrink-0 ${
                        isFullscreen ? 'bg-background/80 backdrop-blur-sm p-4' : 'mt-4'
                    }`}>
                        <ControlLinks 
                            aircraft={aircraft} 
                            showHeatmap={showHeatmap}
                        />
                        
                        <div className='ml-auto text-right space-x-4'>
                            {isFullscreen && (
                                <span className='text-muted'>press esc to exit or click</span>
                            )}
                            <button
                                onClick={handleMapControls.toggleFullscreen}
                                className="text-primary hover:underline cursor-pointer"
                                disabled={!isMapReady}
                            >
                                {isFullscreen ? (
                                    <><Minimize2 size={14} className="inline mr-1" /> exit fullscreen</>
                                ) : (
                                    <><Maximize2 size={14} className="inline mr-1" /> fullscreen</>
                                )}
                            </button>
                            <span>|</span>
                            <button
                                onClick={handleMapControls.toggleHeatmap}
                                className="text-primary hover:underline cursor-pointer"
                                disabled={!isMapReady}
                            >
                                show {showHeatmap ? 'lines' : 'heatmap'}
                            </button>
                            <span>|</span>
                            <button
                                onClick={handleMapControls.resetZoom}
                                className="text-primary hover:underline cursor-pointer"
                                disabled={!isMapReady}
                            >
                                reset map
                            </button>
                        </div>
                    </div>
                </div>
            </Card>
            
            {!isFullscreen && (
                <div className='md:text-left text-center text-muted md:pl-4 text-xs cursor-pointer'>
                    drawn on {totalDataPoints.toLocaleString()} data points; data may be incomplete
                </div>
            )}
        </div>
    );
}

export default memo(TripsMap);