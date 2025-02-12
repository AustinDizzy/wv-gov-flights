'use client';

import { useEffect, useRef, useState } from 'react';
import { Aircraft } from '@/types';
import { parseWKT } from '@/lib/utils';
import * as turf from '@turf/turf';
import { ExternalLink } from 'lucide-react';
import type { Map as LeafletMap, Marker, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProps {
  flightPath?: string;
  flightDate: string;
  flightHours: number;
  flightCraft: Aircraft;
}

export default function Map({ flightPath, flightDate, flightHours, flightCraft }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const polylineRef = useRef<Polyline | null>(null);
  const animationRef = useRef<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const progressRef = useRef(0);
  const coordsRef = useRef<[number, number][]>([]);


  useEffect(() => {
    if (!flightPath || !mapContainer.current) return;
    if (map.current) map.current.remove();

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      
      coordsRef.current = parseWKT(flightPath);

      if (!map.current) {
        map.current = L.map(mapContainer.current as HTMLElement).setView(coordsRef.current[0], 7);
      }

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map.current);

      const icon = L.divIcon({
        html: flightCraft.type === 'airplane' ? '🛩️' : '🚁',
        className: 'aircraft-icon text-2xl',
      });

      markerRef.current = L.marker(coordsRef.current[0], { icon }).addTo(map.current);
      polylineRef.current = L.polyline(coordsRef.current, {
        color: '#EAAA00',
        weight: 2
      }).addTo(map.current);

      map.current.fitBounds(polylineRef.current.getBounds(), {
        padding: [50, 50]
      });


    };

    initMap();

    return () => {
      map.current?.remove();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [flightPath, flightCraft.type]);

  const animate = () => {
    if (!map.current || !markerRef.current || coordsRef.current.length < 2) return;

    setIsAnimating(true);
    const flightFactor = Math.pow(Math.E, Math.pow(flightHours, Math.PI / 100));
    const pathFactor = Math.pow(coordsRef.current.length, 0.5);
    const totalSteps = Math.round(15 * flightFactor * pathFactor);
    
    if (progressRef.current >= totalSteps) {
      setIsAnimating(false);
      progressRef.current = 0;
      return;
    }

    const progress = progressRef.current / totalSteps;
    const line = turf.lineString(coordsRef.current);
    const totalDistance = turf.length(line, { units: 'kilometers' });
    const alongDistance = progress * totalDistance;
    const currentPoint = turf.along(line, alongDistance, { units: 'kilometers' });
    const currentPos = currentPoint.geometry.coordinates as [number, number];

    markerRef.current.setLatLng(currentPos);
    progressRef.current += 1;
    animationRef.current = requestAnimationFrame(animate);
  };

  const handleReplay = () => {
    if (!isAnimating && markerRef.current && coordsRef.current.length > 0) {
      markerRef.current.setLatLng(coordsRef.current[0]);
      progressRef.current = 0;
      animate();
    }
  };

  const handleResetZoom = () => {
    if (map.current && polylineRef.current) {
      map.current.fitBounds(polylineRef.current.getBounds(), {
        padding: [50, 50]
      });
    }
  };

  return (
    <div className="relative z-0">
      <div ref={mapContainer} className="w-full h-96" />
      <div className="mt-4 font-mono text-xs grid grid-cols-2 gap-2">
        <div className="space-x-2">
          <ExternalLink size={16} className="inline" />
          <a href={`https://globe.adsbexchange.com/?icao=${flightCraft.icao_no.toLowerCase()}&zoom=8.2&showTrace=${flightDate}`} className="text-primary hover:underline" rel="nofollow noopener">ADS-B Exchange</a>,{" "}
          <a href={`https://www.flightradar24.com/data/aircraft/${flightCraft.tail_no.toLowerCase()}`} className="text-primary hover:underline" rel="nofollow noopener">FlightRadar24</a>
        </div>
        <div className="ml-auto text-right">
          <button onClick={handleReplay} className={`${isAnimating ? 'text-gray-400' : 'text-primary hover:underline'}`}>
            replay
          </button>
          <span className="mx-2">|</span>
          <button onClick={handleResetZoom} className="text-primary hover:underline">
            reset map
          </button>
        </div>
      </div>
    </div>
  );
}