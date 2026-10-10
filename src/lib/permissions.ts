export const permissionKinds = [
  'location',
  'camera',
  'notifications',
  'motion',
  'microphone',
  'storage',
] as const

export type PermissionKind = (typeof permissionKinds)[number]
export type RequestResult = 'granted' | 'denied' | 'unsupported' | 'dismissed'
export type PermissionQueryState = PermissionState | 'unsupported'

function isPermissionDeniedError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' ||
      error.name === 'SecurityError' ||
      error.name === 'PermissionDeniedError')
  )
}

function isPermissionDismissedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function getPermissionName(kind: PermissionKind): PermissionName | null {
  switch (kind) {
    case 'location':
      return 'geolocation'
    case 'camera':
      return 'camera'
    case 'notifications':
      return 'notifications'
    case 'motion':
      return 'device-orientation' as PermissionName
    case 'microphone':
      return 'microphone'
    default:
      return null
  }
}

async function queryPermissionState(kind: PermissionKind): Promise<PermissionQueryState> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) return 'unsupported'

  const name = getPermissionName(kind)
  if (!name) {
    if (kind === 'storage' && navigator.storage && 'persisted' in navigator.storage) {
      try {
        return (await navigator.storage.persisted()) ? 'granted' : 'prompt'
      } catch {
        return 'unsupported'
      }
    }
    return 'unsupported'
  }

  try {
    const status = await navigator.permissions.query({ name })
    return status.state
  } catch {
    return 'unsupported'
  }
}

/** Query the current browser state for a permission when the API is available. */
export async function query(kind: PermissionKind): Promise<PermissionQueryState> {
  return queryPermissionState(kind)
}

/** Request a permission with a browser-safe fallback for unsupported/dismissed states. */
export async function request(kind: PermissionKind): Promise<RequestResult> {
  if (typeof navigator === 'undefined') return 'unsupported'

  switch (kind) {
    case 'location': {
      if (!('geolocation' in navigator)) return 'unsupported'
      const state = await query('location')
      if (state === 'denied') return 'denied'
      if (state === 'granted') return 'granted'

      return await new Promise<RequestResult>((resolve) => {
        const timeout = window.setTimeout(() => resolve('dismissed'), 15000)
        navigator.geolocation.getCurrentPosition(
          () => {
            window.clearTimeout(timeout)
            resolve('granted')
          },
          (error) => {
            window.clearTimeout(timeout)
            if (error?.code === 1 || error?.code === 2) {
              resolve('denied')
              return
            }
            resolve('dismissed')
          },
          { timeout: 15000, enableHighAccuracy: true },
        )
      })
    }

    case 'camera': {
      if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach((track) => track.stop())
        return 'granted'
      } catch (error) {
        if (isPermissionDeniedError(error)) return 'denied'
        if (isPermissionDismissedError(error)) return 'dismissed'
        return 'unsupported'
      }
    }

    case 'notifications': {
      if (!('Notification' in window)) return 'unsupported'
      const status = await Notification.requestPermission()
      if (status === 'granted') return 'granted'
      if (status === 'denied') return 'denied'
      return 'dismissed'
    }

    case 'motion': {
      const Orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
      }
      if (!Orientation || typeof Orientation.requestPermission !== 'function') return 'unsupported'
      try {
        const status = await Orientation.requestPermission()
        if (status === 'granted') return 'granted'
        if (status === 'denied') return 'denied'
        return 'dismissed'
      } catch {
        return 'dismissed'
      }
    }

    case 'microphone': {
      if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        return 'granted'
      } catch (error) {
        if (isPermissionDeniedError(error)) return 'denied'
        if (isPermissionDismissedError(error)) return 'dismissed'
        return 'unsupported'
      }
    }

    case 'storage': {
      if (!navigator.storage?.persist) return 'unsupported'
      try {
        const ok = await navigator.storage.persist()
        return ok ? 'granted' : 'denied'
      } catch {
        return 'unsupported'
      }
    }
  }
}

export const requestPermission = request
export const queryPermission = query
