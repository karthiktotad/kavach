import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { setupServiceWorker } from './app/pwa'
import { connectivity } from './lib/connectivity'
import { outbox } from './lib/outbox'

const container = document.getElementById('root')
if (!container) throw new Error('Kavach: #root element is missing from index.html')

// Start measuring the ladder and draining the outbox before first paint, so a
// page opened from a cold, offline start is already in the right mode.
connectivity.start()
outbox.start()

createRoot(container).render(
  <StrictMode>
    {/* A crash must still leave the user able to reach alerts and SOS. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Offline capability is the product. Register the worker so the app shell is
// cached; the content pack is downloaded by PackManager into IndexedDB.
setupServiceWorker()
