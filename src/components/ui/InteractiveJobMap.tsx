"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type JobLocation = {
  id: string
  headline: string
  location: string
  location_lat: number
  location_lon: number
  company_size?: string
  work_modality?: string
  s_profile?: number
  final_score?: number
  job_url?: string
  webpage_url?: string
}

type MapProps = {
  jobs: JobLocation[]
  onLocationChange: (lat: number, lon: number, radius: number) => void
  initialCenter?: { lat: number; lon: number }
  initialRadius?: number
}

export default function InteractiveJobMap({ jobs, onLocationChange, initialCenter, initialRadius = 40 }: MapProps) {
  const [center, setCenter] = useState(initialCenter || { lat: 59.3293, lon: 18.0686 })
  const [radius, setRadius] = useState(initialRadius)
  const [zoom, setZoom] = useState(1)
  const [selectedJob, setSelectedJob] = useState<JobLocation | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 })

  const mapRef = useRef<HTMLDivElement>(null)

  const MAP_WIDTH = 600
  const MAP_HEIGHT = 400

  // Convert lat/lon to pixel coordinates
  const latLonToPixel = useCallback((lat: number, lon: number) => {
    // Simple mercator-like projection centered on current view
    const x = ((lon - center.lon) * 100 * zoom) + MAP_WIDTH / 2 + mapOffset.x
    const y = ((center.lat - lat) * 100 * zoom) + MAP_HEIGHT / 2 + mapOffset.y
    return { x, y }
  }, [center, zoom, mapOffset])

  // Convert pixel coordinates to lat/lon
  const pixelToLatLon = useCallback((x: number, y: number) => {
    const lon = center.lon + (x - MAP_WIDTH / 2 - mapOffset.x) / (100 * zoom)
    const lat = center.lat - (y - MAP_HEIGHT / 2 - mapOffset.y) / (100 * zoom)
    return { lat, lon }
  }, [center, zoom, mapOffset])

  const handleMapClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const { lat, lon } = pixelToLatLon(x, y)
    setCenter({ lat, lon })
    onLocationChange(lat, lon, radius)
  }, [pixelToLatLon, radius, onLocationChange, isDragging])

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: event.clientX, y: event.clientY })
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return

    const dx = event.clientX - dragStart.x
    const dy = event.clientY - dragStart.y

    setMapOffset(prev => ({
      x: prev.x + dx * 0.5,
      y: prev.y + dy * 0.5
    }))

    setDragStart({ x: event.clientX, y: event.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleRadiusChange = (newRadius: number) => {
    setRadius(newRadius)
    onLocationChange(center.lat, center.lon, newRadius)
  }

  const handleZoom = (direction: 'in' | 'out') => {
    const newZoom = direction === 'in' ? Math.min(zoom * 1.5, 5) : Math.max(zoom / 1.5, 0.5)
    setZoom(newZoom)
  }

  const resetView = () => {
    setMapOffset({ x: 0, y: 0 })
    setZoom(1)
    setCenter(initialCenter || { lat: 59.3293, lon: 18.0686 })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Interactive Map */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Interaktiv Jobbkarta</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleZoom('in')}
                  disabled={zoom >= 5}
                >
                  Zoom In
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleZoom('out')}
                  disabled={zoom <= 0.5}
                >
                  Zoom Out
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetView}
                >
                  Återställ
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={mapRef}
              className="relative overflow-hidden rounded-lg border bg-gradient-to-br from-green-100 via-blue-50 to-blue-100"
              style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
              onClick={handleMapClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                width: MAP_WIDTH,
                height: MAP_HEIGHT
              }}
            >
              {/* Map Background Pattern */}
              <svg
                className="absolute inset-0 w-full h-full"
                style={{ pointerEvents: 'none' }}
              >
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3" />
              </svg>

              {/* Search Center */}
              <div
                className="absolute w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg z-20"
                style={{
                  left: MAP_WIDTH / 2 + mapOffset.x,
                  top: MAP_HEIGHT / 2 + mapOffset.y,
                  transform: 'translate(-50%, -50%)'
                }}
              />

              {/* Search Radius Circle */}
              <div
                className="absolute border-2 border-blue-400 border-dashed rounded-full bg-blue-100 bg-opacity-20 z-10"
                style={{
                  left: MAP_WIDTH / 2 + mapOffset.x,
                  top: MAP_HEIGHT / 2 + mapOffset.y,
                  width: radius * zoom * 2,
                  height: radius * zoom * 2,
                  transform: 'translate(-50%, -50%)'
                }}
              />

              {/* Job Markers */}
              {jobs.map((job) => {
                const pos = latLonToPixel(job.location_lat, job.location_lon)

                // Only show markers that are visible
                if (pos.x < -10 || pos.x > MAP_WIDTH + 10 || pos.y < -10 || pos.y > MAP_HEIGHT + 10) {
                  return null
                }

                return (
                  <div
                    key={job.id}
                    className="absolute z-15 cursor-pointer transition-all hover:scale-110"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      transform: 'translate(-50%, -50%)'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedJob(job)
                    }}
                    title={job.headline}
                  >
                    <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg hover:bg-red-600">
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"></div>
                    </div>
                  </div>
                )
              })}

              {/* Controls */}
              <div className="absolute bottom-2 left-2 flex flex-col gap-1">
                <div className="bg-white px-2 py-1 rounded shadow text-xs">
                  Zoom: {zoom.toFixed(1)}x
                </div>
                <div className="bg-white px-2 py-1 rounded shadow text-xs">
                  Klicka = flytta centrum
                </div>
                <div className="bg-white px-2 py-1 rounded shadow text-xs">
                  Dra = panorera
                </div>
              </div>

              {/* Radius Controls */}
              <div className="absolute top-2 left-2 flex gap-1">
                {[20, 40, 60].map(r => (
                  <Button
                    key={r}
                    variant={radius === r ? "default" : "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRadiusChange(r)
                    }}
                    className="text-xs"
                  >
                    {r}km
                  </Button>
                ))}
              </div>

              {/* Job Count */}
              <div className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow text-sm font-medium">
                {jobs.length} jobb
              </div>
            </div>

            {/* Coordinates Display */}
            <div className="mt-3 text-sm text-gray-600 grid grid-cols-2 gap-4">
              <div>
                <strong>Centrum:</strong> {center.lat.toFixed(4)}, {center.lon.toFixed(4)}
              </div>
              <div>
                <strong>Sökradie:</strong> {radius} km
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Details Sidebar */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedJob ? 'Jobbdetaljer' : 'Välj ett jobb på kartan'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedJob ? (
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">{selectedJob.headline}</h3>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">📍 Plats:</span>
                    <span className="text-sm">{selectedJob.location}</span>
                  </div>

                  {selectedJob.work_modality && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">💼 Arbetssätt:</span>
                      <Badge variant="outline">{selectedJob.work_modality}</Badge>
                    </div>
                  )}

                  {selectedJob.company_size && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">🏢 Företag:</span>
                      <Badge variant="secondary">{selectedJob.company_size}</Badge>
                    </div>
                  )}

                  {selectedJob.s_profile && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">🎯 Matchning:</span>
                      <span className="text-sm font-medium text-blue-600">
                        {Math.round(selectedJob.s_profile * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {(selectedJob.job_url || selectedJob.webpage_url) && (
                  <Button asChild className="w-full mt-4">
                    <a
                      href={selectedJob.job_url || selectedJob.webpage_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Öppna annons →
                    </a>
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={() => setSelectedJob(null)}
                  className="w-full"
                >
                  Stäng
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🗺️</div>
                <p className="text-gray-600 mb-4">
                  Klicka på röda markeringar för jobbdetaljer
                </p>
                <p className="text-sm text-gray-500">
                  Använd zoom och drag för att navigera kartan
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map Stats */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Kartstatistik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center p-2 bg-blue-50 rounded">
                <div className="font-bold text-blue-600">{jobs.length}</div>
                <div className="text-gray-600">Synliga jobb</div>
              </div>
              <div className="text-center p-2 bg-green-50 rounded">
                <div className="font-bold text-green-600">{zoom.toFixed(1)}x</div>
                <div className="text-gray-600">Zoom nivå</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}