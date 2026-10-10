/**
 * Permissions utility (Device B stub until Device A merges core permissions).
 */

export type PermissionKind = 'geolocation' | 'microphone'

export async function queryPermission(
  kind: PermissionKind,
): Promise<PermissionState | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported'
  }
  try {
    const status = await navigator.permissions.query({
      name: kind,
    })
    return status.state
  } catch {
    return 'unsupported'
  }
}
