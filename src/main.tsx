import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { setupServiceWorker } from './app/pwa'

const container = document.getElementById('root')
if (!container) throw new Error('Kavach: #root element is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline capability is the product. Register eagerly so a first visit caches
// everything the app needs before the network drops.
setupServiceWorker()
