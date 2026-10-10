/**
 * Map Screen (/map) — FE-5 UI.
 *
 * Requirements & Offline Guarantees:
 *  - Must work with NO tiles (vector SVG engine rendering pack road graph and hazard zones).
 *  - Layers (bottom to top):
 *     1. Base (#E4EAEF flat ground)
 *     2. Roads (pack road graph in white)
 *     3. Zones (filled by risk level; hatch pattern for level >= 2; dashed halo for unverified reports)
 *     4. Places (shelter/hospital/police with distinct SHAPES: shield, cross, diamond)
 *     5. Route (white casing + blue line)
 *     6. User dot + accuracy ring
 *  - Legend (top-left): "Flagged by authority" (hatch swatch), "Unverified report" (dashed swatch).
 *  - Controls (top-right): Layers/filters sheet trigger, Compass trigger, Low-power toggle, Zoom controls.
 *  - Attribution: "Map data © OpenStreetMap contributors" always visible.
 *  - Place bottom sheet: Name, type, distance, bearing, "Unverified place" tag, honest time estimate:
 *    "About N min on foot. The route avoids flagged areas. It cannot promise the way is safe."
 *    Buttons: "Start route" (blue) and "Compass", with expandable StepList.
 *  - Full-screen Compass: Rotating arrow + distance + bearing text; sensor permission via permissions.ts;
 *    fallback text "Head roughly north-east, 900 m".
 *  - Fallbacks: GPS denied (manual start picker), No places (EmptyState), WebGL/error (List fallback), Low-power mode.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Icon,
  PhoneShell,
  Sheet,
  StepList,
  UnverifiedTag,
} from '../components/ui'
import { StatusChip } from '../components/ui/StatusChip'
import { useLanguage } from '../store/language'
import { useConnectivity } from '../lib/connectivity'
import { packManager } from '../lib/pack'
import { PILOT_REGION } from '../config/region'
import type { Place, RoadsFile, ZoneFeature, ZonesGeoJson } from '../lib/packTypes'
import {
  bearingToCompass,
  buildListFallback,
  computeBearing,
  computeOfflineRoute,
  formatCompassGuidance,
  formatDistance,
  getPlaceMarkerColor,
  getPlaceMarkerShape,
  getZoneColor,
  haversineDistance,
  pickGeolocationProfile,
  type ListFallbackItem,
  type RouteResult,
  type ZoneRiskMap,
} from '../lib/map'
import { requestPermission } from '../lib/permissions'

// Storage key for low-power preference
const LOW_POWER_KEY = 'kavach_low_power_mode'

// Web Mercator project / unproject helpers
function project(
  lon: number,
  lat: number,
  centre: { lon: number; lat: number },
  zoom: number,
  width: number,
  height: number,
): [number, number] {
  const scale = (256 * Math.pow(2, zoom)) / (2 * Math.PI)
  const toRad = (d: number) => (d * Math.PI) / 180
  const x = width / 2 + (toRad(lon) - toRad(centre.lon)) * scale
  const y =
    height / 2 -
    (Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2)) -
      Math.log(Math.tan(Math.PI / 4 + toRad(centre.lat) / 2))) *
      scale
  return [x, y]
}

function unproject(
  x: number,
  y: number,
  centre: { lon: number; lat: number },
  zoom: number,
  width: number,
  height: number,
): [number, number] {
  const scale = (256 * Math.pow(2, zoom)) / (2 * Math.PI)
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lonRad = (x - width / 2) / scale + (centre.lon * Math.PI) / 180
  const yRad =
    (height / 2 - y) / scale +
    Math.log(Math.tan(Math.PI / 4 + (centre.lat * Math.PI) / 360))
  const latRad = 2 * Math.atan(Math.exp(yRad)) - Math.PI / 2
  return [toDeg(lonRad), toDeg(latRad)]
}

export default function MapPage() {
  const { t } = useLanguage()
  const connectivity = useConnectivity()

  // Pack data
  const [places, setPlaces] = useState<readonly Place[]>([])
  const [roads, setRoads] = useState<RoadsFile | null>(null)
  const [zones, setZones] = useState<ZonesGeoJson | null>(null)

  // Map viewport
  const [centre, setCentre] = useState<{ lat: number; lon: number }>(() => PILOT_REGION.centre)
  const [zoom, setZoom] = useState(13.8)
  const [dimensions, setDimensions] = useState({ width: 400, height: 500 })

  // Geolocation
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(() =>
    typeof navigator === 'undefined' || !navigator.geolocation ? 'Geolocation unavailable' : null,
  )
  const [manualStart, setManualStart] = useState<{ lat: number; lon: number } | null>(null)
  const [pickingStart, setPickingStart] = useState(false)

  // Filter & Layers state
  const [placeFilter, setPlaceFilter] = useState<'all' | 'shelter' | 'medical' | 'police'>('all')
  const [showRoads, setShowRoads] = useState(true)
  const [showZones, setShowZones] = useState(true)
  const [showReports, setShowReports] = useState(true)
  const [lowPower, setLowPower] = useState(() => {
    try {
      return localStorage.getItem(LOW_POWER_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Mode: Map vs List Fallback
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')

  // Selected Place & Route
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null)
  const [isRouting, setIsRouting] = useState(false)

  // Sheets state
  const [placeSheetOpen, setPlaceSheetOpen] = useState(false)
  const [layersSheetOpen, setLayersSheetOpen] = useState(false)
  const [compassModalOpen, setCompassModalOpen] = useState(false)

  // Device orientation heading for compass
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null)
  const [motionPermissionNeeded, setMotionPermissionNeeded] = useState(() =>
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission ===
      'function',
  )

  // Dragging / pan state
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const mapContainerRef = useRef<HTMLDivElement>(null)

  // Risk Map (levels 0..4)
  const riskMap: ZoneRiskMap = useMemo(() => {
    // Flagged hazard zones for coastal storm/flood simulation
    return {
      'zone-beach-corridor': { level: 3, hazard: 'COASTAL_SURGE' },
      'zone-lowland-creek': { level: 2, hazard: 'FLASH_FLOOD' },
      'zone-temple-core': { level: 1, hazard: 'HIGH_WINDS' },
    }
  }, [])

  // Update container dimensions on resize
  useEffect(() => {
    const updateSize = () => {
      if (mapContainerRef.current) {
        const { clientWidth, clientHeight } = mapContainerRef.current
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight })
        }
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Load content pack data
  useEffect(() => {
    let mounted = true

    void Promise.all([
      packManager.getPlaces().catch(() => ({ places: [] })),
      packManager.getRoads().catch(() => null),
      packManager.getZones().catch(() => null),
    ]).then(([placesFile, roadsFile, zonesFile]) => {
      if (!mounted) return
      if (placesFile?.places) setPlaces(placesFile.places)
      if (roadsFile) setRoads(roadsFile)
      if (zonesFile) setZones(zonesFile)
    })

    return () => {
      mounted = false
    }
  }, [])

  // Geolocation watch with power profile
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return
    }

    const profile = pickGeolocationProfile({
      connectivity: connectivity.level === 'cellular' ? 'cellular-only' : connectivity.level,
      isNavigating: Boolean(activeRoute),
      batteryLow: lowPower,
    })

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLoc({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setGpsError(null)
      },
      (err) => {
        setGpsError(err.message)
      },
      {
        enableHighAccuracy: profile.enableHighAccuracy,
        timeout: profile.timeout,
        maximumAge: profile.maximumAge,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [connectivity.level, activeRoute, lowPower])

  // Device orientation event listener
  useEffect(() => {
    if (!compassModalOpen) return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading for iOS (0=North clockwise), alpha for Android
      const heading =
        (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading ??
        (e.alpha !== null ? (360 - e.alpha) % 360 : null)
      if (heading !== null && !isNaN(heading)) {
        setDeviceHeading(heading)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation, true)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true)
    }
  }, [compassModalOpen])

  // Effective user starting point (GPS or Manual start)
  const effectiveStart = useMemo(() => {
    return userLoc
      ? { lat: userLoc.lat, lon: userLoc.lon }
      : manualStart ?? PILOT_REGION.centre
  }, [userLoc, manualStart])

  // Filtered places
  const filteredPlaces = useMemo(() => {
    if (placeFilter === 'all') return places
    return places.filter((p) => {
      if (placeFilter === 'shelter') return p.type === 'shelter_candidate'
      if (placeFilter === 'medical') return p.type === 'hospital' || p.type === 'clinic'
      if (placeFilter === 'police') return p.type === 'police' || p.type === 'fire_station'
      return true
    })
  }, [places, placeFilter])

  // Nearest places for list fallback
  const listFallbackItems: ListFallbackItem[] = useMemo(() => {
    return buildListFallback(effectiveStart.lat, effectiveStart.lon, places)
  }, [effectiveStart, places])

  // Road paths SVG strings
  const roadSvgPaths = useMemo(() => {
    if (!roads || !showRoads) return []
    const nodeMap = new Map<number, [number, number]>()
    for (const [id, lat, lon] of roads.nodes) {
      const [x, y] = project(lon, lat, centre, zoom, dimensions.width, dimensions.height)
      nodeMap.set(id, [x, y])
    }

    const paths: string[] = []
    for (const [from, to] of roads.edges) {
      const p1 = nodeMap.get(from)
      const p2 = nodeMap.get(to)
      if (p1 && p2) {
        // Cull lines completely outside viewport
        const minX = Math.min(p1[0], p2[0])
        const maxX = Math.max(p1[0], p2[0])
        const minY = Math.min(p1[1], p2[1])
        const maxY = Math.max(p1[1], p2[1])
        if (maxX >= -20 && minX <= dimensions.width + 20 && maxY >= -20 && minY <= dimensions.height + 20) {
          paths.push(`M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`)
        }
      }
    }
    return paths
  }, [roads, showRoads, centre, zoom, dimensions])

  // Zone polygons SVG
  const zonePolygons = useMemo(() => {
    if (!zones || !showZones) return []
    return zones.features.map((feature) => {
      const ring = feature.geometry.coordinates[0] || []
      const points = ring
        .map(([lon, lat]) => {
          const [x, y] = project(lon, lat, centre, zoom, dimensions.width, dimensions.height)
          return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')

      const risk = riskMap[feature.id] || { level: 0 }
      const level = risk.level ?? 0
      const isHatch = level >= 2
      const fillColor = getZoneColor(level)
      const fillOpacity = level === 0 ? 0.08 : 0.25 + level * 0.1

      return {
        id: feature.id,
        name: feature.properties.name,
        points,
        fillColor,
        fillOpacity,
        isHatch,
      }
    })
  }, [zones, showZones, riskMap, centre, zoom, dimensions])

  // Route path SVG
  const routeSvgPath = useMemo(() => {
    if (!activeRoute || activeRoute.coordinates.length < 2) return null
    return activeRoute.coordinates
      .map(([lon, lat], i) => {
        const [x, y] = project(lon, lat, centre, zoom, dimensions.width, dimensions.height)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }, [activeRoute, centre, zoom, dimensions])

  // User position projection
  const userProjected = useMemo(() => {
    const pos = userLoc ?? manualStart
    if (!pos) return null
    const [x, y] = project(pos.lon, pos.lat, centre, zoom, dimensions.width, dimensions.height)
    // Approximate accuracy ring in pixels (at equator ~156543m/px at zoom 0)
    const metresPerPx =
      (156543.03392 * Math.cos((pos.lat * Math.PI) / 180)) / Math.pow(2, zoom)
    const accuracy = ('accuracy' in pos && typeof (pos as { accuracy?: number }).accuracy === 'number')
      ? (pos as { accuracy: number }).accuracy
      : 25
    const accuracyPx = Math.max(8, Math.min(80, accuracy / metresPerPx))
    return { x, y, accuracyPx, isManual: !userLoc }
  }, [userLoc, manualStart, centre, zoom, dimensions])

  // Handlers for selection & routing
  const handleSelectPlace = (place: Place) => {
    setSelectedPlace(place)
    setPlaceSheetOpen(true)
  }

  const handleStartRoute = (targetPlace: Place) => {
    setSelectedPlace(targetPlace)
    if (!roads) return
    setIsRouting(true)

    const hazardList: ZoneFeature[] = zones ? [...zones.features] : []
    const highRiskIds = Object.entries(riskMap)
      .filter(([, val]) => val.level >= 2)
      .map(([id]) => id)

    const result = computeOfflineRoute({
      start: effectiveStart,
      target: { lat: targetPlace.lat, lon: targetPlace.lon },
      roads,
      hazardZones: hazardList,
      highRiskZoneIds: highRiskIds,
    })

    setActiveRoute(result)
    setIsRouting(false)

    // Pan centre towards route midpoint
    setCentre({
      lat: (effectiveStart.lat + targetPlace.lat) / 2,
      lon: (effectiveStart.lon + targetPlace.lon) / 2,
    })
  }

  const handleClearRoute = () => {
    setActiveRoute(null)
  }

  const handleOpenCompass = (place?: Place) => {
    if (place) setSelectedPlace(place)
    setCompassModalOpen(true)
  }

  const handleRequestMotionPermission = async () => {
    const res = await requestPermission('motion')
    if (res === 'granted') {
      setMotionPermissionNeeded(false)
    }
  }

  const handleToggleLowPower = () => {
    const next = !lowPower
    setLowPower(next)
    try {
      localStorage.setItem(LOW_POWER_KEY, String(next))
    } catch {
      // Storage quota
    }
  }

  // Pointer drag / pan interaction
  const handlePointerDown = (e: React.PointerEvent) => {
    if (pickingStart) {
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top
      const [lon, lat] = unproject(clickX, clickY, centre, zoom, dimensions.width, dimensions.height)
      setManualStart({ lat, lon })
      setPickingStart(false)
      return
    }

    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    dragStartRef.current = { x: e.clientX, y: e.clientY }

    const [newLon, newLat] = unproject(
      dimensions.width / 2 - dx,
      dimensions.height / 2 - dy,
      centre,
      zoom,
      dimensions.width,
      dimensions.height,
    )
    setCentre({ lat: newLat, lon: newLon })
  }

  const handlePointerUp = () => {
    isDraggingRef.current = false
  }

  // Close sheet callbacks
  const handleClosePlaceSheet = useCallback(() => setPlaceSheetOpen(false), [])
  const handleCloseLayersSheet = useCallback(() => setLayersSheetOpen(false), [])
  const handleCloseCompass = useCallback(() => setCompassModalOpen(false), [])

  // Target metrics for selected place
  const targetMetrics = useMemo(() => {
    if (!selectedPlace) return null
    const dist = haversineDistance(
      effectiveStart.lat,
      effectiveStart.lon,
      selectedPlace.lat,
      selectedPlace.lon,
    )
    const bearing = computeBearing(
      effectiveStart.lat,
      effectiveStart.lon,
      selectedPlace.lat,
      selectedPlace.lon,
    )
    const compassDir = bearingToCompass(bearing)
    const approxMinutes = Math.max(1, Math.round(dist / (1.2 * 60)))
    const guidance = formatCompassGuidance(bearing, dist)

    return {
      dist,
      distFormatted: formatDistance(dist),
      bearing,
      compassDir,
      approxMinutes,
      guidance,
    }
  }, [selectedPlace, effectiveStart])

  // Destination for compass
  const compassTargetPlace = selectedPlace ?? listFallbackItems[0] ?? null
  const compassMetrics = useMemo(() => {
    if (!compassTargetPlace) return null
    const dist = haversineDistance(
      effectiveStart.lat,
      effectiveStart.lon,
      compassTargetPlace.lat,
      compassTargetPlace.lon,
    )
    const bearing = computeBearing(
      effectiveStart.lat,
      effectiveStart.lon,
      compassTargetPlace.lat,
      compassTargetPlace.lon,
    )
    return {
      dist,
      distFormatted: formatDistance(dist),
      bearing,
      compassDir: bearingToCompass(bearing),
      guidance: formatCompassGuidance(bearing, dist),
    }
  }, [compassTargetPlace, effectiveStart])

  return (
    <PhoneShell>
      <main className="relative flex flex-col h-[calc(100dvh-64px)] w-full overflow-hidden bg-ground select-none">
        {/* Top Header Bar */}
        <header className="z-20 flex items-center justify-between gap-2 px-4 py-2.5 bg-surface/95 backdrop-blur border-b border-line shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="map" className="h-5 w-5 shrink-0 text-brand" />
            <h1 className="text-lg font-black tracking-tight text-ink truncate">
              {t('map.title')}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
              aria-label={viewMode === 'map' ? t('map.listFallback') : t('map.mapView')}
              className="inline-flex h-9 items-center gap-1 px-2.5 rounded-10 border border-line bg-surface text-xs font-bold text-ink hover:bg-surface-sunken"
              data-testid="map-view-toggle-btn"
            >
              <Icon name={viewMode === 'map' ? 'aid' : 'map'} className="h-4 w-4" />
              <span>{viewMode === 'map' ? 'List' : 'Map'}</span>
            </button>
            <StatusChip />
          </div>
        </header>

        {/* GPS Warning Banner if GPS unavailable */}
        {gpsError && (
          <div className="z-20 flex items-center justify-between gap-2 bg-amber-50 px-3.5 py-2 border-b border-amber-200 text-xs font-semibold text-amber-950">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon name="warning" className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="truncate">{t('map.gpsUnavailable')}</span>
            </div>
            <button
              type="button"
              onClick={() => setPickingStart(!pickingStart)}
              className="shrink-0 font-bold text-verified underline text-xs"
              data-testid="map-pick-start-btn"
            >
              {pickingStart ? 'Cancel' : 'Set Start'}
            </button>
          </div>
        )}

        {/* List Fallback View when active or WebGL error */}
        {viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-20">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-ink">{t('map.nearestPlaces')}</h2>
              <span className="text-xs font-semibold text-ink-muted">
                {listFallbackItems.length} locations
              </span>
            </div>

            {listFallbackItems.length === 0 ? (
              <EmptyState title="No places found" body={t('map.emptyPlaces')} />
            ) : (
              listFallbackItems.map((item) => (
                <Card key={item.id} className="p-3.5 space-y-2 border-line hover:border-verified/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ink">{item.name}</span>
                        {!item.verified && <UnverifiedTag />}
                      </div>
                      <span className="text-xs font-semibold text-brand capitalize">
                        {item.type.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-xs font-extrabold text-ink">
                      {item.distanceFormatted}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-ink-muted flex items-center gap-1.5">
                    <Icon name="compass" className="h-3.5 w-3.5 text-verified" />
                    <span>{item.compassGuidance}</span>
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      onClick={() => {
                        const target = places.find((p) => p.id === item.id)
                        if (target) {
                          handleStartRoute(target)
                          setViewMode('map')
                        }
                      }}
                      className="flex-1 text-xs"
                      data-testid={`list-route-${item.id}`}
                    >
                      <Icon name="pin" className="h-3.5 w-3.5" />
                      <span>{t('map.startRoute')}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const target = places.find((p) => p.id === item.id)
                        if (target) handleOpenCompass(target)
                      }}
                      className="flex-1 text-xs"
                      data-testid={`list-compass-${item.id}`}
                    >
                      <Icon name="compass" className="h-3.5 w-3.5" />
                      <span>{t('map.compass')}</span>
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* SVG Vector Offline Map Container */
          <div
            ref={mapContainerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative flex-1 w-full h-full touch-none cursor-grab active:cursor-grabbing bg-[#E4EAEF]"
            data-testid="map-canvas-container"
          >
            {/* Top-Left Legend Overlay */}
            <div className="absolute top-3 start-3 z-10 flex flex-col gap-1.5 rounded-10 border border-line bg-surface/90 backdrop-blur p-2 shadow-md pointer-events-auto text-[11px] font-semibold text-ink">
              <div className="flex items-center gap-1.5">
                <span className="h-3.5 w-5 rounded-sm border border-danger/60 bg-[repeating-linear-gradient(45deg,#dc2626,#dc2626_2px,transparent_2px,transparent_6px)]" />
                <span>{t('map.legend.flagged')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3.5 w-5 rounded-sm border-2 border-dashed border-amber-500 bg-amber-100/50" />
                <span>{t('map.legend.unverified')}</span>
              </div>
            </div>

            {/* Top-Right Control Buttons */}
            <div className="absolute top-3 end-3 z-10 flex flex-col gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={() => setLayersSheetOpen(true)}
                aria-label={t('map.filter.title')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-md text-ink hover:bg-surface-sunken"
                data-testid="map-layers-btn"
              >
                <Icon name="layers" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => handleOpenCompass()}
                aria-label={t('map.compass')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-md text-brand hover:bg-surface-sunken"
                data-testid="map-compass-btn"
              >
                <Icon name="compass" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(17, z + 0.6))}
                aria-label="Zoom in"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-md text-ink font-bold text-lg hover:bg-surface-sunken"
                data-testid="map-zoom-in-btn"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(10, z - 0.6))}
                aria-label="Zoom out"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-md text-ink font-bold text-lg hover:bg-surface-sunken"
                data-testid="map-zoom-out-btn"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  if (userLoc) setCentre({ lat: userLoc.lat, lon: userLoc.lon })
                  else setCentre(PILOT_REGION.centre)
                }}
                aria-label="Recentre"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-md text-verified hover:bg-surface-sunken"
                data-testid="map-recentre-btn"
              >
                <Icon name="pin" className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Category Filter Bar */}
            <div className="absolute top-16 start-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full border border-line bg-surface/90 backdrop-blur p-1 shadow-md pointer-events-auto">
              {(['all', 'shelter', 'medical', 'police'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setPlaceFilter(filter)}
                  className={`px-3 py-1 rounded-full text-xs font-extrabold capitalize transition-colors ${
                    placeFilter === filter
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                  data-testid={`filter-${filter}`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Offline Vector SVG Canvas */}
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              className="w-full h-full"
            >
              <defs>
                {/* Diagonal hazard hatch pattern for flagged zones (level >= 2) */}
                <pattern
                  id="hazard-hatch"
                  width="10"
                  height="10"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#dc2626" strokeWidth="2.5" />
                </pattern>
              </defs>

              {/* Base Background Layer */}
              <rect width="100%" height="100%" fill="#E4EAEF" />

              {/* Roads Graph Layer (White lines) */}
              {showRoads && (
                <g id="map-roads-layer">
                  {roadSvgPaths.map((d, idx) => (
                    <path
                      key={idx}
                      d={d}
                      stroke="#ffffff"
                      strokeWidth={zoom > 14 ? 3 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      opacity={0.9}
                    />
                  ))}
                </g>
              )}

              {/* Hazard Zones Layer */}
              {showZones && (
                <g id="map-zones-layer">
                  {zonePolygons.map((z) => (
                    <g key={z.id}>
                      <polygon
                        points={z.points}
                        fill={z.fillColor}
                        fillOpacity={z.fillOpacity}
                        stroke={z.fillColor}
                        strokeWidth="1.5"
                      />
                      {z.isHatch && (
                        <polygon
                          points={z.points}
                          fill="url(#hazard-hatch)"
                          fillOpacity={0.35}
                          stroke="#dc2626"
                          strokeWidth="2"
                        />
                      )}
                    </g>
                  ))}
                </g>
              )}

              {/* Community Reports Layer (Dashed Halo) */}
              {showReports && (
                <g id="map-reports-layer">
                  {/* Sample community report marker in Mamallapuram */}
                  {(() => {
                    const [rx, ry] = project(80.198, 12.617, centre, zoom, dimensions.width, dimensions.height)
                    return (
                      <g transform={`translate(${rx}, ${ry})`}>
                        <circle
                          r="12"
                          fill="#fef3c7"
                          fillOpacity="0.4"
                          stroke="#f59e0b"
                          strokeWidth="1.5"
                          strokeDasharray="3,3"
                        />
                        <circle r="4" fill="#d97706" />
                      </g>
                    )
                  })()}
                </g>
              )}

              {/* Computed Active Route Layer (White casing + Blue Line) */}
              {routeSvgPath && (
                <g id="map-route-layer">
                  {/* Casing */}
                  <path
                    d={routeSvgPath}
                    stroke="#ffffff"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {/* Blue Core */}
                  <path
                    d={routeSvgPath}
                    stroke="#0284c7"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </g>
              )}

              {/* Places Markers Layer */}
              <g id="map-places-layer">
                {filteredPlaces.map((p) => {
                  const [px, py] = project(p.lon, p.lat, centre, zoom, dimensions.width, dimensions.height)
                  const shape = getPlaceMarkerShape(p.type)
                  const color = getPlaceMarkerColor(p.type)
                  const isSelected = selectedPlace?.id === p.id

                  return (
                    <g
                      key={p.id}
                      transform={`translate(${px}, ${py})`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectPlace(p)
                      }}
                      className="cursor-pointer transition-transform hover:scale-125"
                      data-testid={`place-marker-${p.id}`}
                    >
                      {/* Highlight ring if selected */}
                      {isSelected && (
                        <circle r="14" fill="none" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="3,3" />
                      )}

                      {/* Custom distinct SVG shapes */}
                      {shape === 'shield' && (
                        /* Shield shape for Shelter Candidate */
                        <path
                          d="M0 -9 L8 -4 L8 4 C8 8 0 12 0 12 C0 12 -8 8 -8 4 L-8 -4 Z"
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      )}
                      {shape === 'cross' && (
                        /* Cross shape for Hospital / Medical */
                        <g>
                          <circle r="9" fill="#ffffff" stroke={color} strokeWidth="1.5" />
                          <rect x="-2" y="-6" width="4" height="12" fill={color} rx="0.5" />
                          <rect x="-6" y="-2" width="12" height="4" fill={color} rx="0.5" />
                        </g>
                      )}
                      {shape === 'diamond' && (
                        /* Diamond shape for Police / Safety */
                        <polygon
                          points="0,-10 10,0 0,10 -10,0"
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      )}
                      {shape === 'circle' && (
                        <circle r="7" fill={color} stroke="#ffffff" strokeWidth="1.5" />
                      )}

                      {/* Text label at higher zoom */}
                      {zoom >= 14 && (
                        <text
                          y="18"
                          textAnchor="middle"
                          fill="#0b1f33"
                          fontSize="10"
                          fontWeight="700"
                          className="pointer-events-none drop-shadow-sm"
                        >
                          {(p.name ?? '').slice(0, 16)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>

              {/* User Position & Accuracy Ring Layer */}
              {userProjected && (
                <g id="map-user-layer" transform={`translate(${userProjected.x}, ${userProjected.y})`}>
                  {/* Accuracy Ring */}
                  <circle
                    r={userProjected.accuracyPx}
                    fill="#0284c7"
                    fillOpacity="0.12"
                    stroke="#0284c7"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                  {/* Core Dot */}
                  <circle
                    r="7"
                    fill={userProjected.isManual ? '#f59e0b' : '#0284c7'}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    className={lowPower ? '' : 'animate-pulse'}
                  />
                  <circle r="2.5" fill="#ffffff" />
                </g>
              )}
            </svg>

            {/* Active Route Floating Card Bar */}
            {activeRoute && selectedPlace && (
              <div className="absolute bottom-6 inset-x-4 z-10 pointer-events-auto">
                <Card className="p-3.5 bg-surface/95 backdrop-blur border-verified shadow-lg flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-ink truncate">
                        {selectedPlace.name}
                      </span>
                      <span className="rounded-full bg-live-tint px-2 py-0.5 text-[11px] font-bold text-live-text">
                        {formatDistance(activeRoute.lengthMetres)}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-ink-muted truncate">
                      {activeRoute.note} • ~{Math.round(activeRoute.durationSeconds / 60)} min
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenCompass(selectedPlace)}
                      aria-label="Open compass"
                      className="p-2 rounded-8 bg-surface-sunken text-verified hover:bg-surface-sunken/80 border border-line"
                      data-testid="route-compass-shortcut-btn"
                    >
                      <Icon name="compass" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClearRoute}
                      aria-label={t('map.stopRoute')}
                      className="p-2 rounded-8 bg-danger/10 text-danger hover:bg-danger/20"
                      data-testid="route-clear-btn"
                    >
                      <span className="text-sm font-black leading-none">✕</span>
                    </button>
                  </div>
                </Card>
              </div>
            )}

            {/* Bottom-End Mandatory Attribution */}
            <div className="absolute bottom-1.5 end-2 z-10 pointer-events-none text-[10px] font-medium text-ink-muted/80 bg-surface/60 backdrop-blur px-1.5 py-0.5 rounded">
              {t('map.attribution')}
            </div>
          </div>
        )}

        {/* Place Bottom Sheet */}
        <Sheet
          open={placeSheetOpen && Boolean(selectedPlace)}
          onClose={handleClosePlaceSheet}
          title={selectedPlace?.name ?? 'Selected Location'}
          closeLabel={t('ui.close')}
        >
          {selectedPlace && targetMetrics && (
            <div className="space-y-4 py-1" data-testid="place-sheet-content">
              {/* Type and verification pill */}
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-brand/10 text-brand px-2.5 py-0.5 text-xs font-bold capitalize">
                  {selectedPlace.type.replace('_', ' ')}
                </span>
                {!selectedPlace.verified && <UnverifiedTag />}
              </div>

              {/* Distance and Compass direction */}
              <div className="grid grid-cols-2 gap-2 rounded-10 bg-surface-sunken p-3 text-xs">
                <div>
                  <span className="font-semibold text-ink-muted">Distance</span>
                  <div className="text-base font-extrabold text-ink font-mono">
                    {targetMetrics.distFormatted}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-ink-muted">Bearing</span>
                  <div className="text-base font-extrabold text-ink capitalize">
                    {targetMetrics.compassDir} ({Math.round(targetMetrics.bearing)}°)
                  </div>
                </div>
              </div>

              {/* Mandatory Honest Routing Note */}
              <div className="rounded-10 border border-brand/20 bg-brand/5 p-3 text-xs font-medium text-ink leading-relaxed">
                {t('map.routeDuration', { min: targetMetrics.approxMinutes })}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="primary"
                  size="md"
                  loading={isRouting}
                  onClick={() => {
                    handleStartRoute(selectedPlace)
                    setPlaceSheetOpen(false)
                  }}
                  className="flex-1 font-bold text-sm"
                  data-testid="place-sheet-start-route-btn"
                >
                  <Icon name="pin" className="h-4 w-4" />
                  <span>{t('map.startRoute')}</span>
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setPlaceSheetOpen(false)
                    handleOpenCompass(selectedPlace)
                  }}
                  className="flex-1 font-bold text-sm"
                  data-testid="place-sheet-compass-btn"
                >
                  <Icon name="compass" className="h-4 w-4" />
                  <span>{t('map.compass')}</span>
                </Button>
              </div>

              {/* Expandable StepList if route is active for this place */}
              {activeRoute && (
                <div className="space-y-2 pt-2 border-t border-line">
                  <h3 className="text-xs font-extrabold uppercase text-ink-muted tracking-wider">
                    {t('map.steps')}
                  </h3>
                  <StepList
                    steps={[
                      `Start at current location (${effectiveStart.lat.toFixed(4)}, ${effectiveStart.lon.toFixed(4)})`,
                      'Follow highlighted road segments avoiding flagged hazard zones',
                      `Arrive at ${selectedPlace.name} (${targetMetrics.distFormatted})`,
                    ]}
                  />
                </div>
              )}
            </div>
          )}
        </Sheet>

        {/* Layers & Filters Sheet */}
        <Sheet
          open={layersSheetOpen}
          onClose={handleCloseLayersSheet}
          title={t('map.filter.title')}
          closeLabel={t('ui.close')}
        >
          <div className="space-y-4 py-1" data-testid="layers-sheet-content">
            <div className="space-y-2">
              <span className="text-xs font-bold text-ink-muted">Place Category Filter</span>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'shelter', 'medical', 'police'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPlaceFilter(filter)}
                    className={`px-3 py-1.5 rounded-10 text-xs font-bold capitalize border ${
                      placeFilter === filter
                        ? 'border-verified bg-verified text-white'
                        : 'border-line bg-surface text-ink'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-line">
              <span className="text-xs font-bold text-ink-muted">Map Layers</span>

              {/* Toggle Roads */}
              <label className="flex items-center justify-between text-sm font-semibold text-ink cursor-pointer">
                <span>{t('map.layers.roads')}</span>
                <input
                  type="checkbox"
                  checked={showRoads}
                  onChange={(e) => setShowRoads(e.target.checked)}
                  className="h-5 w-5 rounded border-line text-verified focus:ring-verified"
                />
              </label>

              {/* Toggle Hazard Zones */}
              <label className="flex items-center justify-between text-sm font-semibold text-ink cursor-pointer">
                <span>{t('map.layers.zones')}</span>
                <input
                  type="checkbox"
                  checked={showZones}
                  onChange={(e) => setShowZones(e.target.checked)}
                  className="h-5 w-5 rounded border-line text-verified focus:ring-verified"
                />
              </label>

              {/* Toggle Community Reports */}
              <label className="flex items-center justify-between text-sm font-semibold text-ink cursor-pointer">
                <span>{t('map.layers.reports')}</span>
                <input
                  type="checkbox"
                  checked={showReports}
                  onChange={(e) => setShowReports(e.target.checked)}
                  className="h-5 w-5 rounded border-line text-verified focus:ring-verified"
                />
              </label>

              {/* Low-Power Mode Toggle */}
              <label className="flex items-center justify-between text-sm font-semibold text-ink cursor-pointer pt-2 border-t border-line">
                <div>
                  <div>{t('map.lowPower')}</div>
                  <div className="text-xs font-normal text-ink-muted">Reduces GPS polling frequency</div>
                </div>
                <input
                  type="checkbox"
                  checked={lowPower}
                  onChange={handleToggleLowPower}
                  className="h-5 w-5 rounded border-line text-verified focus:ring-verified"
                />
              </label>
            </div>
          </div>
        </Sheet>

        {/* Full-Screen Compass Modal Sheet */}
        <Sheet
          open={compassModalOpen}
          onClose={handleCloseCompass}
          title={t('compass.title')}
          closeLabel={t('ui.close')}
        >
          {compassTargetPlace && compassMetrics ? (
            <div className="flex flex-col items-center text-center space-y-5 py-2" data-testid="compass-modal-content">
              {/* Target place header */}
              <div className="space-y-1">
                <div className="text-xs font-bold text-ink-muted uppercase">{t('compass.target')}</div>
                <div className="text-lg font-black text-ink">{compassTargetPlace.name}</div>
                <div className="text-sm font-mono font-bold text-brand">
                  {compassMetrics.distFormatted} • {compassMetrics.compassDir.toUpperCase()} ({Math.round(compassMetrics.bearing)}°)
                </div>
              </div>

              {/* Rotating Compass Dial & Needle */}
              <div className="relative h-48 w-48 rounded-full border-4 border-line bg-surface-sunken flex items-center justify-center shadow-inner">
                {/* Cardinal markers */}
                <span className="absolute top-2 font-black text-xs text-danger">N</span>
                <span className="absolute bottom-2 font-bold text-xs text-ink-muted">S</span>
                <span className="absolute end-2 font-bold text-xs text-ink-muted">E</span>
                <span className="absolute start-2 font-bold text-xs text-ink-muted">W</span>

                {/* Rotating Needle */}
                <div
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out"
                  style={{
                    transform: `rotate(${
                      deviceHeading !== null
                        ? (compassMetrics.bearing - deviceHeading + 360) % 360
                        : compassMetrics.bearing
                    }deg)`,
                  }}
                  data-testid="compass-needle"
                >
                  <svg viewBox="-12 -64 24 128" className="h-36 w-8 pointer-events-none">
                    {/* North/Target needle tip */}
                    <polygon points="0,-56 7,-10 -7,-10" fill="#dc2626" />
                    {/* South needle tip */}
                    <polygon points="0,56 7,10 -7,10" fill="#64748b" />
                  </svg>
                </div>

                {/* Center Pivot */}
                <div className="h-4 w-4 rounded-full bg-ink border-2 border-white shadow" />
              </div>

              {/* Plain Language Deterministic Guidance Text */}
              <div className="w-full rounded-12 border border-line bg-surface-sunken p-3 text-center space-y-1">
                <div className="text-xs font-extrabold text-ink font-mono text-base">
                  {compassMetrics.guidance}
                </div>
                {deviceHeading === null && (
                  <p className="text-[11px] font-medium text-ink-muted">
                    {t('compass.noSensor')}
                  </p>
                )}
              </div>

              {/* iOS Motion Permission Prompt if required */}
              {motionPermissionNeeded && (
                <Button
                  variant="secondary"
                  onClick={() => void handleRequestMotionPermission()}
                  className="w-full text-xs"
                >
                  {t('compass.grantPermission')}
                </Button>
              )}

              <p className="text-[11px] font-medium text-ink-muted">
                {t('compass.calibrate')}
              </p>
            </div>
          ) : (
            <div className="py-6 text-center text-sm font-medium text-ink-muted">
              {t('map.emptyPlaces')}
            </div>
          )}
        </Sheet>
      </main>
    </PhoneShell>
  )
}
