/**
 * Routes owned by Device B:
 * - Map (/map)
 * - Assistant (/assist)
 * - SOS (/sos)
 * - Medical ID / Profile (/me)
 * - Authority Console (/authority)
 */
import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'

const MapPage = lazy(() => import('../pages/MapPage'))
const AssistPage = lazy(() => import('../pages/AssistPage'))
const AidPage = lazy(() => import('../pages/AidPage'))
const MePage = lazy(() => import('../pages/MePage'))
const AuthorityPage = lazy(() => import('../pages/AuthorityPage'))

export const bRoutes: RouteObject[] = [
  { path: '/map', Component: MapPage },
  { path: '/assist', Component: AssistPage },
  { path: '/sos', Component: AidPage },
  { path: '/aid', Component: AidPage },
  { path: '/me', Component: MePage },
  { path: '/authority', Component: AuthorityPage },
]

