import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/toast'
import { useTheme } from './lib/hooks'
import { Dashboard } from './pages/Dashboard'
import { English } from './pages/English'
import { DeckPage } from './pages/DeckPage'
import { Import } from './pages/Import'
import { SettingsPage } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Study } from './pages/Study'
import { TestRun, TestSetup } from './pages/Test'
import './lib/sync' // starts background sync when Supabase is configured
import './index.css'

// The French page bundles ~1,400 cards; load it only when opened.
const French = lazy(() => import('./pages/French').then((m) => ({ default: m.French })))

function App() {
  useTheme() // keep theme in sync with system changes
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/study" element={<Study />} />
          <Route path="/test/run" element={<TestRun />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/deck/:id" element={<DeckPage />} />
            <Route path="/test" element={<TestSetup />} />
            <Route path="/french" element={<Suspense fallback={<div className="h-64" />}><French /></Suspense>} />
            <Route path="/english" element={<English />} />
            <Route path="/import" element={<Import />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
