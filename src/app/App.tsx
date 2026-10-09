import { HashRouter } from 'react-router-dom'
import { LanguageProvider } from '../store/LanguageProvider'
import { AppRoutes } from './routes'

/**
 * Root providers.
 *
 * HashRouter is mandatory (brief): real path-based routing breaks when the app
 * is opened offline from `file://`-like contexts or when a deep link such as
 * `/#/a/<packet>` is handed over by SMS and resolved without a server rewrite
 * to /index.html. Hash routing survives all of that with zero server config.
 */
export function App() {
  return (
    <LanguageProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </LanguageProvider>
  )
}
