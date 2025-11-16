"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type JobLocation = {
  id: string;
  headline: string;
  location: string | null;
  location_lat: number;
  location_lon: number;
  company_size?: string | null;
  work_modality?: string | null;
  job_url?: string | null;
  webpage_url?: string | null;
};

type MapProps = {
  onLocationChange: (lat: number, lon: number, radius: number) => void;
  initialCenter?: { lat: number; lon: number };
  initialRadius?: number;
};

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function InteractiveJobMap({ onLocationChange, initialCenter, initialRadius = 40 }: MapProps) {
  const [jobs, setJobs] = useState<JobLocation[]>([]);
  const [center, setCenter] = useState(initialCenter || { lat: 59.3293, lon: 18.0686 });
  const [radius, setRadius] = useState(initialRadius);
  const [zoom, setZoom] = useState(9);
  const [selectedJob, setSelectedJob] = useState<JobLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  
  // State for map bounds, to be debounced
  const [bounds, setBounds] = useState<any>(null);
  const debouncedBounds = useDebounce(bounds, 500);

  // --- Map Logic (moved up to be initialized before use) ---
  
  const pixelToLatLon = useCallback((x: number, y: number) => {
    const mapWidth = mapRef.current?.clientWidth || 600;
    const mapHeight = mapRef.current?.clientHeight || 400;
    const worldSize = Math.pow(2, zoom);
    const centerSinLat = Math.sin(center.lat * Math.PI / 180);
    const centerX = (center.lon + 180) / 360 * worldSize;
    const centerY = (0.5 - Math.log((1 + centerSinLat) / (1 - centerSinLat)) / (4 * Math.PI)) * worldSize;
    const targetX = (x - mapWidth / 2) / 256 + centerX;
    const targetY = (y - mapHeight / 2) / 256 + centerY;
    const lon = targetX / worldSize * 360 - 180;
    const n = Math.PI - 2 * Math.PI * targetY / worldSize;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
  }, [center, zoom]);

  const latLonToPixel = useCallback((lat: number, lon: number) => {
    const mapWidth = mapRef.current?.clientWidth || 600;
    const mapHeight = mapRef.current?.clientHeight || 400;
    const worldSize = Math.pow(2, zoom);
    const x = (lon + 180) / 360 * worldSize;
    const sinLat = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
    const centerSinLat = Math.sin(center.lat * Math.PI / 180);
    const centerX = (center.lon + 180) / 360 * worldSize;
    const centerY = (0.5 - Math.log((1 + centerSinLat) / (1 - centerSinLat)) / (4 * Math.PI)) * worldSize;
    const pixelX = (x - centerX) * 256 + mapWidth / 2;
    const pixelY = (y - centerY) * 256 + mapHeight / 2;
    return { x: pixelX, y: pixelY };
  }, [center, zoom]);

  // --- Data Fetching ---
  
  // Effect to update bounds when map moves
  useEffect(() => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const topLeft = pixelToLatLon(0, 0);
    const bottomRight = pixelToLatLon(rect.width, rect.height);
    setBounds({
      min_lon: topLeft.lon, max_lon: bottomRight.lon,
      min_lat: bottomRight.lat, max_lat: topLeft.lat,
    });
  }, [center, zoom, pixelToLatLon]);

  // Effect to fetch jobs when debounced bounds change
  useEffect(() => {
    if (!debouncedBounds) return;

    const fetchJobsInView = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/map-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(debouncedBounds),
        });
        if (!response.ok) throw new Error('Failed to fetch map jobs');
        const data = await response.json();
        setJobs(data.jobs || []);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchJobsInView();
  }, [debouncedBounds]);
  
  // Handlers for map interaction
  const handleMapClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const { lat, lon } = pixelToLatLon(event.clientX - rect.left, event.clientY - rect.top);
    setCenter({ lat, lon });
    onLocationChange(lat, lon, radius);
  }, [pixelToLatLon, radius, onLocationChange]);

  // Render logic remains similar
  return (
    <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <CardTitle>Interaktiv Jobbkarta ({isLoading ? 'Laddar...' : `${jobs.length} jobb visas`})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div ref={mapRef} onClick={handleMapClick} className="relative h-[500px] w-full cursor-pointer overflow-hidden rounded-lg border bg-blue-50">
                        {/* Center marker remains the same */}
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-blue-600">
                             <svg height="24" width="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
                        </div>

                        {/* Job Markers */}
                        {jobs.map(job => {
                            const { x, y } = latLonToPixel(job.location_lat, job.location_lon);
                            return (
                                <button key={job.id}
                                    className="absolute z-10 -translate-x-1/2 -translate-y-full"
                                    style={{ left: x, top: y, transition: 'left 0.2s, top 0.2s' }}
                                    onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}
                                    title={job.headline}>
                                    <svg height="20" width="20" viewBox="0 0 24 24" className="text-red-500 drop-shadow-lg"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
        {/* Sidebar remains the same */}
        <div className="lg:col-span-1">
             {/* ... din kod för att visa selectedJob ... */}
        </div>
    </div>
  );
}