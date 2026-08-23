'use client'

import dynamic from 'next/dynamic'

// The client boundary that keeps Leaflet off the server. `ssr: false` is only
// legal inside a client component in Next 16 — calling it from the page (a
// server component) is a build error, which is why this thin wrapper exists
// rather than the page importing MapCanvas itself.
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  // A neutral block at the same height, so the page doesn't jump when the map
  // arrives. On a field agent's connection that gap is not instant.
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <span className="text-xs text-text-secondary">Loading map…</span>
    </div>
  ),
})

export function JobMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    // Fixed height with overflow-hidden: Leaflet sizes itself to its container,
    // and a container with no height renders a blank 0px map — the single most
    // common way this component appears "broken".
    <div className="h-64 w-full overflow-hidden rounded-[14px] border border-border">
      <MapCanvas lat={lat} lng={lng} label={label} />
    </div>
  )
}
