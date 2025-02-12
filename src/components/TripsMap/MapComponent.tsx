'use client';

import { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { parseWKT } from '@/lib/utils';
import { FleetTrip } from '@/types';
import L from 'leaflet';
import 'leaflet.heat';

interface MapComponentProps {
    trips: FleetTrip[];
    showHeatmap: boolean;
    selectedTrip: FleetTrip | null;
    onSelectedTripChange: (trip: FleetTrip | null) => void;
    onMapReady: () => void;
    isFullscreen: boolean;
}

function MapComponent({
    trips,
    showHeatmap,
    selectedTrip,
    onSelectedTripChange,
    onMapReady,
    isFullscreen
}: MapComponentProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const layerRefs = useRef({
        heat: null as L.Layer | null,
        lines: null as L.LayerGroup | null
    });
    const boundsRef = useRef<L.LatLngBounds | null>(null);

    const pathFrequency = useMemo(() => {
        const frequencyMap = new Map<string, number>();
        trips
            .filter(t => t.flight_path)
            .forEach(({ flight_path }) => {
                const key = flight_path!.trim();
                frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);
            });
        return {
            map: frequencyMap,
            max: Math.max(...Array.from(frequencyMap.values(), v => v || 0))
        };
    }, [trips]);

    const createLineStyle = useCallback((frequency: number, isSelected: boolean, maxFrequency: number) => ({
        color: isSelected ? 'hsl(var(--secondary))' : 'hsl(var(--primary))',
        weight: (isSelected ? 4 : 2) + (frequency / maxFrequency) * 2,
        opacity: isSelected ? 1 : 0.3 + (frequency / maxFrequency) * 0.7
    }), []);

    const handleLineEvents = useCallback((
        line: L.Polyline,
        trip: FleetTrip,
        frequency: number,
        maxFrequency: number,
        isSelected: boolean
    ) => {
        line
            .on('mouseover', ({ target }) => {
                if (!isSelected) {
                    target.setStyle({
                        ...createLineStyle(frequency, true, maxFrequency),
                        opacity: 1
                    });
                }
            })
            .on('mouseout', ({ target }) => {
                if (!isSelected) {
                    target.setStyle(createLineStyle(frequency, false, maxFrequency));
                }
            })
            .on('click', () => onSelectedTripChange(isSelected ? null : trip));
    }, [createLineStyle, onSelectedTripChange]);

    const processTripsData = useCallback(() => {
        const heatPoints: [number, number, number][] = [];
        const lines: L.Polyline[] = [];

        trips.forEach(trip => {
            if (!trip.flight_path) return;

            try {
                const coords = parseWKT(trip.flight_path);
                const frequency = pathFrequency.map.get(trip.flight_path.trim()) || 1;
                const isSelected = selectedTrip?.id === trip.id;

                const line = L.polyline(coords, createLineStyle(frequency, isSelected, pathFrequency.max));
                handleLineEvents(line, trip, frequency, pathFrequency.max, isSelected);
                lines.push(line);

                coords.forEach(([lat, lng]) => {
                    const distance = Math.hypot(lat - 38.3760, lng - -81.5928);
                    heatPoints.push([lat, lng, distance < 0.025 ? 0.3 : 1]);
                });
            } catch (error) {
                console.error("Invalid WKT format:", trip.flight_path, error);
            }
        });

        return { heatPoints, lines };
    }, [trips, selectedTrip, pathFrequency, createLineStyle, handleLineEvents]);

    const destroyMap = useCallback(() => {
        if (mapInstance.current) {
            if (layerRefs.current.heat) {
                layerRefs.current.heat.remove();
                layerRefs.current.heat = null;
            }
            if (layerRefs.current.lines) {
                layerRefs.current.lines.remove();
                layerRefs.current.lines = null;
            }
            mapInstance.current.remove();
            mapInstance.current = null;
        }
    }, []);

    const initMap = useCallback(async () => {
        if (!mapContainer.current || !trips.length) return;

        destroyMap();

        mapInstance.current = L.map(mapContainer.current);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance.current);

        const { heatPoints, lines } = processTripsData();

        if (heatPoints.length) {
            if (layerRefs.current.heat) layerRefs.current.heat.remove();
            if (layerRefs.current.lines) layerRefs.current.lines.remove();

            layerRefs.current.heat = L.heatLayer(heatPoints, {
                radius: 20,
                blur: 15,
                maxZoom: 17,
                gradient: {
                    0.4: 'blue',
                    0.6: 'lime',
                    0.8: 'yellow',
                    1.0: 'red'
                }
            });

            layerRefs.current.lines = L.layerGroup(lines);

            const activeLayer = showHeatmap ? layerRefs.current.heat : layerRefs.current.lines;
            activeLayer?.addTo(mapInstance.current);

            boundsRef.current = L.latLngBounds(heatPoints.map(([lat, lng]) => [lat, lng]));
            mapInstance.current.fitBounds(boundsRef.current, { padding: [50, 50] });
            
            requestAnimationFrame(() => {
                mapInstance.current?.invalidateSize();
                onMapReady();
            });
        }
    }, [trips, showHeatmap, processTripsData, onMapReady, destroyMap]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const timer = setTimeout(initMap, 100);
            return () => clearTimeout(timer);
        });

        return () => {
            cancelAnimationFrame(frame);
            destroyMap();
        };
    }, [isFullscreen, initMap, destroyMap]);

    useEffect(() => {
        if (!mapInstance.current || !layerRefs.current.heat || !layerRefs.current.lines) return;

        const { heat, lines } = layerRefs.current;
        if (showHeatmap) {
            lines.remove();
            heat.addTo(mapInstance.current);
        } else {
            heat.remove();
            lines.addTo(mapInstance.current);
        }
    }, [showHeatmap]);

    useEffect(() => {
        const handleResize = () => {
            requestAnimationFrame(() => {
                if (!mapInstance.current || !boundsRef.current) return;

                mapInstance.current.invalidateSize({
                    animate: false,
                    pan: false,
                    debounceMoveend: true
                });

                mapInstance.current.fitBounds(boundsRef.current, {
                    padding: [50, 50],
                    animate: false
                });
            });
        };

        const handleResetZoom = () => {
            if (mapInstance.current && boundsRef.current) {
                mapInstance.current.fitBounds(boundsRef.current, { padding: [50, 50] });
            }
        };

        handleResize();

        const element = mapContainer.current;
        const transitionEndHandler = (e: TransitionEvent) => {
            if (e.propertyName === 'height') handleResize();
        };

        element?.addEventListener('transitionend', transitionEndHandler);
        window.addEventListener('resize', handleResize);
        window.addEventListener('resetMapZoom', handleResetZoom);

        return () => {
            element?.removeEventListener('transitionend', transitionEndHandler);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('resetMapZoom', handleResetZoom);
        };
    }, [isFullscreen]);

    return (
        <div
            ref={mapContainer}
            className={`w-full ${
                isFullscreen ? 'h-[calc(100vh-3rem)]' : 'h-96'
            } relative z-0 overflow-hidden`}
            style={{
                transition: 'height 300ms ease-in-out',
                willChange: 'height'
            }}
        />
    );
}

export default memo(MapComponent);