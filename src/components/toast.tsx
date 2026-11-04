import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cx } from '../lib/utils'

type Tone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: ReactNode
  tone: Tone
  action?: { label: string; onClick: () => void }
}

const Ctx = createContext<(message: ReactNode, opts?: { tone?: Tone; action?: ToastItem['action'] }) => void>(() => {})

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: ReactNode, opts?: { tone?: Tone; action?: ToastItem['action'] }) => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs.slice(-2), { id, message, tone: opts?.tone ?? 'success', action: opts?.action }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), opts?.action ? 6000 : 3200)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md animate-in items-center gap-3 rounded-xl border border-line bg-surface py-2.5 pr-2.5 pl-3.5 text-sm shadow-xl shadow-black/10"
          >
            {t.tone === 'success' && <CheckCircle2 size={17} className="shrink-0 text-good" />}
            {t.tone === 'error' && <XCircle size={17} className="shrink-0 text-again" />}
            {t.tone === 'info' && <Info size={17} className="shrink-0 text-accent" />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className={cx('rounded-lg px-2.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft')}
                onClick={() => {
                  t.action!.onClick()
                  setItems((xs) => xs.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
