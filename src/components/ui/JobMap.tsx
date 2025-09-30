"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Job type matching the API
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
}

type MapProps = {
  jobs: JobLocation[]
  onLocationChange: (lat: number, lon: number, radius: number) => void
  initialCenter?: { lat: number; lon: number }
  initialRadius?: number
}

export default function JobMap({ jobs, onLocationChange, initialCenter, initialRadius = 40 }: MapProps) {
  const [center, setCenter] = useState(initialCenter || { lat: 59.3293, lon: 18.0686 })
  const [radius, setRadius] = useState(initialRadius)
  const [selectedJob, setSelectedJob] = useState<JobLocation | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // For now, we'll create a simple interactive map without Google Maps API
  // This shows the concept - you can integrate Google Maps later
  const handleMapClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // Convert pixel coordinates to approximate lat/lon (simplified)
    const lat = center.lat + (y - rect.height / 2) / 1000 * -1
    const lon = center.lon + (x - rect.width / 2) / 1000

    setCenter({ lat, lon })
    onLocationChange(lat, lon, radius)
  }, [center, radius, onLocationChange])

  const handleRadiusChange = (newRadius: number) => {
    setRadius(newRadius)
    onLocationChange(center.lat, center.lon, newRadius)
  }

  // Calculate position on map for jobs
  const getJobPosition = (job: JobLocation) => {
    const x = ((job.location_lon - center.lon) * 1000 + 300)
    const y = ((center.lat - job.location_lat) * 1000 + 200)
    return { x: Math.max(0, Math.min(x, 580)), y: Math.max(0, Math.min(y, 380)) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">

      {/* Map View */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Jobblokalisering</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRadiusChange(20)}
                  className={radius === 20 ? "bg-blue-50 border-blue-200" : ""}
                >
                  20 km
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRadiusChange(40)}
                  className={radius === 40 ? "bg-blue-50 border-blue-200" : ""}
                >
                  40 km
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRadiusChange(60)}
                  className={radius === 60 ? "bg-blue-50 border-blue-200" : ""}
                >
                  60 km
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="relative w-full h-96 bg-gradient-to-br from-green-50 to-blue-50 rounded-lg border cursor-crosshair"
              onClick={handleMapClick}
            >
              {/* Map Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-100 via-blue-50 to-blue-100 rounded-lg"></div>

              {/* Search Center Circle */}
              <div
                className="absolute w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20
                }}
              />

              {/* Search Radius Circle */}
              <div
                className="absolute border-2 border-blue-400 border-dashed rounded-full bg-blue-100 bg-opacity-20"
                style={{
                  left: '50%',
                  top: '50%',
                  width: `${radius * 4}px`,
                  height: `${radius * 4}px`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10
                }}
              />

              {/* Job Markers */}
              {jobs.map((job) => {
                const pos = getJobPosition(job)
                return (
                  <div
                    key={job.id}
                    className="absolute w-3 h-3 bg-red-500 rounded-full border border-white shadow-sm hover:w-4 hover:h-4 hover:bg-red-600 cursor-pointer transition-all"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 15
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedJob(job)
                    }}
                    title={job.headline}
                  />
                )
              })}

              {/* Click Instructions */}
              <div className="absolute bottom-2 left-2 text-xs text-gray-600 bg-white px-2 py-1 rounded shadow">
                Klicka för att ändra sökområde
              </div>

              {/* Job Count Badge */}
              <div className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow text-sm font-medium">
                {jobs.length} jobb
              </div>
            </div>

            {/* Current Location Info */}
            <div className="mt-3 text-sm text-gray-600">
              <strong>Sökområde:</strong> {center.lat.toFixed(4)}, {center.lon.toFixed(4)} (radius: {radius} km)
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
                      <span className="text-sm text-gray-600">🏢 Företagsstorlek:</span>
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

                {selectedJob.job_url && (
                  <Button asChild className="w-full mt-4">
                    <a
                      href={selectedJob.job_url}
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
                  Klicka på röda markeringar på kartan för att se jobbdetaljer
                </p>
                <p className="text-sm text-gray-500">
                  Klicka på kartan för att ändra sökområde
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Snabbstatistik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center p-2 bg-blue-50 rounded">
                <div className="font-bold text-blue-600">{jobs.length}</div>
                <div className="text-gray-600">Jobb hittade</div>
              </div>
              <div className="text-center p-2 bg-green-50 rounded">
                <div className="font-bold text-green-600">{radius} km</div>
                <div className="text-gray-600">Sökradie</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}