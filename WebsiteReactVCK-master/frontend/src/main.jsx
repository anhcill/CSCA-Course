import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { AuthContextProvider } from './context/AuthContext.jsx'
import { HelmetProvider } from 'react-helmet-async'
import { installChunkErrorHandlers } from './utils/chunkRecovery.js'

axios.defaults.timeout = 30000
installChunkErrorHandlers()

// Lưu sớm sự kiện beforeinstallprompt nếu trình duyệt phát ra trước khi React mount
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__pwaDeferredPrompt = event;
  });
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
