import { lazy, type ComponentType } from 'react'
import { useRoutes } from 'react-router-dom'

/**
 * Device A routes — exported, then mounted by the shared router with ONE import
 * line (PARALLEL_A.md rule 3). Everything Device B ships stays untouched.
 *
 * The /dev/ui gallery is DEV-ONLY, guarded three times over, because the failure
 * mode is shipping a component gallery to judges:
 *
 *   1. The shared router imports this module through a DEV-gated DYNAMIC import.
 *      In a production build that expression becomes a stub and the chunk is
 *      never fetched, so the gallery is not merely hidden — it is absent.
 *   2. `DevUiPage` is loaded with a second DEV-gated dynamic import.
 *   3. The page component itself renders null outside DEV.
 *
 * `npm run verify:dev-route-absent` greps dist/ to prove it. That script has
 * already earned its keep: with a STATIC import of this module, the gallery's
 * module name still reached the production sourcemap even though the guard
 * inside it was correct. The guard was right; the wiring was not.
 *
 * `useRoutes` rather than returning <Route> children: React Router only reads
 * <Route> elements that are direct children of <Routes>, so returning one from a
 * child component would silently never match. Calling useRoutes here keeps the
 * route table entirely inside Device A's file, and lets this component be
 * mounted OUTSIDE the app's Suspense boundary with a null fallback — otherwise
 * suspending on the gallery chunk would blank the whole shell.
 */
const DevUiPage = import.meta.env.DEV ? lazy(() => import('../pages/DevUiPage')) : null

const ARoutes: ComponentType = () => {
  const routes = useRoutes(
    !import.meta.env.DEV || DevUiPage === null ? [] : [{ path: '/dev/ui', element: <DevUiPage /> }],
  )
  return routes
}

export default ARoutes