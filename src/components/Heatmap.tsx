'use client';
import { useRef, useEffect, Suspense } from 'react';
import { parseWKT } from '@/lib/utils';
import 'leaflet/dist/leaflet.css';
import { ExternalLink } from 'lucide-react';
import { FleetMember } from '@/types';

interface HeatmapProps {
    flightPaths: string[];
    aircraft: FleetMember;
}

export default function Heatmap({ flightPaths, aircraft }: HeatmapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const heatLayer = useRef<L.Layer | null>(null);
    const bounds = useRef<L.LatLngBounds | null>(null);

    useEffect(() => {
        if (flightPaths.length == 0 || !mapContainer.current) return;
        if (map.current) {
            map.current.remove();
            map.current = null;
        }

        const initMap = async () => {
            const L = (await import('leaflet')).default;
            await import('leaflet.heat');

            if (!map.current) {
                map.current = L.map(mapContainer.current as HTMLElement);
            }

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map.current);

            const heatPoints: [number, number, number][] = [];
            flightPaths.forEach((wkt) => {
                try {
                    const coords = parseWKT(wkt);
                    coords.forEach(([lat, lng]) => {
                        const distance = Math.sqrt(
                            Math.pow(lat - 38.3760, 2) +
                            Math.pow(lng - -81.5928, 2)
                        );
                        const weight = distance < 0.025 ? 0.3 : 1;
                        heatPoints.push([lat, lng, weight]);
                    });
                } catch (error) {
                    console.error("Invalid WKT format:", wkt, error);
                }
            });

            if (heatPoints.length > 0) {
                heatLayer.current = L.heatLayer(heatPoints, {
                    radius: 20,
                    blur: 15,
                    maxZoom: 17,
                    gradient: {
                        0.4: 'blue',
                        0.6: 'lime',
                        0.8: 'yellow',
                        1.0: 'red'
                    }
                }).addTo(map.current);

                bounds.current = L.latLngBounds(heatPoints.map(([lat, lng]) => [lat, lng]));
                map.current.fitBounds(bounds.current, { padding: [50, 50] });

                setTimeout(() => {
                    map.current?.invalidateSize();
                }, 100);
            }
        }

        initMap();

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, [flightPaths]);

    const handleResetZoom = () => {
        if (map.current && heatLayer.current) {
            map.current.fitBounds(bounds.current as L.LatLngBounds, { padding: [50, 50] });
        }
    };

    return (
        <div className='relative z-10'>
            <Suspense fallback={<div className='w-full h-96 bg-gray-200 animate-pulse' />}>
                <div ref={mapContainer} className='w-full h-96' />
                <div className="mt-4 font-mono text-xs grid grid-cols-2 gap-2 cursor-pointer">
                    <div className='space-x-4 flex flex-col md:flex-row items-center'>
                        <div className='space-x-2'>
                            <ExternalLink size={16} className='inline' />
                            <a href={`https://globe.adsbexchange.com/?icao=${aircraft.icao_no.toLocaleLowerCase()}&zoom=8.2`} className="text-primary hover:underline" rel='nofollow noopener'>ADS-B Exchange</a>,{" "}
                            <a href={'https://www.flightradar24.com/data/aircraft/' + aircraft.tail_no.toLowerCase()} className='text-primary hover:underline' rel='nofollow noopener'>FlightRadar24</a>
                        </div>
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
                    </div>
                    <div className='ml-auto text-right'>
                        <a
                            onClick={handleResetZoom}
                            className="text-blue-500 hover:underline cursor-pointer"
                        >
                            reset map
                        </a>
                    </div>
                </div>
            </Suspense>
        </div>
    )
}