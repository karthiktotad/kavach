import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { query, request } from '../src/lib/permissions'

describe('permissions request()', () => {
  const originalGeolocation = navigator.geolocation
  const originalMediaDevices = navigator.mediaDevices
  const originalNotification = globalThis.Notification
  const originalStorage = navigator.storage
  const originalPermissions = navigator.permissions

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true })
    Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true })
    Object.defineProperty(globalThis, 'Notification', {
      value: originalNotification,
      configurable: true,
    })
    Object.defineProperty(navigator, 'storage', { value: originalStorage, configurable: true })
    Object.defineProperty(navigator, 'permissions', { value: originalPermissions, configurable: true })
  })

  it('returns granted for location when the browser accepts it', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({ coords: { latitude: 12.8, longitude: 80.2 }, timestamp: Date.now() } as GeolocationPosition)
        },
      },
      configurable: true,
    })

    await expect(request('location')).resolves.toBe('granted')
  })

  it('returns denied when location permission is blocked', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
        },
      },
      configurable: true,
    })

    await expect(request('location')).resolves.toBe('denied')
  })

  it('returns dismissed when a permission prompt is ignored', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { requestPermission: vi.fn(async () => 'default') },
      configurable: true,
    })

    await expect(request('notifications')).resolves.toBe('dismissed')
  })

  it('returns unsupported when a permission is not available', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    })

    await expect(request('camera')).resolves.toBe('unsupported')
  })

  it('returns denied when camera access is blocked', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => {
          const error = new DOMException('Permission denied', 'NotAllowedError')
          throw error
        }),
      },
      configurable: true,
    })

    await expect(request('camera')).resolves.toBe('denied')
  })

  it('queries the browser permissions state when available', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: vi.fn(async () => ({ state: 'granted' })),
      },
      configurable: true,
    })

    await expect(query('location')).resolves.toBe('granted')
  })
})
