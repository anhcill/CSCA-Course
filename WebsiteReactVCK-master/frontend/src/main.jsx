import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { AuthContextProvider } from './context/AuthContext.jsx'
import { HelmetProvider } from 'react-helmet-async'
import { installChunkErrorHandlers } from './utils/chunkRecovery.js'

axios.defaults.timeout = 30000
installChunkErrorHandlers()

// Tạm thời vô hiệu hóa PWA: tự động unregister service workers và xóa cache cũ
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => {
      for (const key of keys) {
        caches.delete(key);
      }
    }).catch(() => {});
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
     <HelmetProvider> 
      <AuthContextProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      </AuthContextProvider>
     </HelmetProvider>
  </StrictMode>
)
