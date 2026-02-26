// lib/geocoding.js
import { writeGeoData } from './google-sheets'

/**
 * Geocode a single address using Google Geocoding API
 * Builds query from available address parts, always appending ", Puerto Rico"
 *
 * @param {{postalAddress?: string, town?: string, zipcode?: string}} addressParts
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export async function geocodeAddress(addressParts) {
  const { postalAddress, town, zipcode } = addressParts || {}

  // Build query from non-empty parts
  const parts = [postalAddress, town, zipcode].filter((p) => p && p.trim())
  if (parts.length === 0) return null

  const query = parts.join(', ') + ', Puerto Rico'

  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY
  if (!apiKey) {
    console.warn('[geocoding] GOOGLE_GEOCODING_API_KEY is not set, skipping geocode')
    return null
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location
      return { lat, lng }
    }

    if (data.status === 'ZERO_RESULTS') {
      return null
    }

    // Other errors (OVER_QUERY_LIMIT, REQUEST_DENIED, etc.)
    console.warn(`[geocoding] API returned status: ${data.status} for query: "${query}"`)
    return null
  } catch (error) {
    console.warn(`[geocoding] Failed to geocode "${query}":`, error.message)
    return null
  }
}

/**
 * Geocode members missing coordinates and write results back to the spreadsheet
 *
 * @param {Array} members - Array of member objects from getMembers()
 * @returns {Promise<{geocoded: number, skipped: number, failed: number, total: number}>}
 */
export async function geocodeMembers(members) {
  const total = members.length

  // Filter to members needing geocoding: no coordinates AND has at least one address field
  const needsGeocoding = members.filter((m) => {
    const missingCoords = m.geoLat === null && m.geoLng === null
    const hasAddress = !!(m.postalAddress || m.town || m.zipcode)
    return missingCoords && hasAddress
  })

  const skipped = total - needsGeocoding.length
  let geocoded = 0
  let failed = 0
  const results = []

  for (const member of needsGeocoding) {
    const coords = await geocodeAddress({
      postalAddress: member.postalAddress,
      town: member.town,
      zipcode: member.zipcode,
    })

    if (coords) {
      results.push({ email: member.email, lat: coords.lat, lng: coords.lng })
      geocoded++
    } else {
      failed++
    }

    // Rate limit: 200ms delay between API calls
    if (needsGeocoding.indexOf(member) < needsGeocoding.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  // Write successful results back to spreadsheet
  if (results.length > 0) {
    await writeGeoData(results)
  }

  return { geocoded, skipped, failed, total }
}
