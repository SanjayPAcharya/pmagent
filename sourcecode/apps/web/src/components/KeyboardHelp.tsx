import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

// G4 — press "?" anywhere to see the keyboard cheatsheet. Signals a
// keyboard-first tool. Ignores the key while typing in a field.
function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable
}

export function KeyboardHelp() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: ['⌘', 'K'], label: t('shortcuts.palette') },
    { keys: ['F'], label: t('shortcuts.focus') },
    { keys: ['?'], label: t('shortcuts.help') },
    { keys: ['Enter'], label: t('shortcuts.openCard') },
    { keys: ['Esc'], label: t('shortcuts.dismiss') },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-foreground">{t('shortcuts.title')}</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-foreground" aria-label={t('shortcuts.close')}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t('shortcuts.title')}</Dialog.Description>
          <ul className="space-y-2">
            {shortcuts.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-foreground"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
