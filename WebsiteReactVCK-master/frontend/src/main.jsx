import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { AuthContextProvider } from './context/AuthContext.jsx'
import { HelmetProvider } from 'react-helmet-async'
import { registerSW } from 'virtual:pwa-register'

// Đăng ký Service Worker cho Progressive Web App (PWA)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true })
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
