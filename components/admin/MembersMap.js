'use client'

import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { statusConfig } from '@/components/admin/StatusBadge'

// Leaflet CSS version must match installed leaflet version
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

// Fix Leaflet default marker icons (known Next.js/webpack issue)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Stronger badge colors for Leaflet popups (always white background)
const mapStatusStyles = {
  active: { bg: '#dcfce7', color: '#166534', label: 'Activo' },
  'expiring-soon': { bg: '#fef9c3', color: '#854d0e', label: 'Vence pronto' },
  expired: { bg: '#fee2e2', color: '#991b1b', label: 'Expirado' },
  applied: { bg: '#f3e8ff', color: '#6b21a8', label: 'Aplicado' },
}

function MapStatusBadge({ status }) {
  const style = mapStatusStyles[status] || mapStatusStyles.expired
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.color }}
      className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full"
    >
      {style.label}
    </span>
  )
}

// Puerto Rico center coordinates
const PR_CENTER = [18.22, -66.59]
const PR_ZOOM = 9

/**
 * FitBoundsToMarkers - Internal component that auto-fits map to marker bounds
 * Uses useMap() hook to access the map instance
 */
function FitBoundsToMarkers({ members }) {
  const map = useMap()

  useEffect(() => {
    if (members.length === 0) return

    const bounds = L.latLngBounds(members.map((m) => [m.geoLat, m.geoLng]))
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [map, members])

  return null
}

/**
 * MapClickHandler - Internal component that captures clicks on empty map area
 * Uses useMapEvents hook to register click handler
 */
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

/**
 * MembersMap - Interactive Leaflet map showing geocoded members as pins
 *
 * Features:
 * - OpenStreetMap tiles centered on Puerto Rico
 * - Auto-fits bounds to visible markers
 * - Hover shows popup, click pins it open
 * - Circle overlay with configurable radius for area filtering
 * - Empty state message when no geocoded members
 *
 * @param {Object} props
 * @param {Array} props.members - Array of member objects from useMembers
 * @param {Array|null} props.circleCenter - [lat, lng] for circle overlay, or null
 * @param {number} props.radiusKm - Circle radius in kilometers (default 5)
 * @param {Function} props.onMapClick - Callback receiving [lat, lng] on map click
 */
export default function MembersMap({ members, circleCenter = null, radiusKm = 5, onMapClick, isGeocoding = false }) {
  const [pinnedMarker, setPinnedMarker] = useState(null)

  // Inject Leaflet CSS via CDN (avoids webpack/file-loader conflicts with node_modules CSS)
  useEffect(() => {
    if (document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = LEAFLET_CSS_URL
    document.head.appendChild(link)
  }, [])

  // Filter to only members with valid geocoding
  const geocodedMembers = useMemo(() => {
    return members.filter((m) => {
      const lat = parseFloat(m.geoLat)
      const lng = parseFloat(m.geoLng)
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    })
  }, [members])

  // Build full name from member fields
  const getFullName = (member) => {
    return [member.firstName, member.initial, member.lastName, member.slastName]
      .filter(Boolean)
      .join(' ')
  }

  if (geocodedMembers.length === 0) {
    return (
      <div className="h-[calc(100vh-380px)] w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
        {isGeocoding ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Geocodificando direcciones de miembros...
            </p>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No hay miembros con ubicacion para mostrar
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-380px)] w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <MapContainer
        center={PR_CENTER}
        zoom={PR_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsToMarkers members={geocodedMembers} />
        {geocodedMembers.map((member) => (
          <Marker
            key={member.email || `${member.geoLat}-${member.geoLng}`}
            position={[parseFloat(member.geoLat), parseFloat(member.geoLng)]}
            eventHandlers={{
              mouseover: (e) => {
                e.target.openPopup()
              },
              mouseout: (e) => {
                if (pinnedMarker !== member.email) {
                  e.target.closePopup()
                }
              },
              click: () => {
                if (pinnedMarker === member.email) {
                  setPinnedMarker(null)
                } else {
                  setPinnedMarker(member.email)
                }
              },
            }}
          >
            <Popup
              eventHandlers={{
                remove: () => {
                  if (pinnedMarker === member.email) {
                    setPinnedMarker(null)
                  }
                },
              }}
            >
              <div className="min-w-[180px]">
                <p className="font-bold text-sm text-gray-900">{getFullName(member)}</p>
                <p className="text-xs text-gray-500 mt-1">{member.email}</p>
                <div className="mt-2">
                  <MapStatusBadge status={member.status} />
                </div>
                {member.town && <p className="text-xs text-gray-400 mt-1">{member.town}</p>}
              </div>
            </Popup>
          </Marker>
        ))}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
        {circleCenter && (
          <Circle
            center={circleCenter}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
