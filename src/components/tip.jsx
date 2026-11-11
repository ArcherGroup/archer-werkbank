import React, { useId } from 'react'
import { MOD } from '../lib/keys'

/* Tooltip met vertraging (≈400 ms), ook op toetsenbordfocus.
   Max 60-75 tekens; een sneltoets mag als <kbd> in dezelfde bubbel.

   `kant`: onder (standaard) | boven | rechts. Rechts is de vorm voor
   lijsten: de bubbel staat naast het item in plaats van eronder. */

export function Tip({ tekst, toets, kant = 'onder', children }) {
  const id = useId()
  if (!tekst) return children
  return (
    <span className={`tip ${kant === 'boven' ? 'tip-boven' : kant === 'rechts' ? 'tip-rechts' : ''}`}>
      <span className="tip-doel" aria-describedby={id}>
        {children}
      </span>
      <span className="tip-bubbel" role="tooltip" id={id}>
        {tekst}
        {toets && <kbd>{toets}</kbd>}
      </span>
    </span>
  )
}

/* Toets: een kbd-label dat het juiste platform-symbool toont (⌘ of Ctrl). */
export function Toets({ k, shift = false }) {
  return (
    <kbd className="toets">
      {shift && '⇧'}
      {MOD}
      {k}
    </kbd>
  )
}
