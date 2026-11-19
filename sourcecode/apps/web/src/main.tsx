import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { keycloak, watchSession } from './lib/auth'
import { applyTheme, getInitialTheme } from './lib/theme'
import './lib/i18n'
import App from './App'
import { AppToaster } from './components/AppToaster'
import './index.css'

// Apply the saved/OS theme before first paint to avoid a flash.
applyTheme(getInitialTheme())

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Initialize Keycloak once, then render. Returning from the hosted login (code
// in the URL) is processed here and flips keycloak.authenticated to true.
keycloak
  .init({
    pkceMethod: 'S256',
    // Silently restore an existing Keycloak session on load (e.g. after a hard
    // refresh or opening a deep link) via a hidden iframe — no visible redirect.
    onLoad: 'check-sso',
    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
  })
  .then((authenticated) => {
    // 3.8.8: a session that ends later shows the session-expired prompt
    // instead of redirecting mid-task.
    if (authenticated) watchSession()
    root.render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
          <AppToaster />
        </QueryClientProvider>
      </React.StrictMode>,
    )
  })
  .catch(() => {
    root.render(<div style={{ padding: 24 }}>Failed to initialize authentication.</div>)
  })
