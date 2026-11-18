import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/toast'
import { useTheme } from './lib/hooks'
import { Dashboard } from './pages/Dashboard'
import { English } from './pages/English'
import { DeckPage } from './pages/DeckPage'
import { Decks } from './pages/Decks'
import { Import } from './pages/Import'
import { SettingsPage } from './pages/Settings'
import { Stats } from './pages/Stats'
import { Quotes } from './pages/Quotes'
import { Study } from './pages/Study'
import { TestRun, TestSetup } from './pages/Test'
import './lib/sync' // starts background Firebase sync
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
            <Route path="/decks" element={<Decks />} />
            <Route path="/deck/:id" element={<DeckPage />} />
            <Route path="/test" element={<TestSetup />} />
            <Route path="/french" element={<Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-muted">Loading French…</div>}><French /></Suspense>} />
            <Route path="/english" element={<English />} />
            <Route path="/import" element={<Import />} />
            <Route path="/quotes" element={<Quotes />} />
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
