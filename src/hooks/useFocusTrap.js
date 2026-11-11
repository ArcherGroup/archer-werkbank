import { useEffect } from 'react'

/* Houdt Tab en Shift+Tab binnen een open overlay. Zonder dit blijft de
   achtergrond tabbaar terwijl aria-modal="true" het tegendeel belooft.
   Werkt voor dialogen, de hulpkaart en het ⌘K-palet. */

const FOCUSBAAR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref, actief) {
  useEffect(() => {
    if (!actief) return
    const root = ref.current
    if (!root) return

    const onKeyDown = (e) => {
      if (e.key !== 'Tab' || e.defaultPrevented || e.isComposing) return
      const kandidaten = Array.from(root.querySelectorAll(FOCUSBAAR)).filter(
        (el) => el.getClientRects().length > 0,
      )
      if (!kandidaten.length) {
        e.preventDefault()
        root.focus()
        return
      }
      const eerste = kandidaten[0]
      const laatste = kandidaten[kandidaten.length - 1]
      const huidig = document.activeElement
      if (!root.contains(huidig)) {
        e.preventDefault()
        ;(e.shiftKey ? laatste : eerste).focus()
        return
      }
      if (e.shiftKey && huidig === eerste) {
        e.preventDefault()
        laatste.focus()
      } else if (!e.shiftKey && huidig === laatste) {
        e.preventDefault()
        eerste.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [ref, actief])
}