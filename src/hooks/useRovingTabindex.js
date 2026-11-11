import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Eén tabstop voor de hele lijst; pijlen en j/k verplaatsen de focus.
// Alles hangt aan `id` (nooit aan index of positie): realtime updates mogen
// rijen invoegen of verwijderen zonder de focus te laten springen.
export function useRovingTabindex(ids, { rond = false, beginId = null } = {}) {
  const knoppen = useRef(new Map()) // id -> DOM-knoop
  const vorigeIndex = useRef(0)
  const lijstHadFocus = useRef(false)
  const [actiefId, setActiefId] = useState(null)

  const bestaat = actiefId != null && ids.includes(actiefId)
  // Het tabstop begint op de huidige pagina (zijbalk), anders op het eerste item.
  const begin = beginId != null && ids.includes(beginId) ? beginId : ids[0] ?? null
  const stopId = bestaat ? actiefId : begin

  // Wisselt de pagina (beginId) zonder dat de lijst focus heeft, dan schuift het
  // tabstop mee — anders tabt de gebruiker terug naar waar hij net weg was.
  useEffect(() => {
    if (lijstHadFocus.current) return
    if (beginId != null && ids.includes(beginId)) setActiefId(beginId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginId])

  // Eén stabiele callback-ref per id; anders wisselt React bij elke render
  // alle refs los en weer vast (duur bij realtime updates).
  const registreer = useMemo(() => {
    const cache = new Map()
    return (id) => {
      if (!cache.has(id)) {
        cache.set(id, (el) => {
          if (el) knoppen.current.set(id, el)
          else knoppen.current.delete(id)
        })
      }
      return cache.get(id)
    }
  }, [])

  const focusOp = useCallback(
    (id) => {
      const el = knoppen.current.get(id)
      if (!el) return
      vorigeIndex.current = ids.indexOf(id)
      setActiefId(id)
      el.focus()
    },
    [ids],
  )

  // Verdwijnt de actieve rij (realtime!), schuif naar de dichtstbijzijnde buur.
  // Had de lijst de focus, dan nemen we die mee; anders schuift alleen het tabstop.
  useEffect(() => {
    if (!ids.length) {
      setActiefId(null)
      return
    }
    if (bestaat) return
    const doel = ids[Math.min(Math.max(vorigeIndex.current, 0), ids.length - 1)]
    setActiefId(doel)
    if (lijstHadFocus.current) knoppen.current.get(doel)?.focus()
  }, [ids, bestaat])

  const verplaats = useCallback(
    (stap) => {
      const i = Math.max(0, ids.indexOf(stopId))
      let j = i + stap
      if (rond) j = (j + ids.length) % ids.length // rond=true: doorlopen
      else j = Math.min(Math.max(j, 0), ids.length - 1)
      focusOp(ids[j])
    },
    [ids, stopId, rond, focusOp],
  )

  const onKeyDown = useCallback(
    (e) => {
      if (e.defaultPrevented || e.isComposing) return
      if (e.metaKey || e.ctrlKey || e.altKey) return // ⌘Home e.d. niet kapen
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          verplaats(1)
          break
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          verplaats(-1)
          break
        case 'Home':
          e.preventDefault()
          focusOp(ids[0])
          break
        case 'End':
          e.preventDefault()
          focusOp(ids[ids.length - 1])
          break
        // Enter en Space: de rij is een <button>, de browser activeert hem zelf.
      }
    },
    [ids, verplaats, focusOp],
  )

  const itemProps = (id) => ({
    ref: registreer(id),
    tabIndex: id === stopId ? 0 : -1,
    'data-actief': id === stopId || undefined,
    onFocus: () => {
      lijstHadFocus.current = true
      vorigeIndex.current = ids.indexOf(id)
      setActiefId(id)
    },
    onKeyDown,
  })

  // Op de lijstcontainer (bv. <aside onBlur=…>): focus naar buiten = afstaan.
  const lijstProps = {
    onBlur: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) lijstHadFocus.current = false
    },
  }

  return { itemProps, lijstProps, focusOp, actiefId: stopId }
}
