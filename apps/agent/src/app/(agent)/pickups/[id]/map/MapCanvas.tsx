'use client'

import 'leaflet/dist/leaflet.css'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'

// ─── The Leaflet canvas ──────────────────────────────────────────────────────
// 🔴 THIS MODULE MUST NEVER BE IMPORTED DIRECTLY BY A PAGE.
//
// Leaflet reaches for `window` at import time, so evaluating this on the server
// throws. `'use client'` alone does NOT prevent that — client components are
// still server-rendered for the initial HTML. It is only safe because JobMap.tsx
// pulls it in through `next/dynamic` with `ssr: false`, which is what actually
// keeps it out of the server pass. Import it anywhere else and the route 500s
// at request time, which `npm run build` would not catch (only `npm run smoke`
// would).
//
// STATIC on purpose: every interaction is off. Turn-by-turn navigation is cut
// (D4) and this is an orientation aid — "is that the industrial estate I think
// it is" — with the Google Maps deep link doing the actual navigating. A map
// that pans is also a map that a gloved thumb pans by accident while scrolling.

/**
 * A plain CSS pin rather than Leaflet's default marker.
 *
 * Leaflet's default icon references its PNGs by a URL it computes from the
 * stylesheet's own path, which every bundler breaks — the classic "marker is an
 * invisible broken image" bug. A `divIcon` has no assets at all, so there is
 * nothing to break, and it tracks the design tokens for free.
 */
function pinIcon() {
  return divIcon({
    className: '',
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:9999px;
      background:var(--color-primary-green);
      border:3px solid var(--color-primary-black);
      box-shadow:0 1px 4px rgba(0,0,0,.4);
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function MapCanvas({
  lat,
  lng,
  label,
}: {
  lat: number
  lng: number
  label: string
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      {/* OSM's public tile server. Attribution is required by their tile usage
          policy and is rendered by Leaflet's own attribution control. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={[lat, lng]} icon={pinIcon()} title={label} />
    </MapContainer>
  )
}
