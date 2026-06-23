import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { keycloak } from './lib/auth'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Initialize Keycloak once, then render. Returning from the hosted login (code
// in the URL) is processed here and flips keycloak.authenticated to true.
keycloak
  .init({ pkceMethod: 'S256' })
  .then((authenticated) => {
    if (authenticated) {
      keycloak.onTokenExpired = () => {
        void keycloak.updateToken(30).catch(() => keycloak.login())
      }
    }
    root.render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </React.StrictMode>,
    )
  })
  .catch(() => {
    root.render(<div style={{ padding: 24 }}>Failed to initialize authentication.</div>)
  })
